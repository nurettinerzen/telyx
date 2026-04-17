import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createRequire } from 'module';
import elevenLabsService from '../services/elevenlabs.js';
import { PDFParse } from 'pdf-parse';
// V1 MVP: Global limit enforcement
import { checkKBItemLimit, checkKBStorageLimit, getURLCrawlLimit } from '../services/globalLimits.js';
// P0 SECURITY: SSRF protection
import { validateUrlForSSRF, logSSRFAttempt } from '../utils/ssrf-protection.js';
import {
  resolveUntrustedUploadDir,
  generateSafeUploadFilename,
  validateUntrustedUpload,
} from '../security/uploadSecurity.js';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

const router = express.Router();
const KNOWLEDGE_UPLOAD_DIR = resolveUntrustedUploadDir('knowledge');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, KNOWLEDGE_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, generateSafeUploadFilename(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.txt', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, TXT, and CSV are allowed.'));
    }
  }
});

async function removeKnowledgeDocumentFromAllAssistants(businessId, documentId) {
  if (!businessId || !documentId) return;

  const assistants = await prisma.assistant.findMany({
    where: { businessId, isActive: true },
    select: { elevenLabsAgentId: true, name: true }
  });

  for (const assistant of assistants) {
    if (!assistant.elevenLabsAgentId) continue;

    try {
      await elevenLabsService.removeKnowledgeFromAgent(assistant.elevenLabsAgentId, documentId);
    } catch (error) {
      console.error(`11Labs removeKnowledgeFromAgent failed for assistant "${assistant.name}":`, error.message);
    }
  }
}

// GET /api/knowledge - Get all knowledge base items (documents, faqs, urls)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    
    // Return empty structure if no businessId
    if (!businessId) {
      return res.json({ documents: [], faqs: [], urls: [] });
    }

    let documents = [];
    let faqs = [];
    let urls = [];

    try {
      [documents, faqs, urls] = await Promise.all([
        prisma.knowledgeBase.findMany({
          where: { businessId, type: 'DOCUMENT' },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.knowledgeBase.findMany({
          where: { businessId, type: 'FAQ' },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.knowledgeBase.findMany({
          where: { businessId, type: 'URL' },
          orderBy: { createdAt: 'desc' }
        })
      ]);
    } catch (dbError) {
      console.log('KnowledgeBase query error, returning empty arrays:', dbError.message);
    }

    res.json({ documents, faqs, urls });
  } catch (error) {
    console.error('Error fetching knowledge base:', error);
    // Return empty arrays instead of error for better UX
    res.json({ documents: [], faqs: [], urls: [] });
  }
});

// GET /api/knowledge/documents
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;

    // Try to fetch documents, return empty array if table doesn't exist yet
    try {
      const documents = await prisma.knowledgeBase.findMany({
        where: {
          businessId,
          type: 'DOCUMENT'
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ documents });
    } catch (dbError) {
      console.log('KnowledgeBase table may not exist yet, returning empty array');
      res.json({ documents: [] });
    }
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.json({ documents: [] }); // Return empty array instead of error
  }
});

// GET /api/knowledge/documents/:id - Get single document with content
router.get('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const document = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        type: 'DOCUMENT'
      }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ document });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// GET /api/knowledge/urls/:id - Get single URL with content
router.get('/urls/:id', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const url = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        type: 'URL'
      }
    });

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    res.json({ url });
  } catch (error) {
    console.error('Error fetching URL:', error);
    res.status(500).json({ error: 'Failed to fetch URL' });
  }
});

// Helper function to extract text from PDF (using pdf-parse v2 API)
async function extractTextFromPDF(filePath) {
  try {
    // pdf-parse v2: use file:// URL for local files
    const fileUrl = `file://${filePath}`;
    const parser = new PDFParse({ url: fileUrl });
    const result = await parser.getText();
    await parser.destroy(); // Clean up resources
    return result.text?.trim() || '';
  } catch (error) {
    console.error('PDF parsing error:', error);
    // Try fallback with data buffer
    try {
      const dataBuffer = await fs.readFile(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      await parser.destroy();
      return result.text?.trim() || '';
    } catch (fallbackError) {
      console.error('PDF parsing fallback also failed:', fallbackError);
      throw new Error('Failed to extract text from PDF');
    }
  }
}

// Helper function to extract text from DOCX
async function extractTextFromDOCX(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Failed to extract text from DOCX');
  }
}

// Helper function to extract text from TXT/CSV
async function extractTextFromTXT(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error('TXT reading error:', error);
    throw new Error('Failed to read text file');
  }
}

// POST /api/knowledge/documents - Upload document
router.post('/documents', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const businessId = req.businessId;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      await validateUntrustedUpload({
        filePath: req.file.path,
        fileName: req.file.originalname,
        maxSizeBytes: 10 * 1024 * 1024,
      });
    } catch (scanError) {
      try {
        await fs.unlink(req.file.path);
      } catch (_cleanupError) {
        // ignore cleanup failures
      }
      return res.status(400).json({
        error: 'Uploaded file failed security scanning',
        code: scanError.message,
      });
    }

    // V1 MVP: Check KB item count limit BEFORE upload
    const itemCheck = await checkKBItemLimit(businessId, 1);
    if (!itemCheck.allowed) {
      // Delete uploaded file (cleanup)
      try {
        await fs.unlink(req.file.path);
      } catch (e) {
        console.error('Failed to delete file after limit check:', e);
      }

      return res.status(403).json({
        error: itemCheck.error.code,
        message: itemCheck.error.message,
        current: itemCheck.current,
        limit: itemCheck.limit
      });
    }

    // V1 MVP: Check KB storage limit BEFORE upload
    const storageCheck = await checkKBStorageLimit(businessId, req.file.size);
    if (!storageCheck.allowed) {
      // Delete uploaded file (cleanup)
      try {
        await fs.unlink(req.file.path);
      } catch (e) {
        console.error('Failed to delete file after storage check:', e);
      }

      return res.status(403).json({
        error: storageCheck.error.code,
        message: storageCheck.error.message,
        currentMB: storageCheck.currentMB,
        fileSizeMB: storageCheck.fileSizeMB,
        limitMB: storageCheck.limitMB
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();

    // Create initial database entry
    const document = await prisma.knowledgeBase.create({
      data: {
        businessId,
        type: 'DOCUMENT',
        title: req.file.originalname,
        fileName: req.file.filename,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        filePath: req.file.path,
        status: 'PROCESSING'
      }
    });

    // Process file asynchronously
    processDocument(document.id, req.file.path, ext, businessId).catch(error => {
      console.error('Document processing failed:', error);
    });

    res.json({ 
      document, 
      message: 'Document uploaded and processing started' 
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Async function to process document
async function processDocument(documentId, filePath, ext, businessId) {
  try {
    let content = '';
    
    // Extract text based on file type
    switch (ext) {
      case '.pdf':
        content = await extractTextFromPDF(filePath);
        break;
      case '.docx':
        content = await extractTextFromDOCX(filePath);
        break;
      case '.txt':
      case '.csv':
        content = await extractTextFromTXT(filePath);
        break;
      default:
        throw new Error('Unsupported file type');
    }

    // Get ALL active assistants with 11Labs agent ID for this business
    const assistants = await prisma.assistant.findMany({
      where: { businessId, isActive: true },
      select: { id: true, elevenLabsAgentId: true, name: true }
    });

    // Get document info for name
    const document = await prisma.knowledgeBase.findUnique({
      where: { id: documentId }
    });

    const elevenLabsDocIds = [];

    // Upload to 11Labs for ALL assistants
    for (const assistant of assistants) {
      if (assistant.elevenLabsAgentId) {
        try {
          // Use original filename as document name
          const docName = document.title || document.fileName || `Document_${documentId.substring(0, 8)}`;
          const elevenLabsDoc = await elevenLabsService.addKnowledgeDocument(assistant.elevenLabsAgentId, {
            name: docName,
            content: content
          });
          if (elevenLabsDoc?.id) {
            elevenLabsDocIds.push({ assistantId: assistant.id, docId: elevenLabsDoc.id });
            console.log(`✅ Document uploaded to 11Labs for assistant "${assistant.name}": ${elevenLabsDoc.id}`);
          }
        } catch (elevenLabsError) {
          console.error(`11Labs upload failed for assistant "${assistant.name}":`, elevenLabsError);
          // Continue with other assistants even if one fails
        }
      }
    }

    // Update document with extracted content
    // Store first elevenLabsDocId for backward compatibility (or could store all in JSON)
    await prisma.knowledgeBase.update({
      where: { id: documentId },
      data: {
        content,
        status: 'ACTIVE',
        ...(elevenLabsDocIds.length > 0 && { elevenLabsDocId: elevenLabsDocIds[0].docId })
      }
    });

    console.log(`✅ Document ${documentId} processed successfully`);
    
  } catch (error) {
    console.error(`❌ Document ${documentId} processing failed:`, error);

    // Mark as failed with error message
    await prisma.knowledgeBase.update({
      where: { id: documentId },
      data: {
        status: 'FAILED',
        content: `Error: ${error.message || 'Unknown error during processing'}`
      }
    });
  }
}

// DELETE /api/knowledge/documents/:id
router.delete('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    // Find document
    const document = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        type: 'DOCUMENT'
      }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from 11Labs if we have the document ID
    if (document.elevenLabsDocId) {
      try {
        await removeKnowledgeDocumentFromAllAssistants(businessId, document.elevenLabsDocId);
        // Then delete the document from 11Labs
        await elevenLabsService.deleteKnowledgeDocument(document.elevenLabsDocId);
      } catch (elevenLabsError) {
        console.error('11Labs delete failed:', elevenLabsError);
        // Continue even if 11Labs delete fails
      }
    }

    // Delete file from filesystem
    if (document.filePath) {
      try {
        await fs.unlink(document.filePath);
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }

    // Delete from database
    await prisma.knowledgeBase.delete({
      where: { id }
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// GET /api/knowledge/faqs
router.get('/faqs', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    
    try {
      const faqs = await prisma.knowledgeBase.findMany({
        where: { 
          businessId,
          type: 'FAQ'
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ faqs });
    } catch (dbError) {
      console.log('KnowledgeBase table may not exist yet, returning empty array');
      res.json({ faqs: [] });
    }
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.json({ faqs: [] });
  }
});

// POST /api/knowledge/faqs
router.post('/faqs', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { question, answer, category } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    // V1 MVP: Check KB item count limit BEFORE creating FAQ
    const itemCheck = await checkKBItemLimit(businessId, 1);
    if (!itemCheck.allowed) {
      return res.status(403).json({
        error: itemCheck.error.code,
        message: itemCheck.error.message,
        current: itemCheck.current,
        limit: itemCheck.limit
      });
    }

    // Get ALL active assistants with 11Labs agent ID
    const assistants = await prisma.assistant.findMany({
      where: { businessId, isActive: true },
      select: { id: true, elevenLabsAgentId: true, name: true }
    });

    const elevenLabsDocIds = [];

    // Upload to 11Labs for ALL assistants
    for (const assistant of assistants) {
      if (assistant.elevenLabsAgentId) {
        try {
          const content = `Q: ${question}\nA: ${answer}`;
          const faqName = `FAQ: ${question.substring(0, 50)}`;
          const elevenLabsDoc = await elevenLabsService.addKnowledgeDocument(assistant.elevenLabsAgentId, {
            name: faqName,
            content: content
          });
          if (elevenLabsDoc?.id) {
            elevenLabsDocIds.push({ assistantId: assistant.id, docId: elevenLabsDoc.id });
            console.log(`✅ FAQ uploaded to 11Labs for assistant "${assistant.name}": ${elevenLabsDoc.id}`);
          }
        } catch (elevenLabsError) {
          console.error(`11Labs FAQ upload failed for assistant "${assistant.name}":`, elevenLabsError);
        }
      }
    }

    const faq = await prisma.knowledgeBase.create({
      data: {
        businessId,
        type: 'FAQ',
        title: question.substring(0, 100),
        question,
        answer,
        category,
        elevenLabsDocId: elevenLabsDocIds.length > 0 ? elevenLabsDocIds[0].docId : null,
        status: 'ACTIVE'
      }
    });

    res.json({ faq, message: 'FAQ created successfully' });
  } catch (error) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

// DELETE /api/knowledge/faqs/:id
router.delete('/faqs/:id', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const faq = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        type: 'FAQ'
      }
    });

    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    // Delete from 11Labs if we have the document ID
    if (faq.elevenLabsDocId) {
      try {
        await removeKnowledgeDocumentFromAllAssistants(businessId, faq.elevenLabsDocId);
        await elevenLabsService.deleteKnowledgeDocument(faq.elevenLabsDocId);
      } catch (elevenLabsError) {
        console.error('11Labs delete failed:', elevenLabsError);
      }
    }

    await prisma.knowledgeBase.delete({
      where: { id }
    });

    res.json({ message: 'FAQ deleted successfully' });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});

// Helper function to scrape URL content and extract links
async function scrapeURL(url, extractLinks = false) {
  try {
    // P0 SECURITY: SSRF protection - validate URL before making request
    const ssrfCheck = await validateUrlForSSRF(url);
    if (!ssrfCheck.safe) {
      console.error('🚨 [SSRF] Blocked URL crawl attempt:', {
        url,
        reason: ssrfCheck.reason
      });
      return {
        title: url,
        content: '',
        links: [],
        success: false,
        error: `Security: ${ssrfCheck.reason}`
      };
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Extract links before removing elements (if needed)
    let links = [];
    if (extractLinks) {
      const baseUrl = new URL(url);
      $('a[href]').each((_, el) => {
        try {
          const href = $(el).attr('href');
          if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
            return;
          }
          // Convert relative URLs to absolute
          const absoluteUrl = new URL(href, url).href;
          // Only include links from same domain
          const linkUrl = new URL(absoluteUrl);
          if (linkUrl.hostname === baseUrl.hostname && !links.includes(absoluteUrl)) {
            links.push(absoluteUrl);
          }
        } catch (e) {
          // Invalid URL, skip
        }
      });
    }

    // Remove script and style elements
    $('script, style, nav, header, footer, aside, noscript, iframe').remove();

    // Extract text content
    const title = $('title').text().trim();
    const bodyText = $('body').text().trim().replace(/\s+/g, ' ');

    return {
      title,
      content: bodyText,
      links,
      success: true
    };
  } catch (error) {
    console.error('URL scraping error:', error.message);
    return {
      title: url,
      content: '',
      links: [],
      success: false,
      error: error.message
    };
  }
}

// GET /api/knowledge/urls
router.get('/urls', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    
    try {
      const urls = await prisma.knowledgeBase.findMany({
        where: { 
          businessId,
          type: 'URL'
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ urls });
    } catch (dbError) {
      console.log('KnowledgeBase table may not exist yet, returning empty array');
      res.json({ urls: [] });
    }
  } catch (error) {
    console.error('Error fetching URLs:', error);
    res.json({ urls: [] });
  }
});

// POST /api/knowledge/urls
router.post('/urls', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { url, crawlDepth, autoScan, scanInterval } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // P0 SECURITY: SSRF protection - validate URL before crawling
    const ssrfCheck = await validateUrlForSSRF(url);
    if (!ssrfCheck.safe) {
      console.error('🚨 [SSRF] Blocked URL submission:', {
        url,
        reason: ssrfCheck.reason,
        businessId,
        userId: req.userId
      });

      await logSSRFAttempt({
        url,
        reason: ssrfCheck.reason,
        businessId,
        userId: req.userId,
        timestamp: new Date().toISOString()
      }, req);

      return res.status(400).json({
        error: 'URL not allowed',
        reason: ssrfCheck.reason
      });
    }

    // V1 MVP: Check KB item count limit BEFORE crawling
    const itemCheck = await checkKBItemLimit(businessId, 1);
    if (!itemCheck.allowed) {
      return res.status(403).json({
        error: itemCheck.error.code,
        message: itemCheck.error.message,
        current: itemCheck.current,
        limit: itemCheck.limit
      });
    }

    // V1 MVP: Use global crawl depth limit
    const maxCrawlPages = getURLCrawlLimit();
    const effectiveCrawlDepth = Math.min(crawlDepth || 1, maxCrawlPages);

    // Create database entry
    const urlEntry = await prisma.knowledgeBase.create({
      data: {
        businessId,
        type: 'URL',
        title: url,
        url,
        crawlDepth: effectiveCrawlDepth, // V1 MVP: Limited by global limit
        pageCount: 0,
        status: 'PROCESSING',
        autoScan: autoScan || false,
        scanInterval: scanInterval || 24 // Default: günde bir kez
      }
    });

    // Start crawling asynchronously
    crawlURL(urlEntry.id, url).catch(error => {
      console.error('URL crawling failed:', error);
    });

    res.json({ url: urlEntry, message: 'URL added and crawling started' });
  } catch (error) {
    console.error('Error adding URL:', error);
    res.status(500).json({ error: 'Failed to add URL' });
  }
});

// Async function to crawl URL with depth support
async function crawlURL(entryId, url) {
  try {
    // Get entry to find businessId and crawlDepth
    const entry = await prisma.knowledgeBase.findUnique({
      where: { id: entryId },
      select: { businessId: true, crawlDepth: true }
    });

    const maxDepth = entry.crawlDepth || 1;
    const crawledUrls = new Set();
    const allContent = [];
    let totalPages = 0;
    let mainTitle = '';

    // BFS crawling with depth limit
    const urlQueue = [{ url, depth: 1 }];

    while (urlQueue.length > 0 && totalPages < 50) { // Max 50 pages to prevent infinite crawling
      const { url: currentUrl, depth } = urlQueue.shift();

      // Skip if already crawled
      if (crawledUrls.has(currentUrl)) continue;
      crawledUrls.add(currentUrl);

      console.log(`🔍 Crawling (depth ${depth}/${maxDepth}): ${currentUrl}`);

      // Scrape with link extraction if we need to go deeper
      const needLinks = depth < maxDepth;
      const result = await scrapeURL(currentUrl, needLinks);

      if (result.success && result.content) {
        totalPages++;

        // Save main title from first page
        if (!mainTitle && result.title) {
          mainTitle = result.title;
        }

        // Add content with page info
        allContent.push(`--- Sayfa: ${currentUrl} ---\n${result.content}`);

        // Add child links to queue if we haven't reached max depth
        if (needLinks && result.links?.length > 0) {
          for (const link of result.links) {
            if (!crawledUrls.has(link) && urlQueue.length < 100) {
              urlQueue.push({ url: link, depth: depth + 1 });
            }
          }
        }
      }

      // Small delay between requests to be respectful
      if (urlQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (totalPages === 0) {
      // No pages crawled successfully
      const result = await scrapeURL(url, false);
      await prisma.knowledgeBase.update({
        where: { id: entryId },
        data: {
          status: 'FAILED',
          content: `Error: ${result.error || 'No content could be extracted'}`
        }
      });
      console.log(`❌ URL ${entryId} crawling failed - no pages`);
      return;
    }

    // Combine all content
    const combinedContent = allContent.join('\n\n');

    // Get ALL active assistants with 11Labs agent ID
    const assistants = await prisma.assistant.findMany({
      where: { businessId: entry.businessId, isActive: true },
      select: { id: true, elevenLabsAgentId: true, name: true }
    });

    const elevenLabsDocIds = [];

    // Upload combined content to 11Labs for ALL assistants
    for (const assistant of assistants) {
      if (assistant.elevenLabsAgentId) {
        try {
          const docName = `${mainTitle || url} (${totalPages} sayfa)`;
          const elevenLabsDoc = await elevenLabsService.addKnowledgeDocument(assistant.elevenLabsAgentId, {
            name: docName,
            content: combinedContent
          });
          if (elevenLabsDoc?.id) {
            elevenLabsDocIds.push({ assistantId: assistant.id, docId: elevenLabsDoc.id });
            console.log(`✅ ${totalPages} pages uploaded to 11Labs for assistant "${assistant.name}": ${elevenLabsDoc.id}`);
          }
        } catch (elevenLabsError) {
          console.error(`11Labs upload failed for assistant "${assistant.name}":`, elevenLabsError);
        }
      }
    }

    await prisma.knowledgeBase.update({
      where: { id: entryId },
      data: {
        title: mainTitle || url,
        content: combinedContent,
        pageCount: totalPages,
        lastCrawled: new Date(),
        elevenLabsDocId: elevenLabsDocIds.length > 0 ? elevenLabsDocIds[0].docId : null,
        status: 'ACTIVE'
      }
    });
    console.log(`✅ URL ${entryId} crawled successfully - ${totalPages} pages`);

  } catch (error) {
    console.error(`❌ URL ${entryId} crawling error:`, error);
    await prisma.knowledgeBase.update({
      where: { id: entryId },
      data: {
        status: 'FAILED',
        content: `Error: ${error.message || 'Unknown error'}`
      }
    });
  }
}

// PUT /api/knowledge/urls/:id - Update URL settings (autoScan, scanInterval, etc.)
router.put('/urls/:id', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;
    const { autoScan, scanInterval, crawlDepth } = req.body;

    const urlEntry = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        type: 'URL'
      }
    });

    if (!urlEntry) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const updateData = {};
    if (typeof autoScan === 'boolean') updateData.autoScan = autoScan;
    if (typeof scanInterval === 'number') updateData.scanInterval = scanInterval;
    if (typeof crawlDepth === 'number') updateData.crawlDepth = crawlDepth;

    const updatedUrl = await prisma.knowledgeBase.update({
      where: { id },
      data: updateData
    });

    res.json({ url: updatedUrl, message: 'URL settings updated' });
  } catch (error) {
    console.error('Error updating URL:', error);
    res.status(500).json({ error: 'Failed to update URL' });
  }
});

// POST /api/knowledge/urls/:id/rescan - Yeniden tarama (manuel)
router.post('/urls/:id/rescan', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const urlEntry = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        type: 'URL'
      }
    });

    if (!urlEntry) {
      return res.status(404).json({ error: 'URL not found' });
    }

    // Update status to processing
    await prisma.knowledgeBase.update({
      where: { id },
      data: { status: 'PROCESSING' }
    });

    // Start re-crawling asynchronously
    crawlURL(id, urlEntry.url).catch(error => {
      console.error('URL re-crawling failed:', error);
    });

    res.json({ message: 'URL rescan started', url: urlEntry });
  } catch (error) {
    console.error('Error rescanning URL:', error);
    res.status(500).json({ error: 'Failed to rescan URL' });
  }
});

// DELETE /api/knowledge/urls/:id
router.delete('/urls/:id', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const urlEntry = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        type: 'URL'
      }
    });

    if (!urlEntry) {
      return res.status(404).json({ error: 'URL not found' });
    }

    // Delete from 11Labs if we have the document ID
    if (urlEntry.elevenLabsDocId) {
      try {
        await removeKnowledgeDocumentFromAllAssistants(businessId, urlEntry.elevenLabsDocId);
        await elevenLabsService.deleteKnowledgeDocument(urlEntry.elevenLabsDocId);
      } catch (elevenLabsError) {
        console.error('11Labs delete failed:', elevenLabsError);
      }
    }

    await prisma.knowledgeBase.delete({
      where: { id }
    });

    res.json({ message: 'URL deleted successfully' });
  } catch (error) {
    console.error('Error deleting URL:', error);
    res.status(500).json({ error: 'Failed to delete URL' });
  }
});

// Export crawlURL for cron job usage
export { crawlURL };
export default router;

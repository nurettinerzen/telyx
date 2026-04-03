import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { validateUntrustedUpload } from '../security/uploadSecurity.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all products
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, category, lowStock } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      businessId: req.businessId,
      ...(category && { category }),
      ...(lowStock === 'true' && {
        stockQuantity: {
          lte: prisma.raw('"lowStockThreshold"'),
        },
      }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { businessId: req.businessId },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where: { businessId: req.businessId } }),
    ]);

    res.json({
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get low stock products
router.get('/products/low-stock', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.$queryRaw`
      SELECT * FROM "Product"
      WHERE "businessId" = ${req.businessId}
      AND "stockQuantity" <= "lowStockThreshold"
      AND "isActive" = true
      ORDER BY "stockQuantity" ASC
    `;

    res.json(products);
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

// Get single product
router.get('/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: {
        id: parseInt(req.params.id),
        businessId: req.businessId,
      },
      include: {
        inventoryLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product
router.post('/products', authenticateToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { sku, name, description, price, stockQuantity, lowStockThreshold, category, imageUrl } = req.body;

    if (!sku || !name || price === undefined) {
      return res.status(400).json({ error: 'SKU, name, and price are required' });
    }

    // Check if SKU already exists for this business
    const existing = await prisma.product.findFirst({
      where: {
        businessId: req.businessId,
        sku,
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Product with this SKU already exists' });
    }

    const product = await prisma.product.create({
      data: {
        businessId: req.businessId,
        sku,
        name,
        description,
        price: parseFloat(price),
        stockQuantity: parseInt(stockQuantity) || 0,
        lowStockThreshold: parseInt(lowStockThreshold) || 10,
        category,
        imageUrl,
      },
    });

    // Create inventory log
    await prisma.inventoryLog.create({
      data: {
        productId: product.id,
        changeType: 'RESTOCK',
        quantityChange: product.stockQuantity,
        newQuantity: product.stockQuantity,
        note: 'Initial stock',
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/products/:id', authenticateToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { name, description, price, stockQuantity, lowStockThreshold, category, imageUrl, isActive } = req.body;

    // Verify product belongs to user's business
    const existing = await prisma.product.findFirst({
      where: {
        id: parseInt(req.params.id),
        businessId: req.businessId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(stockQuantity !== undefined && { stockQuantity: parseInt(stockQuantity) }),
        ...(lowStockThreshold !== undefined && { lowStockThreshold: parseInt(lowStockThreshold) }),
        ...(category !== undefined && { category }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // If stock changed, create log
    if (stockQuantity !== undefined && stockQuantity !== existing.stockQuantity) {
      await prisma.inventoryLog.create({
        data: {
          productId: product.id,
          changeType: 'ADJUSTMENT',
          quantityChange: stockQuantity - existing.stockQuantity,
          newQuantity: stockQuantity,
          note: 'Manual adjustment',
        },
      });
    }

    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/products/:id', authenticateToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    // Verify product belongs to user's business
    const existing = await prisma.product.findFirst({
      where: {
        id: parseInt(req.params.id),
        businessId: req.businessId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await prisma.product.delete({
      where: { id: parseInt(req.params.id) },
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Import products from CSV
router.post('/products/import', authenticateToken, requireRole(['OWNER', 'ADMIN']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    await validateUntrustedUpload({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    const results = [];
    const errors = [];
    let lineNumber = 0;

    const stream = Readable.from(req.file.buffer);

    stream
      .pipe(csvParser())
      .on('data', (row) => {
        lineNumber++;
        results.push({ line: lineNumber, data: row });
      })
      .on('end', async () => {
        const imported = [];
        const failed = [];

        for (const { line, data } of results) {
          try {
            const { sku, name, price, stockQuantity, lowStockThreshold, category, description } = data;

            if (!sku || !name || !price) {
              failed.push({ line, error: 'Missing required fields (sku, name, price)' });
              continue;
            }

            // Check if product exists
            const existing = await prisma.product.findFirst({
              where: { businessId: req.businessId, sku },
            });

            if (existing) {
              // Update existing product
              await prisma.product.update({
                where: { id: existing.id },
                data: {
                  name,
                  price: parseFloat(price),
                  stockQuantity: parseInt(stockQuantity) || 0,
                  lowStockThreshold: parseInt(lowStockThreshold) || 10,
                  category,
                  description,
                },
              });
              imported.push({ line, sku, action: 'updated' });
            } else {
              // Create new product
              await prisma.product.create({
                data: {
                  businessId: req.businessId,
                  sku,
                  name,
                  price: parseFloat(price),
                  stockQuantity: parseInt(stockQuantity) || 0,
                  lowStockThreshold: parseInt(lowStockThreshold) || 10,
                  category,
                  description,
                },
              });
              imported.push({ line, sku, action: 'created' });
            }
          } catch (error) {
            failed.push({ line, error: error.message });
          }
        }

        res.json({
          message: 'CSV import completed',
          total: results.length,
          imported: imported.length,
          failed: failed.length,
          details: { imported, failed },
        });
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        res.status(500).json({ error: 'Failed to parse CSV file' });
      });
  } catch (error) {
    console.error('Import products error:', error);
    res.status(500).json({ error: 'Failed to import products' });
  }
});

// Get all shipping info
router.get('/shipping', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, carrier } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      businessId: req.businessId,
      ...(status && { status }),
      ...(carrier && { carrier }),
    };

    const [shippingInfos, total] = await Promise.all([
      prisma.shippingInfo.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.shippingInfo.count({ where }),
    ]);

    res.json({
      shippingInfos,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get shipping info error:', error);
    res.status(500).json({ error: 'Failed to fetch shipping information' });
  }
});

// Track package by tracking number
router.get('/shipping/track/:trackingNumber', authenticateToken, async (req, res) => {
  try {
    const shipping = await prisma.shippingInfo.findFirst({
      where: {
        businessId: req.businessId,
        trackingNumber: req.params.trackingNumber,
      },
    });

    if (!shipping) {
      return res.status(404).json({ error: 'Tracking number not found' });
    }

    res.json(shipping);
  } catch (error) {
    console.error('Track package error:', error);
    res.status(500).json({ error: 'Failed to track package' });
  }
});

// Create shipping info
router.post('/shipping', authenticateToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { orderId, trackingNumber, carrier, status, estimatedDelivery, customerPhone, customerEmail } = req.body;

    if (!orderId || !trackingNumber || !carrier) {
      return res.status(400).json({ error: 'Order ID, tracking number, and carrier are required' });
    }

    const shipping = await prisma.shippingInfo.create({
      data: {
        businessId: req.businessId,
        orderId,
        trackingNumber,
        carrier,
        status: status || 'PENDING',
        estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
        customerPhone,
        customerEmail,
      },
    });

    res.status(201).json(shipping);
  } catch (error) {
    console.error('Create shipping info error:', error);
    res.status(500).json({ error: 'Failed to create shipping information' });
  }
});

// Update shipping status
router.put('/shipping/:id', authenticateToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { status, estimatedDelivery, actualDelivery } = req.body;

    // Verify shipping info belongs to user's business
    const existing = await prisma.shippingInfo.findFirst({
      where: {
        id: parseInt(req.params.id),
        businessId: req.businessId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Shipping information not found' });
    }

    const shipping = await prisma.shippingInfo.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(status && { status }),
        ...(estimatedDelivery && { estimatedDelivery: new Date(estimatedDelivery) }),
        ...(actualDelivery && { actualDelivery: new Date(actualDelivery) }),
      },
    });

    res.json(shipping);
  } catch (error) {
    console.error('Update shipping info error:', error);
    res.status(500).json({ error: 'Failed to update shipping information' });
  }
});

// Download sample CSV template
router.get('/template', (req, res) => {  // ← authenticateToken SİL
  const csvContent = `sku,name,description,price,stockQuantity,lowStockThreshold,category
PROD-001,Sample Product 1,This is a sample product,29.99,100,10,Electronics
PROD-002,Sample Product 2,Another sample product,49.99,50,5,Clothing
PROD-003,Sample Product 3,Yet another sample,19.99,200,20,Home`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=inventory-template.csv');
  res.send(csvContent);
});

// AI Agent endpoint - Check stock for a specific product
router.get('/check-stock', authenticateToken, async (req, res) => {
  try {
    const { sku, name, businessId } = req.query;

    if (!sku && !name) {
      return res.status(400).json({ 
        error: 'SKU or product name is required',
        available: false 
      });
    }

    // Build search query
    const where = {
      businessId: businessId ? parseInt(businessId) : req.businessId,
      isActive: true
    };

    if (sku) {
      where.sku = { contains: sku, mode: 'insensitive' };
    } else if (name) {
      where.name = { contains: name, mode: 'insensitive' };
    }

    const product = await prisma.product.findFirst({ where });

    if (!product) {
      return res.json({
        found: false,
        available: false,
        message: 'Product not found in inventory'
      });
    }

    const inStock = product.stockQuantity > 0;
    const lowStock = product.stockQuantity <= product.lowStockThreshold;

    res.json({
      found: true,
      available: inStock,
      product: {
        sku: product.sku,
        name: product.name,
        stockQuantity: product.stockQuantity,
        price: product.price,
        category: product.category,
        lowStock: lowStock
      },
      message: inStock 
        ? `Yes, we have ${product.stockQuantity} in stock${lowStock ? ' (low stock)' : ''}`
        : 'Out of stock'
    });

  } catch (error) {
    console.error('Check stock error:', error);
    res.status(500).json({ 
      error: 'Failed to check stock',
      available: false 
    });
  }
});

// AI Agent endpoint - Search products by category or name
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { query, category, inStockOnly } = req.query;

    if (!query && !category) {
      return res.status(400).json({ error: 'Search query or category required' });
    }

    const where = {
      businessId: req.businessId,
      isActive: true
    };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } }
      ];
    }

    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }

    if (inStockOnly === 'true') {
      where.stockQuantity = { gt: 0 };
    }

    const products = await prisma.product.findMany({
      where,
      take: 10,
      orderBy: { stockQuantity: 'desc' }
    });

    res.json({
      found: products.length > 0,
      count: products.length,
      products: products.map(p => ({
        sku: p.sku,
        name: p.name,
        stockQuantity: p.stockQuantity,
        price: p.price,
        category: p.category,
        available: p.stockQuantity > 0,
        lowStock: p.stockQuantity <= p.lowStockThreshold
      }))
    });

  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// AI Agent endpoint - Get low stock alerts
router.get('/low-stock-alerts', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.$queryRaw`
      SELECT * FROM "Product"
      WHERE "businessId" = ${req.businessId}
      AND "stockQuantity" <= "lowStockThreshold"
      AND "isActive" = true
      ORDER BY "stockQuantity" ASC
      LIMIT 20
    `;

    res.json({
      count: products.length,
      alerts: products.map(p => ({
        sku: p.sku,
        name: p.name,
        currentStock: p.stockQuantity,
        threshold: p.lowStockThreshold,
        message: `${p.name} is low on stock (${p.stockQuantity} remaining)`
      }))
    });

  } catch (error) {
    console.error('Low stock alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

export default router;

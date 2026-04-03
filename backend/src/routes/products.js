import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Get all products for a business
router.get('/', async (req, res) => {
  try {
    const { businessId } = req.query;
    
    if (!businessId) {
      return res.status(400).json({ error: 'Business ID required' });
    }

    // Verify user has access to this business
    if (parseInt(businessId) !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const products = await prisma.product.findMany({
      where: { businessId: parseInt(businessId) },
      orderBy: { createdAt: 'desc' }
    });

    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create a new product
router.post('/', async (req, res) => {
  try {
    const { businessId, sku, name, description, price, stockQuantity, lowStockThreshold, category } = req.body;

    // Verify user has access to this business
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if SKU already exists for this business
    const existingProduct = await prisma.product.findUnique({
      where: {
        businessId_sku: {
          businessId,
          sku
        }
      }
    });

    if (existingProduct) {
      return res.status(400).json({ error: 'SKU already exists' });
    }

    // Product oluştur
const product = await prisma.product.create({
  data: {
    sku,
    name,
    description,
    price: parseFloat(price),
    stockQuantity: parseInt(stockQuantity),
    lowStockThreshold: parseInt(lowStockThreshold) || 10,
    category,
    businessId: req.businessId
  }
});

// Log oluştur
await prisma.inventoryLog.create({
  data: {
    productId: product.id,  // ← newProduct DEĞİL, product olmalı!
    changeType: 'RESTOCK',
    quantityChange: parseInt(stockQuantity),
        newQuantity: parseInt(stockQuantity),  // ← EKLE
    note: 'Initial stock'
  }
});

res.status(201).json(product);  // ← Burada da product

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stockQuantity, lowStockThreshold, category } = req.body;

    // Get product to verify ownership
    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.businessId !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const previousQuantity = product.stockQuantity;

    const updatedProduct = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        price,
        stockQuantity,
        lowStockThreshold,
        category
      }
    });

    // Log inventory change if stock changed
    if (stockQuantity !== previousQuantity) {
  await prisma.inventoryLog.create({
    data: {
      productId: parseInt(id),
      changeType: stockQuantity > previousQuantity ? 'RESTOCK' : 'SALE',
      quantityChange: stockQuantity - previousQuantity,  // ← EKLE
            newQuantity: stockQuantity,  // ← EKLE
      note: 'Manual update'
    }
  });
}

    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.businessId !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.product.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get inventory logs for a product
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.businessId !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = await prisma.inventoryLog.findMany({
      where: { productId: parseInt(id) },
      orderBy: { createdAt: 'desc' }
    });

    res.json(logs);
  } catch (error) {
    console.error('Get inventory logs error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory logs' });
  }
});

export default router;
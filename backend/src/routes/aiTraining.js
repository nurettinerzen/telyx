import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Get all trainings
router.get('/', async (req, res) => {
  try {
    const trainings = await prisma.aiTraining.findMany({
      where: { 
        businessId: req.businessId,
        isActive: true 
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(trainings);
  } catch (error) {
    console.error('Get trainings error:', error);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// Create training
router.post('/', async (req, res) => {
  try {
    const { title, instructions, category } = req.body;

    if (!title || !instructions) {
      return res.status(400).json({ error: 'Title and instructions required' });
    }

    const training = await prisma.aiTraining.create({
      data: {
        businessId: req.businessId,
        title,
        instructions,
        category
      }
    });

    res.json(training);
  } catch (error) {
    console.error('Create training error:', error);
    res.status(500).json({ error: 'Failed to create training' });
  }
});

// Update training
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, instructions, category, isActive } = req.body;

    const training = await prisma.aiTraining.update({
      where: { 
        id: parseInt(id),
        businessId: req.businessId 
      },
      data: {
        title,
        instructions,
        category,
        isActive
      }
    });

    res.json(training);
  } catch (error) {
    console.error('Update training error:', error);
    res.status(500).json({ error: 'Failed to update training' });
  }
});

// Delete training
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.aiTraining.delete({
      where: { 
        id: parseInt(id),
        businessId: req.businessId 
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete training error:', error);
    res.status(500).json({ error: 'Failed to delete training' });
  }
});

export default router;
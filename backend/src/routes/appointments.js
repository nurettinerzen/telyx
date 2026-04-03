import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Get all appointments for a business
router.get('/', async (req, res) => {
  try {
    const { businessId } = req;
    const { startDate, endDate } = req.query;

    const where = { businessId };

    // Filter by date range if provided
    if (startDate || endDate) {
      where.appointmentDate = {};
      if (startDate) where.appointmentDate.gte = new Date(startDate);
      if (endDate) where.appointmentDate.lte = new Date(endDate);
    }

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { appointmentDate: 'asc' }
    });

    res.json(appointments);
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Get single appointment
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req;

    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.businessId !== businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// Create appointment
router.post('/', async (req, res) => {
  try {
    const { businessId } = req;
    const { 
      customerName, 
      customerPhone, 
      customerEmail, 
      appointmentDate, 
      duration, 
      notes,
      serviceType 
    } = req.body;

    // Check if slot is available
    const appointmentStart = new Date(appointmentDate);
    const appointmentEnd = new Date(appointmentStart.getTime() + duration * 60000);

    const conflicting = await prisma.appointment.findFirst({
      where: {
        businessId,
        status: { not: 'CANCELLED' },
        OR: [
          {
            AND: [
              { appointmentDate: { lte: appointmentStart } },
              { appointmentDate: { gte: appointmentStart } }
            ]
          },
          {
            AND: [
              { appointmentDate: { lte: appointmentEnd } },
              { appointmentDate: { gte: appointmentEnd } }
            ]
          }
        ]
      }
    });

    if (conflicting) {
      return res.status(400).json({ error: 'Time slot not available' });
    }

    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        customerName,
        customerPhone,
        customerEmail,
        appointmentDate: new Date(appointmentDate),
        duration,
        notes,
        serviceType,
        status: 'CONFIRMED'
      }
    });

    res.status(201).json(appointment);
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Update appointment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req;
    const { 
      customerName, 
      customerPhone, 
      customerEmail, 
      appointmentDate, 
      duration, 
      notes,
      serviceType,
      status 
    } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.businessId !== businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.appointment.update({
      where: { id: parseInt(id) },
      data: {
        customerName,
        customerPhone,
        customerEmail,
        appointmentDate: appointmentDate ? new Date(appointmentDate) : undefined,
        duration,
        notes,
        serviceType,
        status
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Cancel appointment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req;

    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.businessId !== businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.appointment.update({
      where: { id: parseInt(id) },
      data: { status: 'CANCELLED' }
    });

    res.json({ message: 'Appointment cancelled successfully' });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

// Get available time slots for a date
router.get('/available-slots/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { businessId } = req;

    // Get business hours
    const businessHours = await prisma.businessHours.findUnique({
      where: { businessId }
    });

    if (!businessHours) {
      return res.status(404).json({ error: 'Business hours not configured' });
    }

    const selectedDate = new Date(date);
    const dayOfWeek = selectedDate.getDay();

    // Check if business is open on this day
    const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
    if (!businessHours[`${dayKey}Open`]) {
      return res.json({ availableSlots: [] });
    }

    // Get appointments for this date
    const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId,
        status: { not: 'CANCELLED' },
        appointmentDate: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    // Generate available slots (simplified - every 30 mins)
    const openTime = businessHours[`${dayKey}Start`];
    const closeTime = businessHours[`${dayKey}End`];
    
    const slots = [];
    // This is simplified - you'd parse openTime/closeTime and generate slots
    // For now, return basic response
    
    res.json({ 
      availableSlots: slots,
      bookedAppointments: appointments.length 
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

export default router;
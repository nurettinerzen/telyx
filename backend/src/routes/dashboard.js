import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const DASHBOARD_SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  status: true,
  minutesUsed: true,
  minutesLimit: true
};

// GET /api/dashboard/stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: DASHBOARD_SUBSCRIPTION_SELECT
    });

    const calls = await prisma.callLog.findMany({
      where: { businessId },
    });

    const totalCalls = calls.length;
    const completedCalls = calls.filter(c => c.status === 'completed').length;
    const missedCalls = calls.filter(c => c.status === 'missed').length;
    
    const totalDuration = calls.reduce((sum, call) => sum + (call.duration || 0), 0);
    // avgDuration saniye cinsinden döndür (frontend formatDuration saniye bekliyor)
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

    const successRate = totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(1) : 0;

    res.json({
      totalCalls,
      minutesUsed: subscription?.minutesUsed || 0,
      minutesLimit: subscription?.minutesLimit || 0,
      successRate: parseFloat(successRate),
      avgDuration,
      missedCalls,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/dashboard/chart?range=7d
router.get('/chart', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;
    const { range = '7d' } = req.query;

    const days = parseInt(range.replace('d', ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const calls = await prisma.callLog.findMany({
      where: {
        businessId,
        createdAt: {
          gte: startDate,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const chartData = {};
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i - 1));
      const dateStr = date.toISOString().split('T')[0];
      chartData[dateStr] = 0;
    }

    calls.forEach(call => {
      const dateStr = call.createdAt.toISOString().split('T')[0];
      if (chartData[dateStr] !== undefined) {
        chartData[dateStr]++;
      }
    });

    const data = Object.entries(chartData).map(([date, calls]) => ({
      date,
      calls,
    }));

    res.json({ data });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// GET /api/dashboard/recent-calls
router.get('/recent-calls', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;

    const recentCalls = await prisma.callLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Transform calls to include phoneNumber (same format as /api/call-logs)
    const calls = recentCalls.map(call => ({
      ...call,
      phoneNumber: call.callerId,
      assistantName: null
    }));

    res.json({ calls });
  } catch (error) {
    console.error('Error fetching recent calls:', error);
    res.status(500).json({ error: 'Failed to fetch recent calls' });
  }
});

export default router;

import express from 'express';
import { getBotProcesses } from '../readers/process-reader.js';

const router = express.Router();

/**
 * GET /api/processes
 * Returns bot process status with no caching (status changes frequently)
 */
router.get('/', async (req, res) => {
  try {
    const bots = await getBotProcesses();
    
    res.json({
      bots: bots.map(bot => ({
        pid: bot.pid,
        script: bot.name,
        uptime: null,
        cpu: bot.cpu,
        mem: bot.mem
      })),
      count: bots.length
    });
  } catch (error) {
    console.error('[processes] Error fetching bot processes:', error);
    res.status(500).json({ error: 'Failed to fetch process status' });
  }
});

export default router;

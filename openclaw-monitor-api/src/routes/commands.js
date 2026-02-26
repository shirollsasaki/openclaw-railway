import { Router } from 'express';
import { readJsonFile } from '../readers/file-reader.js';
import { CRON_JOBS_FILE, AGENT_NAMES } from '../../config.js';
import { execOpenClawRaw } from '../readers/cli-reader.js';
import { refreshAllBroadcasts } from '../ws/websocket-server.js';
const router = Router();
router.get('/available', async (req, res) => {
  res.json([
    { id: 'refresh', method: 'POST', path: '/api/commands/refresh', label: 'Refresh All Data' },
    { id: 'cron_run', method: 'POST', path: '/api/commands/cron/run/:jobId', label: 'Run Cron Job' },
    { id: 'cron_enable', method: 'POST', path: '/api/commands/cron/enable/:jobId', label: 'Enable Cron Job' },
    { id: 'cron_disable', method: 'POST', path: '/api/commands/cron/disable/:jobId', label: 'Disable Cron Job' },
    { id: 'agent_message', method: 'POST', path: '/api/commands/agent/message', label: 'Send Agent Message' },
  ]);
});
router.post('/refresh', async (req, res) => {
  try {
    await refreshAllBroadcasts();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err?.message ?? 'refresh failed' });
  }
});

async function validateJobId(jobId) {
  if (!jobId) return false;
  const jobs = await readJsonFile(CRON_JOBS_FILE);
  return Array.isArray(jobs?.jobs) ? jobs.jobs.some((j) => j?.id === jobId) : false;
}
router.post('/cron/run/:jobId', async (req, res) => {
  try {
    const jobId = String(req.params.jobId ?? '').trim();
    if (!(await validateJobId(jobId))) {
      return res.status(400).json({ status: 'error', error: 'invalid or missing jobId' });
    }
    const result = await execOpenClawRaw(['cron', 'run', jobId], { timeoutMs: 120_000 });
    if (!result.ok) {
      return res.status(500).json({ status: 'error', error: result.error ?? 'cron run failed', stdout: result.stdout, stderr: result.stderr });
    }
    return res.json({ status: 'ok', stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err?.message ?? 'cron run failed' });
  }
});

router.post('/cron/enable/:jobId', async (req, res) => {
  try {
    const jobId = String(req.params.jobId ?? '').trim();
    if (!(await validateJobId(jobId))) {
      return res.status(400).json({ status: 'error', error: 'invalid or missing jobId' });
    }
    const result = await execOpenClawRaw(['cron', 'enable', jobId], { timeoutMs: 30_000 });
    if (!result.ok) {
      return res.status(500).json({ status: 'error', error: result.error ?? 'cron enable failed', stdout: result.stdout, stderr: result.stderr });
    }
    return res.json({ status: 'ok', stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err?.message ?? 'cron enable failed' });
  }
});

router.post('/cron/disable/:jobId', async (req, res) => {
  try {
    const jobId = String(req.params.jobId ?? '').trim();
    if (!(await validateJobId(jobId))) {
      return res.status(400).json({ status: 'error', error: 'invalid or missing jobId' });
    }
    const result = await execOpenClawRaw(['cron', 'disable', jobId], { timeoutMs: 30_000 });
    if (!result.ok) {
      return res.status(500).json({ status: 'error', error: result.error ?? 'cron disable failed', stdout: result.stdout, stderr: result.stderr });
    }
    return res.json({ status: 'ok', stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err?.message ?? 'cron disable failed' });
  }
});

router.post('/agent/message', async (req, res) => {
  try {
    const { agentId, message } = req.body ?? {};
    if (!agentId || !message) {
      return res.status(400).json({ status: 'error', error: 'agentId and message required' });
    }
    if (!AGENT_NAMES.includes(String(agentId).toLowerCase())) {
      return res.status(400).json({ status: 'error', error: 'invalid agentId' });
    }
    const args = ['agent', '--agent', String(agentId).toLowerCase(), '--message', String(message)];
    const result = await execOpenClawRaw(args, { timeoutMs: 120_000 });
    if (!result.ok) {
      return res.status(500).json({ status: 'error', error: result.error ?? 'agent message failed', stdout: result.stdout, stderr: result.stderr });
    }
    return res.json({ status: 'ok', stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err?.message ?? 'agent message failed' });
  }
});
export default router;
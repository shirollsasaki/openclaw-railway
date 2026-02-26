import { Router } from 'express';
import path from 'path';
import { CRON_JOBS_FILE, CRON_RUNS_DIR } from '../../config.js';
import { readJsonFile, readJsonlFile } from '../readers/file-reader.js';

const router = Router();

// 30s module-level cache
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 30_000;

async function getCronJobs() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) {
    return cache;
  }

  const data = await readJsonFile(CRON_JOBS_FILE);
  if (!data || !Array.isArray(data.jobs)) {
    cache = { jobs: [] };
    cacheTime = now;
    return cache;
  }

  const jobs = await Promise.all(
    data.jobs.map(async (job) => {
      const runsFile = path.join(CRON_RUNS_DIR, `${job.id}.jsonl`);
      const recentRuns = await readJsonlFile(runsFile, 5);

      // Count consecutive errors from recent runs (status !== 'ok')
      const consecutiveErrors = recentRuns.filter((r) => r.status !== 'ok').length;

      return {
        id: job.id,
        name: job.name,
        agent: job.agentId,
        schedule: job.schedule,
        enabled: job.enabled ?? false,
        lastRun: job.state?.lastRunAtMs ?? null,
        lastStatus: job.state?.lastStatus ?? null,
        nextRun: job.state?.nextRunAtMs ?? null,
        consecutiveErrors: job.state?.consecutiveErrors ?? consecutiveErrors,
        recentRuns,
      };
    })
  );

  cache = { jobs };
  cacheTime = now;
  return cache;
}

router.get('/jobs', async (req, res) => {
  try {
    const result = await getCronJobs();
    res.json(result);
  } catch (err) {
    console.error('[cron] Error fetching jobs:', err);
    res.status(500).json({ error: 'Failed to fetch cron jobs' });
  }
});

export default router;

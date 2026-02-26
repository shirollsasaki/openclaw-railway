import { Router } from 'express';
import path from 'path';
import { OPENCLAW_HOME, AGENT_NAMES } from '../../config.js';
import { readJsonFile } from '../readers/file-reader.js';
import { execOpenClawCLI } from '../readers/cli-reader.js';

// Static metadata from openclaw.json
const AGENT_META = {
  richard: { name: 'Richard Hendricks', model: 'claude-opus-4-6' },
  jared:   { name: 'Jared Dunn',        model: 'claude-sonnet-4-5' },
  erlich:  { name: 'Erlich Bachman',    model: 'claude-sonnet-4-5' },
  gilfoyle:{ name: 'Gilfoyle',          model: 'claude-opus-4-6' },
  monica:  { name: 'Monica Hall',       model: 'claude-sonnet-4-5' },
  bighead: { name: 'Big Head',          model: 'claude-sonnet-4-5' },
  dinesh:  { name: 'Dinesh Chugtai',    model: 'claude-sonnet-4-5' },
};

// 60s cache
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000;

const ACTIVE_THRESHOLD_MS  = 10 * 60 * 1000;  // 10 minutes
const IDLE_THRESHOLD_MS    = 60 * 60 * 1000;  // 1 hour

/**
 * Determine status based on lastActive timestamp (ms).
 * @param {number|null} lastActiveMs
 * @returns {'active'|'idle'|'offline'}
 */
function computeStatus(lastActiveMs) {
  if (!lastActiveMs) return 'offline';
  const ageMs = Date.now() - lastActiveMs;
  if (ageMs < ACTIVE_THRESHOLD_MS) return 'active';
  if (ageMs < IDLE_THRESHOLD_MS)   return 'idle';
  return 'offline';
}

/**
 * Build agent data for a single agent by reading its sessions.json.
 * @param {string} agentId
 * @returns {Promise<{name,model,status,lastActive,sessionCount}>}
 */
async function buildAgentEntry(agentId) {
  const meta = AGENT_META[agentId] ?? { name: agentId, model: 'unknown' };
  const sessionsPath = path.join(
    OPENCLAW_HOME, 'agents', agentId, 'sessions', 'sessions.json'
  );

  const sessions = await readJsonFile(sessionsPath);

  let lastActiveMs = null;
  let sessionCount = 0;

  if (sessions && typeof sessions === 'object') {
    const entries = Object.values(sessions);
    sessionCount = entries.length;

    for (const session of entries) {
      if (session.updatedAt && (lastActiveMs === null || session.updatedAt > lastActiveMs)) {
        lastActiveMs = session.updatedAt;
      }
    }
  }

  return {
    name:         meta.name,
    model:        meta.model,
    status:       computeStatus(lastActiveMs),
    lastActive:   lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
    sessionCount,
  };
}

/**
 * Fetch all agent data, using CLI health check + session files.
 * Results are cached for 60s.
 */
async function fetchAgentsData() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL_MS) {
    return _cache;
  }

  // Attempt CLI health check (non-blocking — used for future enrichment)
  // Falls back gracefully to null if CLI not available
  const _cliHealth = await execOpenClawCLI(['health']);

  // Always derive status from session files (reliable source of truth)
  const agents = await Promise.all(AGENT_NAMES.map(buildAgentEntry));

  _cache     = { agents };
  _cacheTime = now;
  return _cache;
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/agents
 * Returns status of all 7 OpenClaw agents.
 */
router.get('/', async (req, res) => {
  try {
    const data = await fetchAgentsData();
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error:   'Failed to fetch agent data',
      details: err.message,
    });
  }
});

export default router;

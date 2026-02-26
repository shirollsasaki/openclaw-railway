import express from 'express';
import path from 'path';
import { OPENCLAW_HOME, AGENT_NAMES } from '../../config.js';
import { readJsonFile } from '../readers/file-reader.js';

const router = express.Router();

// Model configuration per agent
const AGENT_MODELS = {
  richard: 'claude-opus-4-6',
  gilfoyle: 'claude-opus-4-6',
  jared: 'claude-sonnet-4-5',
  erlich: 'claude-sonnet-4-5',
  monica: 'claude-sonnet-4-5',
  bighead: 'claude-sonnet-4-5',
  dinesh: 'claude-sonnet-4-5',
};

// Pricing per million tokens (USD)
const MODEL_PRICING = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
};

/**
 * Calculate estimated cost in USD for given token counts and model.
 */
function calculateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-sonnet-4-5'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Read token usage for a single agent from their sessions.json.
 * sessions.json is a dict keyed by session ID; each session may have
 * inputTokens, outputTokens, totalTokens fields.
 */
async function getAgentTokenUsage(agentName) {
  const sessionsPath = path.join(
    OPENCLAW_HOME,
    'agents',
    agentName,
    'sessions',
    'sessions.json'
  );

  const data = await readJsonFile(sessionsPath);

  if (!data) {
    return {
      name: agentName,
      model: AGENT_MODELS[agentName] ?? 'claude-sonnet-4-5',
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      sessionCount: 0,
    };
  }

  // sessions.json is an object keyed by session ID
  const sessions = Object.values(data);

  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const session of sessions) {
    inputTokens += session.inputTokens ?? 0;
    outputTokens += session.outputTokens ?? 0;
    totalTokens += session.totalTokens ?? 0;
  }

  const model = AGENT_MODELS[agentName] ?? 'claude-sonnet-4-5';
  const estimatedCost = calculateCost(model, inputTokens, outputTokens);

  return {
    name: agentName,
    model,
    totalTokens,
    inputTokens,
    outputTokens,
    estimatedCost: Math.round(estimatedCost * 10000) / 10000, // 4 decimal places
    sessionCount: sessions.length,
  };
}

// 5-minute cache
const CACHE_TTL = 300_000; // 300,000 ms
let cache = null;
let cacheTimestamp = 0;

/**
 * GET /api/tokens/usage
 * Returns token usage aggregated across all agents, with 5-minute cache.
 */
router.get('/usage', async (req, res) => {
  try {
    const now = Date.now();

    // Return cached response if still valid
    if (cache && now - cacheTimestamp < CACHE_TTL) {
      return res.json(cache);
    }

    // Fetch all agents in parallel
    const agents = await Promise.all(
      AGENT_NAMES.map(name => getAgentTokenUsage(name))
    );

    // Calculate totals
    const totalTokens = agents.reduce((sum, a) => sum + a.totalTokens, 0);
    const totalCost = agents.reduce((sum, a) => sum + a.estimatedCost, 0);

    const response = {
      agents,
      total: {
        tokens: totalTokens,
        estimatedCost: Math.round(totalCost * 10000) / 10000,
      },
    };

    // Update cache
    cache = response;
    cacheTimestamp = now;

    return res.json(response);
  } catch (error) {
    console.error('[tokens] Error fetching token usage:', error);
    return res.status(500).json({ error: 'Failed to fetch token usage' });
  }
});

export default router;

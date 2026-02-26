import { Router } from 'express';
import { TRADING_LOG, TRADING_CSV } from '../../config.js';
import { tailLogFile, readCsvFile } from '../readers/file-reader.js';
import { parseLatestEquity, parsePositionTable, parseEquityLine } from '../readers/log-parser.js';
import { getBotProcesses } from '../readers/process-reader.js';
const router = Router();
// --- 5-second cache ---
let cache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5000;
// --- equity-history cache (30s) ---
let equityHistoryCache = null;
let equityHistoryCacheTime = 0;
const EQUITY_HISTORY_TTL_MS = 30_000;

// --- stats cache (60s) ---
let statsCache = null;
let statsCacheTime = 0;
const STATS_TTL_MS = 60_000;
async function fetchTradingStatus() {
  const lines = await tailLogFile(TRADING_LOG, 50);
  const equityData = parseLatestEquity(lines);
  const openPositions = parsePositionTable(lines);
  const allTrades = await readCsvFile(TRADING_CSV);
  const recentTrades = allTrades.slice(-20);
  const processes = await getBotProcesses();
  const botRunning = processes.length > 0;

  return {
    equity:        equityData?.equity        ?? null,
    unrealized:    equityData?.unrealized    ?? null,
    total:         equityData?.total         ?? null,
    realized:      equityData?.realized      ?? null,
    openPositions,
    recentTrades,
    botRunning,
    lastUpdate:    equityData?.timestamp     ?? null,
  };
}

async function fetchEquityHistory() {
  const now = Date.now();
  if (equityHistoryCache && (now - equityHistoryCacheTime) < EQUITY_HISTORY_TTL_MS) {
    return equityHistoryCache;
  }
  const lines = await tailLogFile(TRADING_LOG, 500);
  const points = [];
  for (const line of lines) {
    const parsed = parseEquityLine(line);
    if (parsed && parsed.timestamp && parsed.equity != null) {
      points.push({
        timestamp: parsed.timestamp,
        equity: parsed.equity,
        total: parsed.total,
        unrealized: parsed.unrealized,
        realized: parsed.realized,
      });
    }
  }
  equityHistoryCache = { points };
  equityHistoryCacheTime = now;
  return equityHistoryCache;
}

async function fetchTradeStats() {
  const now = Date.now();
  if (statsCache && (now - statsCacheTime) < STATS_TTL_MS) {
    return statsCache;
  }
  const allTrades = await readCsvFile(TRADING_CSV);
  const totalTrades = allTrades.length;
  let wins = 0, losses = 0, totalPnl = 0;
  let biggestWin = 0, biggestLoss = 0;
  let totalLongs = 0, totalShorts = 0;
  const assetStats = {};
  for (const trade of allTrades) {
    const pnl = parseFloat(trade.pnl) || 0;
    totalPnl += pnl;
    if (pnl > 0) { wins++; if (pnl > biggestWin) biggestWin = pnl; }
    if (pnl < 0) { losses++; if (pnl < biggestLoss) biggestLoss = pnl; }
    const dir = (trade.direction || '').toUpperCase();
    if (dir === 'LONG') totalLongs++;
    if (dir === 'SHORT') totalShorts++;
    const asset = trade.asset || 'unknown';
    if (!assetStats[asset]) assetStats[asset] = { trades: 0, pnl: 0, wins: 0 };
    assetStats[asset].trades++;
    assetStats[asset].pnl += pnl;
    if (pnl > 0) assetStats[asset].wins++;
  }
  const assetBreakdown = Object.entries(assetStats).map(([asset, s]) => ({
    asset,
    trades: s.trades,
    pnl: Math.round(s.pnl * 100) / 100,
    winRate: s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0,
  }));
  statsCache = {
    totalTrades,
    wins,
    losses,
    winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgPnl: totalTrades > 0 ? Math.round((totalPnl / totalTrades) * 100) / 100 : 0,
    biggestWin: Math.round(biggestWin * 100) / 100,
    biggestLoss: Math.round(biggestLoss * 100) / 100,
    totalLongs,
    totalShorts,
    assetBreakdown,
  };
  statsCacheTime = now;
  return statsCache;
}
router.get('/status', async (req, res) => {
  try {
    const now = Date.now();
    if (cache && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return res.json(cache);
    }
    const data = await fetchTradingStatus();
    cache = data;
    cacheTimestamp = now;
    res.json(data);
  } catch (err) {
    console.error('[trading] Error fetching status:', err);
    res.status(500).json({ error: 'Failed to fetch trading status', details: err.message });
  }
});

router.get('/equity-history', async (req, res) => {
  try {
    const data = await fetchEquityHistory();
    res.json(data);
  } catch (err) {
    console.error('[trading] Error fetching equity history:', err);
    res.status(500).json({ error: 'Failed to fetch equity history', details: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const data = await fetchTradeStats();
    res.json(data);
  } catch (err) {
    console.error('[trading] Error fetching trade stats:', err);
    res.status(500).json({ error: 'Failed to fetch trade stats', details: err.message });
  }
});
export default router;

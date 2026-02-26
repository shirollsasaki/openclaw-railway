import WebSocket from 'ws';
import chokidar from 'chokidar';
import { CRON_JOBS_FILE, TRADING_CSV, TRADING_LOG } from '../../config.js';
import { tailLogFile, readCsvFile, readJsonFile } from '../readers/file-reader.js';
import { parseLatestEquity } from '../readers/log-parser.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

let _broadcast = null;

export async function refreshAllBroadcasts() {
  if (!_broadcast) return false;

  const [trading, trades, cron] = await Promise.all([
    (async () => {
      const lines = await tailLogFile(TRADING_LOG, 50);
      const equityData = parseLatestEquity(lines);
      _broadcast({
        type: 'trading_update',
        data: equityData,
        timestamp: new Date().toISOString(),
      });
      return true;
    })(),
    (async () => {
      const allTrades = await readCsvFile(TRADING_CSV);
      const lastTrades = allTrades.slice(-10);
      _broadcast({
        type: 'trade_update',
        data: lastTrades,
        timestamp: new Date().toISOString(),
      });
      return true;
    })(),
    (async () => {
      const jobs = await readJsonFile(CRON_JOBS_FILE);
      _broadcast({
        type: 'cron_update',
        data: jobs,
        timestamp: new Date().toISOString(),
      });
      return true;
    })(),
  ]);

  return Boolean(trading && trades && cron);
}

export function setupWebSocketServer(wss, server) {
  const clients = new Set();

  const broadcast = (message) => {
    const payload = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  };

  _broadcast = broadcast;

  const broadcastTradingUpdate = async () => {
    const lines = await tailLogFile(TRADING_LOG, 50);
    const equityData = parseLatestEquity(lines);
    broadcast({
      type: 'trading_update',
      data: equityData,
      timestamp: new Date().toISOString(),
    });
  };

  const broadcastCronUpdate = async () => {
    const jobs = await readJsonFile(CRON_JOBS_FILE);
    broadcast({
      type: 'cron_update',
      data: jobs,
      timestamp: new Date().toISOString(),
    });
  };

  const broadcastTradeUpdate = async () => {
    const allTrades = await readCsvFile(TRADING_CSV);
    const trades = allTrades.slice(-10);
    broadcast({
      type: 'trade_update',
      data: trades,
      timestamp: new Date().toISOString(),
    });
  };

  const watcher = chokidar.watch([TRADING_LOG, TRADING_CSV, CRON_JOBS_FILE], {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', async (filePath) => {
    try {
      if (filePath === TRADING_LOG) {
        await broadcastTradingUpdate();
      } else if (filePath === TRADING_CSV) {
        await broadcastTradeUpdate();
      } else if (filePath === CRON_JOBS_FILE) {
        await broadcastCronUpdate();
      }
    } catch (error) {
      console.error('[WS] Broadcast update failed:', error);
    }
  });

  watcher.on('error', (error) => {
    console.error('[WS] File watcher error:', error);
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.pongTimer = null;
    clients.add(ws);
    console.log('[WS] Client connected');

    ws.on('pong', () => {
      ws.isAlive = true;
      if (ws.pongTimer) {
        clearTimeout(ws.pongTimer);
        ws.pongTimer = null;
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      if (ws.pongTimer) {
        clearTimeout(ws.pongTimer);
        ws.pongTimer = null;
      }
      console.log('[WS] Client disconnected');
    });

    ws.on('error', () => {
      clients.delete(ws);
      if (ws.pongTimer) {
        clearTimeout(ws.pongTimer);
        ws.pongTimer = null;
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState !== WebSocket.OPEN) {
        clients.delete(ws);
        continue;
      }

      if (!ws.isAlive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }

      ws.isAlive = false;
      ws.ping();
      ws.pongTimer = setTimeout(() => {
        if (!ws.isAlive) {
          ws.terminate();
          clients.delete(ws);
        }
      }, PONG_TIMEOUT_MS);
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    watcher.close().catch(() => {});
    _broadcast = null;
  });
}

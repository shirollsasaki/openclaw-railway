import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import { OPENCLAW_HOME, PORT } from './config.js';
import { setupWebSocketServer } from './src/ws/websocket-server.js';
import processesRouter from './src/routes/processes.js';
import cronRouter from './src/routes/cron.js';
import tradingRouter from './src/routes/trading.js';
import agentsRouter from './src/routes/agents.js';
import tokensRouter from './src/routes/tokens.js';
import commandsRouter from './src/routes/commands.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(express.json());

// CORS headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', name: 'openclaw-monitor-api' });
});

// Mount API routes
app.use('/api/processes', processesRouter);
app.use('/api/cron', cronRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/commands', commandsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Check if ~/.openclaw exists on startup
const openclawExists = fs.existsSync(OPENCLAW_HOME);
if (!openclawExists) {
  console.warn(`⚠️  WARNING: ${OPENCLAW_HOME} does not exist`);
} else {
  console.log(`✓ Found ${OPENCLAW_HOME}`);
}

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   OpenClaw Monitor API                 ║
║   Server started on port ${PORT}        ║
║   OPENCLAW_HOME: ${OPENCLAW_HOME}       ║
╚════════════════════════════════════════╝
  `);

  setupWebSocketServer(wss, server);
});

export { app, server };

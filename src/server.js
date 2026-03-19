const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// API token auth — set API_TOKEN env var to enable.
// If unset, auth is disabled (development default).
const API_TOKEN = process.env.API_TOKEN || null;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const sse = require('./sse');
const tasksRouter = require('./routes/tasks');
const agentsRouter = require('./routes/agents');
const messagesRouter = require('./routes/messages');
const roomsRouter = require('./routes/rooms');
const engTasksRouter = require('./routes/eng-tasks');

// Bootstrap config endpoint — no auth, returns token for browser to use.
// This is intentional: the app is single-user/internal. The token gates
// unauthorized external access, not authenticated sessions.
app.get('/api/config', (req, res) => {
  res.json({ token: API_TOKEN || '' });
});

// Health check endpoint — no auth required.
// Used by Docker HEALTHCHECK and external monitoring.
app.get('/health', (req, res) => {
  const db = require('./db');
  try {
    // Verify DB is accessible by running a trivial query
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// Bearer token auth middleware — applied to all /api/* routes except:
//   /api/config (bootstrap)
//   /api/events (SSE — EventSource API doesn't support custom headers)
function requireAuth(req, res, next) {
  if (!API_TOKEN) return next(); // auth disabled if no token set

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — Bearer token required' });
  }
  const token = authHeader.slice(7);
  if (token !== API_TOKEN) {
    return res.status(403).json({ error: 'Forbidden — invalid token' });
  }
  next();
}

// Inject SSE broadcaster into routes via req locals
app.use((req, res, next) => {
  req.broadcast = sse.broadcast;
  next();
});

// Apply auth to all /api routes (except config and events, handled above)
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/agents', requireAuth, agentsRouter);
app.use('/api/messages', requireAuth, messagesRouter);
app.use('/api/rooms', requireAuth, roomsRouter);
app.use('/api/eng-tasks', requireAuth, engTasksRouter);

// SSE endpoint — no auth header possible from EventSource, but token is
// validated via query param as a fallback when API_TOKEN is set
app.get('/api/events', (req, res) => {
  if (API_TOKEN) {
    const qToken = req.query.token;
    if (!qToken || qToken !== API_TOKEN) {
      res.status(401).end('Unauthorized');
      return;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
  res.flushHeaders();

  // Send initial heartbeat
  res.write(': connected\n\n');

  sse.addClient(res);

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sse.removeClient(res);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Task Log running on port ${PORT}`);
  if (API_TOKEN) {
    console.log('API token auth: ENABLED');
  } else {
    console.log('API token auth: DISABLED (set API_TOKEN env var to enable)');
  }
});

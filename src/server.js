const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const sse = require('./sse');
const tasksRouter = require('./routes/tasks');
const agentsRouter = require('./routes/agents');
const messagesRouter = require('./routes/messages');
const roomsRouter = require('./routes/rooms');
const engTasksRouter = require('./routes/eng-tasks');

// Inject SSE broadcaster into routes via req locals
app.use((req, res, next) => {
  req.broadcast = sse.broadcast;
  next();
});

app.use('/api/tasks', tasksRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/eng-tasks', engTasksRouter);

// SSE endpoint — clients subscribe here for live updates
app.get('/api/events', (req, res) => {
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
});

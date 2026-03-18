const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const tasksRouter = require('./routes/tasks');
const agentsRouter = require('./routes/agents');
app.use('/api/tasks', tasksRouter);
app.use('/api/agents', agentsRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Task Log running on port ${PORT}`);
});

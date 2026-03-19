// Server-Sent Events broadcast manager
// All SSE clients connect to /api/events
// Server broadcasts on: agent_update, new_message, task_update

const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (_) {
      clients.delete(client);
    }
  }
}

function clientCount() {
  return clients.size;
}

module.exports = { addClient, removeClient, broadcast, clientCount };

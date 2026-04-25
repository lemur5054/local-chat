const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// In-memory message storage (no external DB)
const messages = [];
const MAX_MESSAGES = 200; // Prevent memory bloat

io.on('connection', (socket) => {
  // Send existing messages to newly connected users
  socket.emit('load_messages', messages);

  // Handle incoming chat messages
  socket.on('chat_message', (data) => {
    if (!data || !data.text) return;

    const msg = {
      id: Date.now(),
      username: (data.username || 'Anonymous').slice(0, 20),
      text: data.text.slice(0, 500), // Limit message length
      timestamp: new Date().toISOString()
    };

    messages.push(msg);
    if (messages.length > MAX_MESSAGES) messages.shift(); // Keep only latest

    io.emit('new_message', msg);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
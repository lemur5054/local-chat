const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const MAX_MESSAGES = 200;

// Load messages on startup
let messages = [];
try {
  if (fs.existsSync(MESSAGES_FILE)) {
    messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  }
} catch (err) {
  console.warn('⚠️ Could not load messages.json, starting fresh:', err.message);
}

// Save messages to disk
function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages), 'utf8');
  } catch (err) {
    console.error('❌ Failed to save messages:', err.message);
  }
}

io.on('connection', (socket) => {
  // Send history to new users
  socket.emit('load_messages', messages);

  socket.on('chat_message', (data) => {
    if (!data || !data.text) return;

    const msg = {
      id: Date.now(),
      username: (data.username || 'Anonymous').slice(0, 20),
      text: data.text.slice(0, 500),
      timestamp: new Date().toISOString()
    };

    messages.push(msg);
    if (messages.length > MAX_MESSAGES) messages.shift();

    saveMessages();
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

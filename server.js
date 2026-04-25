const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const ROOMS_FILE = path.join(__dirname, 'rooms.json');
const MAX_MESSAGES = 200;

// Load all rooms from disk
let rooms = {};
try {
  if (fs.existsSync(ROOMS_FILE)) {
    rooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
  }
} catch (err) {
  console.warn('⚠️ Could not load rooms.json, starting fresh:', err.message);
}

// Save rooms to disk
function saveRooms() {
  try {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms), 'utf8');
  } catch (err) {
    console.error('❌ Failed to save rooms:', err.message);
  }
}

io.on('connection', (socket) => {
  // User joins a room
  socket.on('join_room', (roomId) => {
    const room = String(roomId).trim();
    
    // Validate: must be 2-99
    if (!/^[2-9]\d?$/.test(room)) {
      socket.emit('join_error', 'Invalid room. Use numbers 2-99.');
      return;
    }

    // Initialize room if it doesn't exist
    if (!rooms[room]) rooms[room] = [];

    // Join Socket.IO room
    socket.join(room);
    
    // Send room history & confirm join
    socket.emit('room_joined', { room, messages: rooms[room] });
    console.log(`✅ User joined Room #${room}`);
  });

  // User sends a message
  socket.on('chat_message', (data) => {
    const room = String(data.room).trim();
    if (!data.text || !/^[2-9]\d?$/.test(room)) return;

    // Ensure room exists
    if (!rooms[room]) rooms[room] = [];

    const msg = {
      id: Date.now(),
      username: (data.username || 'Anonymous').slice(0, 20),
      text: data.text.slice(0, 500),
      timestamp: new Date().toISOString()
    };

    // Store & cap messages
    rooms[room].push(msg);
    if (rooms[room].length > MAX_MESSAGES) rooms[room].shift();

    saveRooms();
    
    // Broadcast only to this room
    io.to(room).emit('new_message', msg);
  });

  socket.on('disconnect', () => {
    console.log('👋 User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

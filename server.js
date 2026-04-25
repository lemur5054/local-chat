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

// Track temporary room states (1-50)
const tempRoomStates = {};

// Load ONLY persistent rooms (51-99) on startup
let rooms = {};
try {
  if (fs.existsSync(ROOMS_FILE)) {
    const rawData = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
    for (const [key, msgs] of Object.entries(rawData)) {
      const num = parseInt(key, 10);
      if (num >= 51 && num <= 99) rooms[key] = msgs;
    }
  }
} catch (err) {
  console.warn('⚠️ Could not load rooms.json:', err.message);
}

function savePersistentRooms() {
  try {
    const persistentOnly = {};
    for (const [key, msgs] of Object.entries(rooms)) {
      const num = parseInt(key, 10);
      if (num >= 51 && num <= 99) persistentOnly[key] = msgs;
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(persistentOnly), 'utf8');
  } catch (err) {
    console.error('❌ Failed to save rooms:', err.message);
  }
}

io.on('connection', (socket) => {
  // User tries to join a room
  socket.on('join_room', (roomId) => {
    const room = String(roomId).trim();
    const roomNum = parseInt(room, 10);

    if (!/^[1-9]\d?$/.test(room)) {
      socket.emit('join_error', 'Invalid room. Use numbers 1-99.');
      return;
    }

    // Persistent rooms (51-99): Auto-join
    if (roomNum >= 51) {
      if (!rooms[room]) rooms[room] = [];
      socket.join(room);
      socket.emit('room_joined', { room, messages: rooms[room], isPersistent: true });
      return;
    }

    // Temporary rooms (1-50): Check state
    if (!tempRoomStates[room]) tempRoomStates[room] = false;
    
    if (tempRoomStates[room]) {
      socket.join(room);
      socket.emit('room_joined', { room, messages: rooms[room] || [], isPersistent: false });
    } else {
      socket.emit('room_waiting', { room });
    }
  });

  // Start a temporary room
  socket.on('start_temp_room', (roomId) => {
    const room = String(roomId).trim();
    const roomNum = parseInt(room, 10);
    if (roomNum < 1 || roomNum > 50 || tempRoomStates[room]) return;

    tempRoomStates[room] = true;
    rooms[room] = [];
    socket.join(room);
    io.to(room).emit('room_started', { room, messages: [] });
    socket.emit('room_joined', { room, messages: [], isPersistent: false });
  });

  // End a temporary room
  socket.on('end_temp_room', (roomId) => {
    const room = String(roomId).trim();
    const roomNum = parseInt(room, 10);
    if (roomNum < 1 || roomNum > 50 || !tempRoomStates[room]) return;

    // Clear all data
    delete rooms[room];
    tempRoomStates[room] = false;

    // Notify everyone & close room
    io.to(room).emit('room_ended', { room });
    // Clean up sockets from room
    io.in(room).disconnectSockets(true);
  });

  // Chat message
  socket.on('chat_message', (data) => {
    const room = String(data.room).trim();
    const roomNum = parseInt(room, 10);
    if (!data.text || roomNum < 1 || roomNum > 99) return;

    if (!rooms[room]) rooms[room] = [];

    const msg = {
      id: Date.now(),
      username: (data.username || 'Anonymous').slice(0, 20),
      text: data.text.slice(0, 500),
      timestamp: new Date().toISOString()
    };

    rooms[room].push(msg);
    if (rooms[room].length > MAX_MESSAGES) rooms[room].shift();

    if (roomNum >= 51) savePersistentRooms();
    io.to(room).emit('new_message', msg);
  });

  socket.on('disconnect', () => console.log('👋 User disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

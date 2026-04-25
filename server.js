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

// Load ONLY persistent rooms (51-99) on startup
let rooms = {};
try {
  if (fs.existsSync(ROOMS_FILE)) {
    const rawData = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
    for (const [key, msgs] of Object.entries(rawData)) {
      const num = parseInt(key, 10);
      if (num >= 51 && num <= 99) {
        rooms[key] = msgs;
      }
    }
  }
} catch (err) {
  console.warn('⚠️ Could not load rooms.json:', err.message);
}

// Save ONLY rooms 51-99 to disk
function savePersistentRooms() {
  try {
    const persistentOnly = {};
    for (const [key, msgs] of Object.entries(rooms)) {
      const num = parseInt(key, 10);
      if (num >= 51 && num <= 99) {
        persistentOnly[key] = msgs;
      }
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(persistentOnly), 'utf8');
  } catch (err) {
    console.error('❌ Failed to save rooms:', err.message);
  }
}

io.on('connection', (socket) => {
  socket.on('join_room', (roomId) => {
    const room = String(roomId).trim();
    const roomNum = parseInt(room, 10);

    // Validate 1-99
    if (!room || isNaN(roomNum) || roomNum < 1 || roomNum > 99) {
      socket.emit('join_error', 'Invalid room. Use numbers 1-99.');
      return;
    }

    // Initialize room if needed
    if (!rooms[room]) rooms[room] = [];

    socket.join(room);
    const isPersistent = roomNum >= 51;
    socket.emit('room_joined', { 
      room, 
      messages: rooms[room],
      isPersistent 
    });
    console.log(`✅ User joined Room #${room} (${isPersistent ? '💾 Persistent' : '🕒 Temporary'})`);
  });

  socket.on('chat_message', (data) => {
    const room = String(data.room).trim();
    const roomNum = parseInt(room, 10);
    
    if (!data.text || isNaN(roomNum) || roomNum < 1 || roomNum > 99) return;

    if (!rooms[room]) rooms[room] = [];

    const msg = {
      id: Date.now(),
      username: (data.username || 'Anonymous').slice(0, 20),
      text: data.text.slice(0, 500),
      timestamp: new Date().toISOString()
    };

    rooms[room].push(msg);
    if (rooms[room].length > MAX_MESSAGES) rooms[room].shift();

    // Only save to disk for rooms 51-99
    if (roomNum >= 51) {
      savePersistentRooms();
    }

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

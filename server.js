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

// Persistent rooms (51-99)
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

// Temporary room state (1-50)
const tempRoomStates = {};      // { room: boolean }
const tempRoomConfig = {};      // { room: { password: string|null, maxUsers: number } }
const tempRoomUsers = {};       // { room: Set<socketId> }

io.on('connection', (socket) => {
  socket.on('join_room', (data) => {
    const room = String(typeof data === 'object' ? data.room : data).trim();
    const joinPassword = typeof data === 'object' ? (data.password || '') : '';
    const roomNum = parseInt(room, 10);

    if (!/^[1-9]\d?$/.test(room)) {
      socket.emit('join_error', 'Invalid room. Use numbers 1-99.');
      return;
    }

    // Persistent rooms (51-99)
    if (roomNum >= 51) {
      if (!rooms[room]) rooms[room] = [];
      socket.join(room);
      socket.emit('room_joined', { room, messages: rooms[room], isPersistent: true, config: { maxUsers: Infinity } });
      return;
    }

    // Temporary rooms (1-50)
    if (!tempRoomStates[room]) {
      socket.emit('room_waiting', { room });
      return;
    }

    const config = tempRoomConfig[room];
    if (!tempRoomUsers[room]) tempRoomUsers[room] = new Set();

    // Password check
    if (config.password && joinPassword !== config.password) {
      socket.emit('join_error', '❌ Incorrect password.');
      return;
    }

    // User limit check
    if (tempRoomUsers[room].size >= config.maxUsers) {
      socket.emit('join_error', '🚫 Room is full.');
      return;
    }

    // Join room
    tempRoomUsers[room].add(socket.id);
    socket.join(room);
    io.to(room).emit('user_count', tempRoomUsers[room].size);
    socket.emit('room_joined', {
      room,
      messages: rooms[room] || [],
      isPersistent: false,
      config: { hasPassword: !!config.password, maxUsers: config.maxUsers }
    });
  });

  // Start temporary room with settings
  socket.on('start_temp_room', (data) => {
    const { room, password, maxUsers } = data;
    const roomNum = parseInt(room, 10);
    if (roomNum < 1 || roomNum > 50 || tempRoomStates[room]) return;

    const max = Math.min(Math.max(parseInt(maxUsers, 10) || 10, 2), 50);

    tempRoomStates[room] = true;
    rooms[room] = [];
    tempRoomConfig[room] = { password: password || null, maxUsers: max };
    tempRoomUsers[room] = new Set([socket.id]);

    socket.join(room);
    io.to(room).emit('room_started', { config: tempRoomConfig[room] });
    socket.emit('room_joined', {
      room,
      messages: [],
      isPersistent: false,
      config: { hasPassword: !!password, maxUsers: max }
    });
  });

  // End temporary room
  socket.on('end_temp_room', (roomId) => {
    const room = String(roomId).trim();
    if (!tempRoomStates[room]) return;

    io.to(room).emit('room_ended', { room });
    io.in(room).disconnectSockets(true);

    delete rooms[room];
    delete tempRoomStates[room];
    delete tempRoomConfig[room];
    delete tempRoomUsers[room];
  });

  // Chat message
  socket.on('chat_message', (data) => {
    const room = String(data.room).trim();
    const roomNum = parseInt(room, 10);
    if (!data.text || roomNum < 1 || roomNum > 99) return;
    if (roomNum <= 50 && !tempRoomStates[room]) return;

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

  socket.on('disconnect', () => {
    for (const [room, users] of Object.entries(tempRoomUsers)) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        io.to(room).emit('user_count', users.size);
        break;
      }
    }
    console.log('👋 User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

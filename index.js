// index.js (ルーム参加の論理エラーを修正した最終完成版)

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const db = require('./database.js');
const { iconStorage, imageStorage } = require('./cloudinaryConfig.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

const uploadIcon = multer({ storage: iconStorage });
const uploadImage = multer({ storage: imageStorage });

app.post('/upload', uploadImage.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File not uploaded.' });
    res.json({ imageUrl: req.file.path });
});
app.post('/upload-icon', uploadIcon.single('icon'), async (req, res) => {
    if (!req.file || !req.body.userName) return res.status(400).json({ error: 'File or username missing.' });
    try {
        const { userName } = req.body;
        const iconUrl = req.file.path;
        await db.query('UPDATE users SET icon_url = $1 WHERE name = $2', [iconUrl, userName]);
        io.emit('user icon changed', { userName, newIconUrl: iconUrl });
        res.json({ iconUrl });
    } catch (error) { console.error('Icon upload error:', error); res.status(500).send('Server error'); }
});

io.on('connection', (socket) => {
    console.log(`user connected: ${socket.id}`);

    socket.on('user connected', async (userName) => {
        try {
            await db.query('INSERT INTO users (name, socket_id) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET socket_id = $2', [userName, socket.id]);
            const { rows: userRows } = await db.query('SELECT icon_url FROM users WHERE name = $1', [userName]);
            if (userRows[0]) socket.emit('my info', { iconUrl: userRows[0].icon_url });
            const { rows: roomRows } = await db.query('SELECT name, is_private FROM rooms');
            io.emit('update rooms', roomRows);
            const { rows: usersRows } = await db.query('SELECT name, icon_url FROM users WHERE socket_id IS NOT NULL');
            io.emit('update user list', usersRows);
        } catch (error) { console.error('Error on user connected:', error); }
    });

    socket.on('create room', async ({ roomName, password, creator }) => {
        try {
            await db.query('INSERT INTO rooms (name, password, creator) VALUES ($1, $2, $3)', [roomName, password, creator]);
            const { rows } = await db.query('SELECT name, is_private FROM rooms');
            io.emit('update rooms', rows);
        } catch (error) { console.error('Error on create room:', error); }
    });

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★                                                  ★
    // ★    ここが、今回の問題を解決する最重要修正箇所です    ★
    // ★                                                  ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    socket.on('attempt join room', async ({ roomName, password }) => {
        try {
            console.log(`[Server] User trying to join room: "${roomName}"`); // デバッグ用ログ
            const { rows } = await db.query('SELECT * FROM rooms WHERE name = $1', [roomName]);
            const room = rows[0];

            if (!room) {
                console.log(`[Server] Join failed: Room "${roomName}" not found.`);
                return socket.emit('join failure', 'そのルームは存在しません。');
            }

            // パスワードが設定されているか (NULLや空文字列でないか) を確認
            const isPasswordProtected = room.password && room.password.length > 0;

            if (isPasswordProtected && room.password !== password) {
                console.log(`[Server] Join failed: Incorrect password for room "${roomName}".`);
                return socket.emit('join failure', 'パスワードが違います。');
            }

            // パスワードチェックを通過
            console.log(`[Server] Join success for room: "${roomName}". Fetching history...`);
            socket.join(roomName);
            const { rows: history } = await db.query("SELECT id, sender_name as name, text_content as text, image as imageUrl, timestamp as time, read_by FROM messages WHERE room_name = $1 ORDER BY timestamp ASC", [roomName]);
            
            console.log(`[Server] Emitting 'join success' to client for room "${roomName}".`);
            socket.emit('join success', { roomName, history, isPrivate: room.is_private });

        } catch (error) { console.error('Error on attempt join room:', error); }
    });

    socket.on('chat message', async (msg) => {
        try {
            const room = msg.room;
            const readBy = JSON.stringify([msg.name]);
            const result = await db.query('INSERT INTO messages (room_name, sender_name, text_content, image, read_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, timestamp', [room, msg.name, msg.text, msg.imageUrl, readBy]);
            const { rows: user } = await db.query('SELECT icon_url FROM users WHERE name = $1', [msg.name]);
            const messageData = { id: result.rows[0].id, name: msg.name, text: msg.text, imageUrl: msg.imageUrl, time: result.rows[0].timestamp, iconUrl: user[0]?.icon_url, read_by: [msg.name] };
            io.to(room).emit('chat message', { room, data: messageData });
        } catch (error) { console.error('Error on chat message:', error); }
    });
    
    socket.on('disconnect', async () => {
        try {
            console.log(`user disconnected: ${socket.id}`);
            await db.query('UPDATE users SET socket_id = NULL WHERE socket_id = $1', [socket.id]);
            const { rows } = await db.query('SELECT name, icon_url FROM users WHERE socket_id IS NOT NULL');
            io.emit('update user list', rows);
        } catch (error) { console.error('Error on disconnect:', error); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running and listening on port ${PORT}`);
});
// index.js (未読数通知機能を完全に復元した最終完成版)

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

// ★ どのユーザーがどのルームにいるかを管理するオブジェクト
const userSocketRoomMap = {};

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
    console.log(`[Socket] user connected: ${socket.id}`);

    const handleError = (eventName, error) => {
        console.error(`[Socket Error] on event "${eventName}":`, error);
        socket.emit('server error', { event: eventName, message: error.message || 'An unknown error occurred.' });
    };

    socket.on('user connected', async (userName) => {
        try {
            await db.query('INSERT INTO users (name, socket_id) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET socket_id = $2', [userName, socket.id]);
            const { rows: userRows } = await db.query('SELECT icon_url FROM users WHERE name = $1', [userName]);
            if (userRows[0]) socket.emit('my info', { iconUrl: userRows[0].icon_url });
            const { rows: roomRows } = await db.query('SELECT name, is_private FROM rooms');
            io.emit('update rooms', roomRows);
            const { rows: usersRows } = await db.query('SELECT name, icon_url FROM users WHERE socket_id IS NOT NULL');
            io.emit('update user list', usersRows);
        } catch (error) { handleError('user connected', error); }
    });

    socket.on('create room', async ({ roomName, password, creator }) => {
        try {
            await db.query('INSERT INTO rooms (name, password, creator) VALUES ($1, $2, $3)', [roomName, password, creator]);
            const { rows } = await db.query('SELECT name, is_private FROM rooms');
            io.emit('update rooms', rows);
        } catch (error) { handleError('create room', error); }
    });

    socket.on('attempt join room', async ({ roomName, password }) => {
        try {
            const { rows } = await db.query('SELECT * FROM rooms WHERE name = $1', [roomName]);
            const room = rows[0];
            if (!room) return socket.emit('join failure', 'そのルームは存在しません。');
            const isPasswordProtected = room.password && room.password.length > 0;
            if (isPasswordProtected && room.password !== password) {
                return socket.emit('join failure', 'パスワードが違います。');
            }
            socket.join(roomName);
            userSocketRoomMap[socket.id] = roomName; // ★ ユーザーが入室したことを記録
            const { rows: history } = await db.query("SELECT id, sender_name as name, text_content as text, image_url as imageUrl, timestamp as time, read_by FROM messages WHERE room_name = $1 ORDER BY timestamp ASC", [roomName]);
            socket.emit('join success', { roomName, history, isPrivate: room.is_private });
        } catch (error) { handleError('attempt join room', error); }
    });

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★                                                  ★
    // ★    ここが、私のミスで抜け落ちていた機能の本体です    ★
    // ★                                                  ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    socket.on('chat message', async (msg) => {
        try {
            const room = msg.room;
            const readBy = JSON.stringify([msg.name]);
            const result = await db.query('INSERT INTO messages (room_name, sender_name, text_content, image_url, read_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, timestamp', [room, msg.name, msg.text, msg.imageUrl, readBy]);
            const { rows: user } = await db.query('SELECT icon_url FROM users WHERE name = $1', [msg.name]);
            const messageData = { id: result.rows[0].id, name: msg.name, text: msg.text, imageUrl: msg.imageUrl, time: result.rows[0].timestamp, iconUrl: user[0]?.icon_url, read_by: [msg.name] };
            
            // ★ そのルームにいる人には普通にメッセージを送る
            io.to(room).emit('chat message', { room, data: messageData });

            // ★ そのルームにいない人には「未読」を通知する
            for (const [socketId, userRoom] of Object.entries(userSocketRoomMap)) {
                if (userRoom !== room) {
                    io.to(socketId).emit('new unread message', { roomName: room });
                }
            }
        } catch (error) { handleError('chat message', error); }
    });
    
    socket.on('mark as read', async ({ roomName, messageIds, userName }) => {
        try {
            for (const id of messageIds) {
                const { rows: msgResult } = await db.query('SELECT read_by FROM messages WHERE id = $1', [id]);
                if (msgResult[0]) {
                    let readers = msgResult[0].read_by || [];
                    if (!readers.includes(userName)) {
                        readers.push(userName);
                        await db.query('UPDATE messages SET read_by = $1 WHERE id = $2', [JSON.stringify(readers), id]);
                        io.to(roomName).emit('update read status', { messageId: id, readers });
                    }
                }
            }
        } catch (error) { handleError('mark as read', error); }
    });
    
    socket.on('start private chat', async (targetUserName) => {
        try {
            const { rows: userResult } = await db.query('SELECT name FROM users WHERE socket_id = $1', [socket.id]);
            if (!userResult[0]) return;
            const currentUserName = userResult[0].name;
            const roomName = [currentUserName, targetUserName].sort().join('-');
            const { rows: roomResult } = await db.query('SELECT * FROM rooms WHERE name = $1', [roomName]);
            if (!roomResult[0]) {
                await db.query('INSERT INTO rooms (name, password, creator, is_private) VALUES ($1, $2, $3, true)', [roomName, '', currentUserName]);
                const { rows } = await db.query('SELECT name, is_private FROM rooms');
                io.emit('update rooms', rows);
            }
        } catch (error) { handleError('start private chat', error); }
    });

    socket.on('disconnect', async () => {
        try {
            console.log(`[Socket] user disconnected: ${socket.id}`);
            delete userSocketRoomMap[socket.id]; // ★ ユーザーが退室したことを記録
            await db.query('UPDATE users SET socket_id = NULL WHERE socket_id = $1', [socket.id]);
            const { rows } = await db.query('SELECT name, icon_url FROM users WHERE socket_id IS NOT NULL');
            io.emit('update user list', rows);
        } catch (error) { handleError('disconnect', error); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running and listening on port ${PORT}`);
});
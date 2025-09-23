// ★ dotenv を一番最初に読み込む
require('dotenv').config();

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const multer = require('multer');
const { setupDatabase } = require('./database.js');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

app.use(express.static('public'));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'y-chat/messages', format: async (req, file) => 'png' } });
const upload = multer({ storage: storage });
const iconStorage = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'y-chat/icons', format: async (req, file) => 'png', public_id: (req, file) => `icon-${req.body.userName}` } });
const uploadIcon = multer({ storage: iconStorage });

app.post('/upload', upload.single('image'), (req, res) => { if (req.file) res.json({ imageUrl: req.file.path }); else res.status(400).send('ファイルのアップロードに失敗しました。'); });
app.post('/upload-icon', uploadIcon.single('icon'), async (req, res) => {
    const userName = req.body.userName;
    if (req.file && userName) {
        const newIconUrl = req.file.path;
        try {
            await db.query('UPDATE users SET icon_url = $1 WHERE name = $2', [newIconUrl, userName]);
            io.emit('user icon changed', { userName, newIconUrl });
            res.json({ iconUrl: newIconUrl });
        } catch(e) { console.error('アイコンURLのDB更新に失敗:', e); res.status(500).send('データベースエラー'); }
    } else { res.status(400).send('アップロード失敗'); }
});

let db;
const onlineUsers = {};

async function broadcastUserList() {
    try {
        const usersResult = await db.query('SELECT name, icon_url FROM users WHERE name = ANY($1::text[])', [Object.values(onlineUsers)]);
        io.emit('update user list', usersResult.rows);
    } catch(e) { console.error("ユーザーリストの取得に失敗:", e); }
}

async function sendRoomList(socket) {
    const userName = socket.userName; if (!userName) return;
    try {
        const myRoomsResult = await db.query("SELECT name, is_private FROM rooms WHERE participants @> $1", [`["${userName}"]`]);
        socket.emit('update rooms', myRoomsResult.rows);
    } catch(e) { console.error("ルームリストの取得に失敗:", e); }
}

function joinRoom(socket, roomName) {
    if (socket.currentRoom) { socket.leave(socket.currentRoom); }
    socket.join(roomName);
    socket.currentRoom = roomName;
}

io.on('connection', (socket) => {
    socket.on('user connected', async (userName) => {
        onlineUsers[socket.id] = userName;
        socket.userName = userName;
        await db.query('INSERT INTO users (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [userName]);
        const userResult = await db.query('SELECT icon_url FROM users WHERE name = $1', [userName]);
        if (userResult.rows.length > 0) socket.emit('my info', { iconUrl: userResult.rows[0].icon_url });
        sendRoomList(socket);
        broadcastUserList();
    });

    socket.on('create room', async ({ roomName, password, creator }) => {
        await db.query('INSERT INTO rooms (name, password, creator, participants, is_private) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING', [roomName, password, creator, JSON.stringify([creator]), false]);
        joinRoom(socket, roomName);
        sendRoomList(socket);
        socket.emit('join success', { roomName, history: [] });
    });

    socket.on('start private chat', async (targetUserName) => {
        const initiatorName = socket.userName; if (targetUserName === initiatorName) return;
        const roomName = [initiatorName, targetUserName].sort().join('-');
        await db.query('INSERT INTO rooms (name, creator, participants, is_private) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING', [roomName, initiatorName, JSON.stringify([initiatorName, targetUserName]), true]);
        const historyResult = await db.query(`SELECT m.id, m.sender_name as name, m.text_content as text, m.image_url as imageUrl, m.timestamp as time, m.read_by, u.icon_url as iconUrl FROM messages m JOIN users u ON m.sender_name = u.name WHERE m.room_name = $1 ORDER BY m.timestamp ASC`, [roomName]);
        const targetSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id] === targetUserName);
        if (targetSocketId) { const targetSocket = io.sockets.sockets.get(targetSocketId); joinRoom(targetSocket, roomName); sendRoomList(targetSocket); targetSocket.emit('join success', { roomName, history: historyResult.rows }); }
        joinRoom(socket, roomName);
        sendRoomList(socket);
        socket.emit('join success', { roomName, history: historyResult.rows });
    });

    socket.on('attempt join room', async ({ roomName, password }) => {
        const userName = socket.userName;
        const roomResult = await db.query('SELECT * FROM rooms WHERE name = $1', [roomName]);
        if (roomResult.rows.length === 0 || !userName) return socket.emit('join failure', '指定されたトークルームは存在しません。');
        const room = roomResult.rows[0];
        const isAuthorized = room.is_private || room.creator === userName || room.password === password;
        if (!isAuthorized) return socket.emit('join failure', 'パスワードが間違っています。');
        if (!room.participants.includes(userName)) { room.participants.push(userName); await db.query('UPDATE rooms SET participants = $1 WHERE name = $2', [JSON.stringify(room.participants), roomName]); sendRoomList(socket); }
        joinRoom(socket, roomName);
        const historyResult = await db.query(`SELECT m.id, m.sender_name as name, m.text_content as text, m.image_url as imageUrl, m.timestamp as time, m.read_by, u.icon_url as iconUrl FROM messages m JOIN users u ON m.sender_name = u.name WHERE m.room_name = $1 ORDER BY m.timestamp ASC`, [roomName]);
        socket.emit('join success', { roomName, history: historyResult.rows });
    });

    socket.on('chat message', async (msg) => {
        const roomName = socket.currentRoom; if (!roomName) return;
        const senderResult = await db.query('SELECT icon_url FROM users WHERE name = $1', [msg.name]);
        const senderIcon = senderResult.rows.length > 0 ? senderResult.rows[0].icon_url : '/uploads/icons/default.svg';
        const timestamp = new Date();
        const messageData = { id: Date.now() + Math.random().toString(36).substr(2, 9), room_name: roomName, sender_name: msg.name, text_content: msg.text || null, image_url: msg.imageUrl || null, timestamp: timestamp, read_by: JSON.stringify([msg.name]) };
        await db.query('INSERT INTO messages (id, room_name, sender_name, text_content, image_url, timestamp, read_by) VALUES ($1, $2, $3, $4, $5, $6, $7)', Object.values(messageData));
        const clientMessageData = { id: messageData.id, name: messageData.sender_name, text: messageData.text_content, imageUrl: messageData.image_url, time: messageData.timestamp, read_by: messageData.read_by, iconUrl: senderIcon };
        const messagePacket = { room: roomName, data: clientMessageData };
        const roomResult = await db.query('SELECT participants FROM rooms WHERE name = $1', [roomName]);
        if (roomResult.rows.length > 0) {
            const participants = roomResult.rows[0].participants;
            const userSocketMap = Object.entries(onlineUsers).reduce((acc, [id, name]) => { acc[name] = id; return acc; }, {});
            participants.forEach(pName => { const targetSocketId = userSocketMap[pName]; if (targetSocketId) { io.to(targetSocketId).emit('chat message', messagePacket); } });
        }
    });

    socket.on('mark as read', async ({ roomName, messageIds }) => {
        const userName = socket.userName; if (!userName || !messageIds || messageIds.length === 0) return;
        try {
            for (const msgId of messageIds) {
                await db.query("UPDATE messages SET read_by = read_by || $1::jsonb WHERE id = $2 AND NOT (read_by @> $1::jsonb)", [JSON.stringify(userName), msgId]);
                const updatedMsgResult = await db.query('SELECT read_by FROM messages WHERE id = $1', [msgId]);
                if (updatedMsgResult.rows.length > 0) { io.to(roomName).emit('update read status', { messageId: msgId, readers: updatedMsgResult.rows[0].read_by }); }
            }
        } catch (e) { console.error('既読情報の更新に失敗:', e); }
    });

    socket.on('delete message', async ({ roomId, messageId }) => {
        const result = await db.query('DELETE FROM messages WHERE id = $1 AND sender_name = $2', [messageId, socket.userName]);
        if (result.rowCount > 0) { io.to(roomId).emit('message deleted', { messageId }); }
    });
    
    socket.on('change username', async ({ oldName, newName }) => { /* ... 機能一時停止 ... */ });
    socket.on('disconnect', () => { delete onlineUsers[socket.id]; broadcastUserList(); });
});

async function startServer() {
    db = await setupDatabase();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`サーバーがポート${PORT}で起動しました`));
}

startServer();
const express = require('express'); const app = express(); const http = require('http'); const server = http.createServer(app); const { Server } = require("socket.io"); const io = new Server(server); const multer = require('multer'); const { setupDatabase } = require('./database.js'); const fs = require('fs'); const path = require('path');
app.use(express.static('public'));
const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, 'public/uploads/'), filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname) });
const upload = multer({ storage: storage });
app.post('/upload', upload.single('image'), (req, res) => { if (req.file) res.json({ imageUrl: `/uploads/${req.file.filename}` }); else res.status(400).send('ファイルのアップロードに失敗しました。'); });
const iconStorage = multer.diskStorage({ destination: (req, file, cb) => cb(null, 'public/uploads/icons/'), filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)) });
const uploadIcon = multer({ storage: iconStorage });
app.post('/upload-icon', uploadIcon.single('icon'), async (req, res) => {
    const userName = req.body.userName;
    if (req.file && userName) {
        const newIconUrl = `/uploads/icons/${req.file.filename}`;
        try {
            const oldIcon = await db.get('SELECT icon_url FROM users WHERE name = ?', [userName]);
            if (oldIcon && oldIcon.icon_url !== '/uploads/icons/default.svg') {
                fs.unlink(path.join(__dirname, 'public', oldIcon.icon_url), (err) => { if (err) console.error("古いアイコンの削除に失敗:", err); });
            }
            await db.run('UPDATE users SET icon_url = ? WHERE name = ?', [newIconUrl, userName]);
            io.emit('user icon changed', { userName, newIconUrl });
            res.json({ iconUrl: newIconUrl });
        } catch(e) { res.status(500).send('データベースエラー'); }
    } else { res.status(400).send('アップロード失敗'); }
});

let db; const onlineUsers = {};

// ★★★ ユーザーリスト配信ロジックを修正 ★★★
async function broadcastUserList() {
    const usersWithIcons = [];
    for (const name of Object.values(onlineUsers)) {
        const user = await db.get('SELECT icon_url FROM users WHERE name = ?', [name]);
        usersWithIcons.push({ name, iconUrl: user ? user.icon_url : '/uploads/icons/default.svg' });
    }
    io.emit('update user list', usersWithIcons);
}

async function sendRoomList(socket) { const userName = socket.userName; if (!userName) return; const allRooms = await db.all("SELECT name, is_private, participants FROM rooms"); const myRooms = allRooms.filter(room => { try { return JSON.parse(room.participants).includes(userName); } catch (e) { return false; } }); socket.emit('update rooms', myRooms.map(row => ({ name: row.name, isPrivate: !!row.is_private }))); }
function joinRoom(socket, roomName) { if (socket.currentRoom) { socket.leave(socket.currentRoom); } socket.join(roomName); socket.currentRoom = roomName; }

io.on('connection', (socket) => {
    socket.on('user connected', async (userName) => {
        onlineUsers[socket.id] = userName; socket.userName = userName;
        await db.run('INSERT OR IGNORE INTO users (name) VALUES (?)', [userName]);
        const user = await db.get('SELECT icon_url FROM users WHERE name = ?', [userName]);
        if (user) socket.emit('my info', { iconUrl: user.icon_url });
        sendRoomList(socket); broadcastUserList();
    });
    socket.on('create room', async ({ roomName, password, creator }) => { const existing = await db.get('SELECT name FROM rooms WHERE name = ?', [roomName]); if (!existing) { await db.run('INSERT INTO rooms (name, password, creator, participants, is_private) VALUES (?, ?, ?, ?, ?)', [roomName, password, creator, JSON.stringify([creator]), 0]); joinRoom(socket, roomName); sendRoomList(socket); socket.emit('join success', { roomName, history: [] }); } });
    socket.on('start private chat', async (targetUserName) => {
        const initiatorName = socket.userName; if (targetUserName === initiatorName) return;
        const roomName = [initiatorName, targetUserName].sort().join('-');
        let room = await db.get('SELECT * FROM rooms WHERE name = ?', [roomName]);
        if (!room) { await db.run('INSERT INTO rooms (name, creator, participants, is_private) VALUES (?, ?, ?, ?)', [roomName, initiatorName, JSON.stringify([initiatorName, targetUserName]), 1]); }
        const history = await db.all('SELECT *, sender_name as name, text_content as text, image_url as imageUrl, timestamp as time FROM messages WHERE room_name = ? ORDER BY timestamp ASC', [roomName]);
        const targetSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id] === targetUserName);
        if (targetSocketId) { const targetSocket = io.sockets.sockets.get(targetSocketId); joinRoom(targetSocket, roomName); sendRoomList(targetSocket); targetSocket.emit('join success', { roomName, history }); }
        joinRoom(socket, roomName); sendRoomList(socket); socket.emit('join success', { roomName, history });
    });
    socket.on('attempt join room', async ({ roomName, password }) => {
        const userName = socket.userName; const room = await db.get('SELECT * FROM rooms WHERE name = ?', [roomName]); if (!room || !userName) return socket.emit('join failure', '指定されたトークルームは存在しません。'); const isAuthorized = room.is_private || room.creator === userName || room.password === password; if (!isAuthorized) return socket.emit('join failure', 'パスワードが間違っています。');
        let participants = JSON.parse(room.participants); if (!participants.includes(userName)) { participants.push(userName); await db.run('UPDATE rooms SET participants = ? WHERE name = ?', [JSON.stringify(participants), roomName]); sendRoomList(socket); }
        joinRoom(socket, roomName);
        // ★★★ 履歴取得時にアイコン情報もJOINして取得 ★★★
        const history = await db.all(`
            SELECT m.id, m.sender_name as name, m.text_content as text, m.image_url as imageUrl, m.timestamp as time, m.read_by, u.icon_url as iconUrl
            FROM messages m JOIN users u ON m.sender_name = u.name WHERE m.room_name = ? ORDER BY m.timestamp ASC
        `, [roomName]);
        socket.emit('join success', { roomName, history });
    });
    socket.on('chat message', async (msg) => {
        const roomName = socket.currentRoom; if (!roomName) return;
        const sender = await db.get('SELECT icon_url FROM users WHERE name = ?', [msg.name]); const senderIcon = sender ? sender.icon_url : '/uploads/icons/default.svg';
        const timestamp = new Date().toISOString(); const messageData = { id: Date.now() + Math.random().toString(36).substr(2, 9), room_name: roomName, sender_name: msg.name, text_content: msg.text || null, image_url: msg.imageUrl || null, timestamp: timestamp, read_by: JSON.stringify([msg.name]) };
        await db.run('INSERT INTO messages (id, room_name, sender_name, text_content, image_url, timestamp, read_by) VALUES (?, ?, ?, ?, ?, ?, ?)', Object.values(messageData));
        const clientMessageData = { id: messageData.id, name: messageData.sender_name, text: messageData.text_content, imageUrl: messageData.image_url, time: messageData.timestamp, read_by: messageData.read_by, iconUrl: senderIcon };
        const messagePacket = { room: roomName, data: clientMessageData }; const room = await db.get('SELECT participants FROM rooms WHERE name = ?', [roomName]);
        if (room) { const participants = JSON.parse(room.participants); const userSocketMap = Object.entries(onlineUsers).reduce((acc, [id, name]) => { acc[name] = id; return acc; }, {}); participants.forEach(pName => { const targetSocketId = userSocketMap[pName]; if (targetSocketId) { io.to(targetSocketId).emit('chat message', messagePacket); } }); }
    });
    socket.on('mark as read', async ({ roomName, messageIds }) => { const userName = socket.userName; if (!userName || !messageIds || messageIds.length === 0) return; try { for (const msgId of messageIds) { const msg = await db.get('SELECT read_by FROM messages WHERE id = ?', [msgId]); if (msg) { let readers = JSON.parse(msg.read_by); if (!readers.includes(userName)) { readers.push(userName); await db.run('UPDATE messages SET read_by = ? WHERE id = ?', [JSON.stringify(readers), msgId]); io.to(roomName).emit('update read status', { messageId: msgId, readers: readers }); } } } } catch (e) { console.error('既読情報の更新に失敗:', e); } });
    socket.on('delete message', async ({ roomId, messageId }) => { const userName = socket.userName; if (roomId && messageId && userName) { const result = await db.run('DELETE FROM messages WHERE id = ? AND sender_name = ?', [messageId, userName]); if (result.changes > 0) { io.to(roomId).emit('message deleted', { messageId }); } } });
    socket.on('change username', async ({ oldName, newName }) => { if (!oldName || !newName || oldName === newName) return; await db.run('UPDATE users SET name = ? WHERE name = ?', [newName, oldName]); const affectedRooms = await db.all('SELECT name, participants FROM rooms'); for (const room of affectedRooms) { let participants = JSON.parse(room.participants); if (participants.includes(oldName)) { participants = participants.map(p => p === oldName ? newName : p); await db.run('UPDATE rooms SET participants = ?, creator = ? WHERE name = ?', [JSON.stringify(participants), newName, room.name]); } } await db.run('UPDATE messages SET sender_name = ? WHERE sender_name = ?', [newName, oldName]); onlineUsers[socket.id] = newName; socket.userName = newName; broadcastUserList(); sendRoomList(socket); });
    socket.on('disconnect', () => { delete onlineUsers[socket.id]; broadcastUserList(); });
});

async function startServer() { db = await setupDatabase(); const PORT = process.env.PORT || 3000; server.listen(PORT, () => console.log(`サーバーがポート${PORT}で起動しました`)); }
startServer();
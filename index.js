// index.js (すべての機能を復元した完成版)

// --- 必要なモジュールのインポート ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('./database.js'); // database.jsからdbオブジェクトをインポート

// --- Expressアプリとサーバーの初期化 ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 静的ファイルの配信設定 ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ルートURL ("/") へのアクセス設定 ---
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- ファイルアップロード用の設定 ---
const uploadsDir = path.join(__dirname, 'uploads');
const iconsDir = path.join(uploadsDir, 'icons');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const uploadImage = multer({ storage: imageStorage });

const iconStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, iconsDir),
    filename: (req, file, cb) => {
        const safeUserName = req.body.userName.replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${safeUserName}${path.extname(file.originalname) || '.png'}`);
    }
});
const uploadIcon = multer({ storage: iconStorage });

// --- ファイルアップロード用のAPIエンドポイント ---
app.post('/upload', uploadImage.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File not uploaded.' });
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

app.post('/upload-icon', uploadIcon.single('icon'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File not uploaded.' });
    const iconUrl = `/uploads/icons/${req.file.filename}`;
    db.run('UPDATE users SET icon_url = ? WHERE name = ?', [iconUrl, req.body.userName], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('user icon changed', { userName: req.body.userName, newIconUrl: iconUrl });
        res.json({ iconUrl });
    });
});

// --- ★★★ Socket.IOの通信処理 (全機能復元) ★★★ ---
io.on('connection', (socket) => {
    console.log(`user connected: ${socket.id}`);

    // ユーザーがブラウザを開いた時の処理
    socket.on('user connected', (userName) => {
        db.run('INSERT INTO users (name, socket_id) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET socket_id=excluded.socket_id, icon_url=icon_url', [userName, socket.id], function(err) {
            if (err) return console.error(err.message);
            
            db.get('SELECT icon_url FROM users WHERE name = ?', [userName], (err, row) => {
                if (row) socket.emit('my info', { iconUrl: row.icon_url });
            });

            db.all('SELECT name, is_private FROM rooms', [], (err, rooms) => {
                if (!err) io.emit('update rooms', rooms);
            });
            db.all('SELECT name, icon_url FROM users', [], (err, users) => {
                if (!err) io.emit('update user list', users);
            });
        });
    });

    // ルーム作成
    socket.on('create room', ({ roomName, password, creator }) => {
        db.run('INSERT INTO rooms (name, password) VALUES (?, ?)', [roomName, password], function(err) {
            if (err) return console.error(err.message);
            io.emit('force refresh rooms');
        });
    });

    // ルーム参加
    socket.on('attempt join room', ({ roomName, password }) => {
        db.get('SELECT * FROM rooms WHERE name = ?', [roomName], (err, room) => {
            if (!room) return socket.emit('join failure', 'そのルームは存在しません。');
            if (room.password !== password && password !== null) return socket.emit('join failure', 'パスワードが違います。');
            
            socket.join(roomName);
            db.all('SELECT id, user_name as name, text, image_url, timestamp as time, read_by FROM messages WHERE room_name = ? ORDER BY timestamp ASC', [roomName], (err, history) => {
                socket.emit('join success', { roomName, history, isPrivate: !!room.is_private });
            });
        });
    });

    // メッセージ送受信
    socket.on('chat message', (msg) => {
        const room = msg.room || Object.keys(socket.rooms).find(r => r !== socket.id);
        if (!room) return;
        const readBy = JSON.stringify([msg.name]);
        db.run('INSERT INTO messages (room_name, user_name, text, image_url, read_by) VALUES (?, ?, ?, ?, ?)', [room, msg.name, msg.text, msg.imageUrl, readBy], function(err) {
            if (err) return console.error(err.message);
            const messageId = this.lastID;
            db.get('SELECT icon_url FROM users WHERE name = ?', [msg.name], (err, user) => {
                const messageData = { id: messageId, name: msg.name, text: msg.text, imageUrl: msg.imageUrl, time: new Date().toISOString(), iconUrl: user.icon_url, read_by: [msg.name] };
                io.to(room).emit('chat message', { room, data: messageData });
            });
        });
    });

    // 既読処理
    socket.on('mark as read', ({ roomName, messageIds }) => {
        db.get('SELECT name FROM users WHERE socket_id = ?', [socket.id], (err, user) => {
            if (!user) return;
            messageIds.forEach(id => {
                db.get('SELECT read_by FROM messages WHERE id = ?', [id], (err, msg) => {
                    if(!msg) return;
                    let readers = JSON.parse(msg.read_by || '[]');
                    if (!readers.includes(user.name)) {
                        readers.push(user.name);
                        db.run('UPDATE messages SET read_by = ? WHERE id = ?', [JSON.stringify(readers), id], () => {
                            io.to(roomName).emit('update read status', { messageId: id, readers });
                        });
                    }
                });
            });
        });
    });
    
    // メッセージ削除
    socket.on('delete message', ({ roomId, messageId }) => {
        db.run('DELETE FROM messages WHERE id = ?', [messageId], function(err) {
            if (err) return console.error(err.message);
            io.to(roomId).emit('message deleted', { messageId });
        });
    });

    // ユーザー名変更
    socket.on('change username', ({ oldName, newName }) => {
        db.run('UPDATE users SET name = ? WHERE name = ?', [newName, oldName], function(err) {
            if (err) return console.error(err.message);
            db.all('SELECT name, icon_url FROM users', [], (err, users) => {
                if (!err) io.emit('update user list', users);
            });
        });
    });

    // 個人チャット開始
    socket.on('start private chat', (targetUserName) => {
        db.get('SELECT name FROM users WHERE socket_id = ?', [socket.id], (err, currentUser) => {
            if (!currentUser) return;
            const roomName = [currentUser.name, targetUserName].sort().join('-');
            db.get('SELECT * FROM rooms WHERE name = ?', [roomName], (err, room) => {
                if (!room) {
                    db.run('INSERT INTO rooms (name, is_private) VALUES (?, 1)', [roomName], () => io.emit('force refresh rooms'));
                }
            });
        });
    });

    // 接続切断
    socket.on('disconnect', () => {
        console.log(`user disconnected: ${socket.id}`);
        db.run('DELETE FROM users WHERE socket_id = ?', socket.id, () => {
            db.all('SELECT name, icon_url FROM users', [], (err, users) => {
                if (!err) io.emit('update user list', users);
            });
        });
    });
});

// --- サーバーの起動 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running and listening on port ${PORT}`);
});
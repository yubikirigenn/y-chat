// --- 必要なモジュールのインポート ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// --- ExpressアプリとHTTPサーバー、Socket.IOサーバーの初期化 ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- ★★★ 静的ファイルの配信設定 (最重要) ★★★ ---
// プロジェクトのルートフォルダにあるファイル(index.html, style.cssなど)を配信可能にする
app.use(express.static(__dirname));
// アップロードされたファイルを配信するための設定
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ルートURL ("/") にアクセスが来た時に index.html を返す設定 ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- データベースへの接続 ---
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('✅ Connected to the chat database.');
    }
});

// --- データベースのテーブルがなければ作成 ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, password TEXT, is_private BOOLEAN DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, socket_id TEXT, icon_url TEXT DEFAULT '/uploads/icons/default.svg')`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_name TEXT, user_name TEXT, text TEXT, image_url TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, read_by TEXT DEFAULT '[]')`);
});

// --- ファイルアップロード用の設定 ---
const uploadsDir = path.join(__dirname, 'uploads');
const iconsDir = path.join(uploadsDir, 'icons');
// フォルダが存在しない場合に作成
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

// 画像アップロード用
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const uploadImage = multer({ storage: imageStorage });

// アイコンアップロード用
const iconStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, iconsDir),
    filename: (req, file, cb) => {
        // ユーザー名からファイル名を生成（例: yukiyuki_geman.png）
        const safeUserName = req.body.userName.replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${safeUserName}${path.extname(file.originalname) || '.png'}`);
    }
});
const uploadIcon = multer({ storage: iconStorage });

// --- ファイルアップロード用のAPIエンドポイント ---
app.post('/upload', uploadImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'File not uploaded.' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

app.post('/upload-icon', uploadIcon.single('icon'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'File not uploaded.' });
    }
    const iconUrl = `/uploads/icons/${req.file.filename}`;
    db.run('UPDATE users SET icon_url = ? WHERE name = ?', [iconUrl, req.body.userName], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        io.emit('user icon changed', { userName: req.body.userName, newIconUrl: iconUrl });
        res.json({ iconUrl });
    });
});

// --- ★★★ Socket.IOの通信処理 ★★★ ---
// ここに、あなたの main.js が必要とする全てのサーバー側処理を記述します。
// 既にお持ちのコードをこの io.on('connection', ...) の中に移植してください。
io.on('connection', (socket) => {
    console.log(`user connected: ${socket.id}`);

    // 例：ユーザー接続時の処理
    socket.on('user connected', (userName) => {
        // (ここにユーザーDB登録、ユーザーリスト更新通知などの処理を記述)
    });

    // 例：チャットメッセージ受信時の処理
    socket.on('chat message', (msg) => {
        // (ここにメッセージをDBに保存し、ルーム内の全員にブロードキャストする処理を記述)
    });
    
    // 例：ルーム作成時の処理
    socket.on('create room', (data) => {
        // (ここにルーム作成処理を記述)
    });

    // 例：ルーム参加試行時の処理
    socket.on('attempt join room', (data) => {
        // (ここにルーム参加処理を記述)
    });

    // 例：メッセージ削除時の処理
    socket.on('delete message', (data) => {
        // (ここにメッセージ削除処理を記述)
    });

    // ...など、あなたのアプリに必要な全てのsocket.onイベントをここに記述 ...

    // 接続切断時の処理
    socket.on('disconnect', () => {
        console.log(`user disconnected: ${socket.id}`);
        // (ここにユーザーDBから削除、ユーザーリスト更新通知などの処理を記述)
    });
});


// --- ★★★ サーバーの起動 (最重要) ★★★ ---
// Render.comが指定するポート、またはローカル開発用の3000番ポートで起動
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  // サーバーが正常に起動したことをログに出力
  console.log(`✅ Server is running and listening on port ${PORT}`);
});
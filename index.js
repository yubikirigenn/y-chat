// index.js (最終確定版)

// --- 必要なモジュールのインポート ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// ★★★ database.jsからdbオブジェクトをインポート ★★★
const db = require('./database.js');

// --- Expressアプリとサーバーの初期化 ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- ★★★ 静的ファイルの配信設定 (最重要・修正点) ★★★ ---
// 'public' という名前のフォルダを、HTML/CSS/JSファイルの置き場所として指定します。
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
// 'uploads' フォルダも同様に配信設定します。
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ルートURL ("/") へのアクセス設定 ---
// publicフォルダの中のindex.htmlを返すようにします。
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

// --- Socket.IOの通信処理 ---
io.on('connection', (socket) => {
    console.log(`user connected: ${socket.id}`);

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★                                                  ★
    // ★   あなたの既存の `io.on('connection', ...)` の   ★
    // ★   中身をここにすべてコピー＆ペーストしてください。   ★
    // ★                                                  ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

});

// --- サーバーの起動 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running and listening on port ${PORT}`);
});
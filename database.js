// database.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルへのパスを指定
const dbPath = path.resolve(__dirname, 'chat.db');

// データベースに接続
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('✅ Connected to the chat database.');
    }
});

// データベースのテーブルがなければ作成する
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        password TEXT,
        is_private BOOLEAN DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        socket_id TEXT,
        icon_url TEXT DEFAULT '/uploads/icons/default.svg'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_name TEXT,
        user_name TEXT,
        text TEXT,
        image_url TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_by TEXT DEFAULT '[]'
    )`);
});

// 他のファイルからdbオブジェクトをインポートして使えるようにする
module.exports = db;
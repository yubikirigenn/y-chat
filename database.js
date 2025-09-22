const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function openDb() {
    return open({ filename: './chat.db', driver: sqlite3.Database });
}

async function setupDatabase() {
    const db = await openDb();

    await db.exec(`
        -- ★★★ ユーザー情報を保存する新しいテーブル ★★★
        CREATE TABLE IF NOT EXISTS users (
            name TEXT PRIMARY KEY,
            icon_url TEXT NOT NULL DEFAULT '/uploads/icons/default.svg'
        );

        CREATE TABLE IF NOT EXISTS rooms (
            name TEXT PRIMARY KEY, password TEXT, creator TEXT NOT NULL,
            participants TEXT NOT NULL, is_private INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY, room_name TEXT NOT NULL, sender_name TEXT NOT NULL,
            text_content TEXT, image_url TEXT, timestamp TEXT NOT NULL,
            read_by TEXT NOT NULL DEFAULT '[]'
        );
    `);
    console.log('データベースの準備が完了しました。');
    return db;
}

module.exports = { setupDatabase };
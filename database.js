// dotenv を一番最初に読み込む
require('dotenv').config();
const { Pool } = require('pg');
// ★★★ RenderがどのURLを使っているか、ログに強制的に表示させる ★★★
console.log("--- DATABASE CONNECTION DEBUG ---");
console.log("DATABASE_URL from env:", process.env.DATABASE_URL);
console.log("---------------------------------");
const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: {
rejectUnauthorized: false
}
});
async function setupDatabase() {
    try {
        // プールからクライアントを取得してテスト接続
        const client = await pool.connect();
        console.log('データベースに接続しました。');
        
        // テーブル作成クエリ
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                name TEXT PRIMARY KEY,
                icon_url TEXT NOT NULL DEFAULT '/uploads/icons/default.svg'
            );
            CREATE TABLE IF NOT EXISTS rooms (
                name TEXT PRIMARY KEY, password TEXT, creator TEXT NOT NULL,
                participants JSONB NOT NULL, is_private BOOLEAN NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY, room_name TEXT NOT NULL,
                sender_name TEXT NOT NULL, text_content TEXT, image_url TEXT,
                timestamp TIMESTAMPTZ NOT NULL, read_by JSONB NOT NULL DEFAULT '[]'
            );
        `);
        client.release(); // クライアントをプールに返却
        console.log('データベースのテーブル準備が完了しました。');
        return pool; // ★ clientではなくpoolを返す
    } catch (e) {
        console.error('データベースのセットアップに失敗しました:', e);
        process.exit(1);
    }
}

module.exports = { setupDatabase };
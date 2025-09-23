// dotenv を一番最初に読み込む（ローカル環境用）
require('dotenv').config();

const { Pool } = require('pg');

// プール接続を一度だけ作成
const pool = new Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // RenderからSupabaseへの接続に必要
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
        return pool; // clientではなくpoolを返す
    } catch (e) {
        console.error('データベースのセットアップに失敗しました:', e);
        process.exit(1); // エラーでプロセスを終了
    }
}

module.exports = { setupDatabase };
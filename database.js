// database.js (Supabase接続用)
const { Pool } = require('pg');

// Renderの環境変数からデータベース接続文字列を取得
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set!");
}

const pool = new Pool({
    connectionString: connectionString,
});

console.log('✅ Database connection pool created for Supabase.');

// 他のファイルから接続プールを使えるようにエクスポート
module.exports = {
    query: (text, params) => pool.query(text, params),
};
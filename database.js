// database.js (あなたの設定に合わせた最終版)
const { Pool } = require('pg');

// Renderの環境変数から、あなたが設定した正しいKeyの名前で接続文字列を取得
const connectionString = process.env.SUPABASE_DATABASE_URL; // ★★★ ここを修正しました ★★★

if (!connectionString) {
    // もし環境変数が見つからなかった場合にエラーを出す
    throw new Error("SUPABASE_DATABASE_URL environment variable is not set!");
}

const pool = new Pool({
    connectionString: connectionString,
});

console.log('✅ Database connection pool created for Supabase.');

// 他のファイルから接続プールを使えるようにエクスポート
module.exports = {
    query: (text, params) => pool.query(text, params),
};
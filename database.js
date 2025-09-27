// database.js (最終完成版)
const { Pool } = require('pg');
const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
    throw new Error("SUPABASE_DATABASE_URL environment variable is not set!");
}

const pool = new Pool({ connectionString });
console.log('✅ Database connection pool created for Supabase.');

module.exports = {
    query: (text, params) => pool.query(text, params),
};
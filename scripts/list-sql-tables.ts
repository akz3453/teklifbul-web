
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'teklifbul',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'teklifbul', // Trial password based on DB name
});

async function listTables() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log("Existing Tables:", res.rows.map(r => r.table_name));

    for (const table of res.rows) {
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;
      `, [table.table_name]);
      console.log(`\nTable: ${table.table_name}`);
      console.table(columns.rows);
    }

  } catch (err) {
    console.error("Error listing tables:", err);
  } finally {
    await pool.end();
  }
}

listTables();

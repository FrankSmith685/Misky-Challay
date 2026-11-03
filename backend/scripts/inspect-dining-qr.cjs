/* DiagnÃ³stico de solo lectura para arranques fallidos por el Ã­ndice QR. */
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'DulceFlow',
  });
  const [columns] = await connection.query("SHOW COLUMNS FROM dining_tables LIKE 'qr_token'");
  const [summary] = await connection.query(`
    SELECT COUNT(*) AS total,
      SUM(qr_token IS NULL) AS nulls,
      SUM(LENGTH(qr_token) = 0) AS empties,
      COUNT(DISTINCT CASE WHEN LENGTH(qr_token) > 0 THEN qr_token END) AS unique_tokens
    FROM dining_tables
  `);
  const [index] = await connection.query(
    "SHOW INDEX FROM dining_tables WHERE Key_name = 'uq_dining_tables_qr_token'",
  );
  console.log(JSON.stringify({ columns, summary: summary[0], index }, null, 2));
  await connection.end();
})().catch((error) => {
  console.error(error.code || error.name, error.message);
  process.exitCode = 1;
});

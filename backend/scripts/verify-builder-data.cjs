require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [options] = await connection.query(
      "SELECT COUNT(*) total, SUM(image_url LIKE '/images/builder/ingredients/%') with_individual_image, SUM(JSON_LENGTH(dietary_tags) > 0) with_tags FROM customization_options",
    );
    const [presets] = await connection.query(
      'SELECT COUNT(*) total, SUM(is_active = 1) active FROM builder_presets',
    );
    const [tables] = await connection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name IN ('media_assets','saved_bowls','builder_presets','builder_preset_items')",
      [process.env.DB_NAME],
    );
    console.log(JSON.stringify({
      options: options[0],
      presets: presets[0],
      tables: tables.map((row) => row.TABLE_NAME || row.table_name),
    }, null, 2));
  } finally {
    await connection.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

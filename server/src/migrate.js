require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const appPool = require("./db");
const pool = appPool.createDatabasePool(
  process.env.DB_MIGRATION_USER || process.env.DB_USER,
  process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD,
);

async function main() {
  const directory = path.join(__dirname, "..", "migrations");
  const files = (await fs.readdir(directory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  for (const file of files) {
    const [rows] = await pool.execute("SELECT version FROM schema_migrations WHERE version = ?", [file]);
    if (rows.length) continue;

    const sql = await fs.readFile(path.join(directory, file), "utf8");
    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
    const connection = await pool.getConnection();
    try {
      for (const statement of statements) await connection.query(statement);
      await connection.execute("INSERT INTO schema_migrations (version) VALUES (?)", [file]);
      console.log(`Applied migration ${file}`);
    } finally {
      connection.release();
    }
  }
}

main()
  .catch((error) => {
    console.error("Database migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([pool.end(), appPool.end()]));

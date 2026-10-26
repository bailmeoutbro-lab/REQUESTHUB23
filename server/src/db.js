const mysql = require("mysql2/promise");

function createDatabasePool(user = process.env.DB_USER, password = process.env.DB_PASSWORD) {
  const database = process.env.DB_NAME || "requesthub";
  const port = Number(process.env.DB_PORT || 3306);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(database)) {
    throw new Error("DB_NAME must be a valid MySQL database identifier.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port.");
  }
  if (!password) {
    throw new Error("Set the database password in server/.env before running database tools or the API.");
  }

  return mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port,
    database,
    user: user || "requesthub_app",
    password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
    decimalNumbers: true,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
}

const pool = createDatabasePool();

pool.createDatabasePool = createDatabasePool;
module.exports = pool;

require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");
const mysql = require("mysql2/promise");

function readHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this setup from the interactive VS Code terminal so the MySQL root password stays private.");
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const input = process.stdin;
    const previousRawMode = input.isRaw;
    input.setRawMode(true);
    input.resume();
    let value = "";
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("MySQL setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    function cleanup() {
      input.removeListener("data", onData);
      input.setRawMode(previousRawMode);
      input.pause();
    }
    input.on("data", onData);
  });
}

async function prompt(question) {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await terminal.question(question)).trim();
  } finally {
    terminal.close();
  }
}

function quoteAccount(name) {
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(name)) throw new Error("Invalid MySQL account name.");
  return `'${name}'@'127.0.0.1'`;
}

async function main() {
  const envPath = path.join(__dirname, "..", ".env");
  try {
    await fs.access(envPath);
    throw new Error("server/.env already exists. Refusing to replace local database credentials.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3306);
  const suppliedPassword = process.env.REQUESTHUB_MYSQL_ROOT_PASSWORD;
  delete process.env.REQUESTHUB_MYSQL_ROOT_PASSWORD;
  const rootPassword = suppliedPassword || await readHidden("MySQL root password (input hidden; never stored): ");
  const connection = await mysql.createConnection({
    host,
    port,
    user: "root",
    password: rootPassword,
    connectTimeout: 10000,
    charset: "utf8mb4",
  });
  let databaseCreated = false;
  let appUserCreated = false;
  let migrationUserCreated = false;

  try {
    const [[{ version }]] = await connection.query("SELECT VERSION() AS version");
    if (!/^8\./.test(version)) throw new Error(`MySQL 8 is required; connected server reports ${version}.`);

    const [[existingSchema]] = await connection.execute(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'requesthub'",
    );
    if (existingSchema) {
      throw new Error("A requesthub database already exists. Nothing was changed; inspect it and back it up before choosing what to do next.");
    }
    const [[{ existingAccounts }]] = await connection.execute(
      `SELECT COUNT(*) AS existingAccounts FROM mysql.user
       WHERE (User = 'requesthub_app' OR User = 'requesthub_migrator')
         AND Host = '127.0.0.1'`,
    );
    if (Number(existingAccounts) !== 0) {
      throw new Error("A RequestHub MySQL account already exists. Nothing was changed; inspect its grants before continuing.");
    }

    const applicationPassword = crypto.randomBytes(32).toString("hex");
    const migrationPassword = crypto.randomBytes(32).toString("hex");
    const appAccount = quoteAccount("requesthub_app");
    const migrationAccount = quoteAccount("requesthub_migrator");

    await connection.query(
      "CREATE DATABASE requesthub CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci",
    );
    databaseCreated = true;
    await connection.query(`CREATE USER ${appAccount} IDENTIFIED BY ${connection.escape(applicationPassword)}`);
    appUserCreated = true;
    await connection.query(`CREATE USER ${migrationAccount} IDENTIFIED BY ${connection.escape(migrationPassword)}`);
    migrationUserCreated = true;
    await connection.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON requesthub.* TO ${appAccount}`,
    );
    await connection.query(`GRANT ALL PRIVILEGES ON requesthub.* TO ${migrationAccount}`);

    const envFile = [
      "NODE_ENV=development",
      "HOST=127.0.0.1",
      "PORT=3001",
      "APP_ORIGIN=http://localhost:3001",
      "APP_ORIGINS=http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173",
      `DB_HOST=${host}`,
      `DB_PORT=${port}`,
      "DB_NAME=requesthub",
      "DB_USER=requesthub_app",
      `DB_PASSWORD=${applicationPassword}`,
      "DB_MIGRATION_USER=requesthub_migrator",
      `DB_MIGRATION_PASSWORD=${migrationPassword}`,
      "DB_SSL=false",
      "SESSION_TTL_HOURS=12",
      "",
    ].join("\n");
    await fs.writeFile(envPath, envFile, { flag: "wx", mode: 0o600 });

    console.log(`Connected to MySQL ${version}.`);
    console.log("Created database requesthub and separate restricted application and migration accounts.");
    console.log("Generated credentials were written only to the ignored server/.env file; no passwords were printed.");
    console.log("Next: run the RequestHub: Apply MySQL migrations task.");
  } catch (error) {
    if (migrationUserCreated) await connection.query(`DROP USER IF EXISTS ${quoteAccount("requesthub_migrator")}`);
    if (appUserCreated) await connection.query(`DROP USER IF EXISTS ${quoteAccount("requesthub_app")}`);
    if (databaseCreated) await connection.query("DROP DATABASE IF EXISTS requesthub");
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  if (error.code === "ER_ACCESS_DENIED_ERROR") {
    console.error("MySQL rejected the root password. Nothing was changed; rerun the setup task and retry.");
  } else {
    console.error("MySQL setup failed:", error.message);
  }
  process.exitCode = 1;
});

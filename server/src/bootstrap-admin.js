require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("node:readline/promises");
const pool = require("./db");
const { normalizedEmail, validPassword } = require("./domain");

async function prompt(question, hidden = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Set ${question.split(":")[0]} in the local environment for a non-interactive run.`);
  }
  if (!hidden) {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await terminal.question(question)).trim();
    } finally {
      terminal.close();
    }
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
          reject(new Error("Administrator bootstrap cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
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

async function main() {
  const email = normalizedEmail(process.env.ADMIN_EMAIL || await prompt("ADMIN_EMAIL: "));
  const name = (process.env.ADMIN_NAME || await prompt("ADMIN_NAME: ")).trim();
  const password = process.env.ADMIN_PASSWORD || await prompt("ADMIN_PASSWORD (input hidden): ", true);

  if (!email || !name || name.length > 160 || !validPassword(password)) {
    throw new Error("Set a valid ADMIN_EMAIL and ADMIN_NAME, and an ADMIN_PASSWORD of at least 14 characters and no more than 72 UTF-8 bytes.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SELECT id FROM system_settings WHERE id = 1 FOR UPDATE");
    const [admins] = await connection.query(
      "SELECT id FROM users WHERE role = 'administrator' AND is_active = TRUE LIMIT 1",
    );
    if (admins.length) throw new Error("An active administrator already exists; the bootstrap command can only run once.");

    const [result] = await connection.execute(
      `INSERT INTO users (institutional_email, full_name, password_hash, role, is_active)
       VALUES (?, ?, ?, 'administrator', TRUE)`,
      [email, name, passwordHash],
    );
    await connection.execute(
      `INSERT INTO activity_logs (actor_user_id, action, affected_record_type, affected_record_id, details)
       VALUES (?, 'administrator_bootstrapped', 'user', ?, JSON_OBJECT('email', ?))`,
      [result.insertId, result.insertId, email],
    );
    await connection.commit();
    console.log(`Created the initial administrator account for ${email}. No password was logged.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch((error) => {
    console.error("Administrator bootstrap failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

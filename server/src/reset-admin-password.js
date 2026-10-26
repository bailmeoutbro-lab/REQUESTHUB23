require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("node:readline/promises");
const pool = require("./db");
const { normalizedEmail, validPassword } = require("./domain");

async function prompt(question, hidden = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this command in the VS Code integrated terminal.");
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
          reject(new Error("Password reset cancelled."));
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
  const email = normalizedEmail(await prompt("Administrator email: "));
  if (!email) throw new Error("Enter a valid email address.");

  const password = await prompt("New password (input hidden): ", true);
  const confirmation = await prompt("Confirm new password (input hidden): ", true);
  if (!validPassword(password)) {
    throw new Error("Choose a password of at least 14 characters and no more than 72 UTF-8 bytes.");
  }
  if (password !== confirmation) throw new Error("The passwords do not match.");

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SELECT id FROM system_settings WHERE id = 1 FOR UPDATE");
    const [admins] = await connection.execute(
      `SELECT id FROM users
       WHERE institutional_email = ? AND role = 'administrator' AND is_active = TRUE
       FOR UPDATE`,
      [email],
    );
    if (!admins.length) throw new Error("No active administrator account matches that email.");

    const adminId = admins[0].id;
    await connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, adminId]);
    await connection.execute("DELETE FROM auth_sessions WHERE user_id = ?", [adminId]);
    await connection.execute(
      `INSERT INTO activity_logs (actor_user_id, action, affected_record_type, affected_record_id, details)
       VALUES (NULL, 'administrator_password_reset', 'user', ?, JSON_OBJECT('email', ?))`,
      [adminId, email],
    );
    await connection.commit();
    console.log(`Password reset successfully for ${email}. Sign in with the new password.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch((error) => {
    console.error("Administrator password reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

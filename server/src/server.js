require("dotenv").config();

const bcrypt = require("bcryptjs");
const cors = require("cors");
const crypto = require("node:crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const multer = require("multer");
const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("./db");
const {
  PRIORITIES,
  ROLES,
  STATUSES,
  isAllowedTransition,
  normalizedEmail,
  positiveId,
  validDate,
  validPassword,
} = require("./domain");

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";
const appOrigin = process.env.APP_ORIGIN || `http://localhost:${port}`;
const allowedOrigins = new Set(
  (process.env.APP_ORIGINS || `${appOrigin},http://localhost:5173`)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS || 12);
const secureCookie = process.env.NODE_ENV === "production";
const cookieName = secureCookie ? "__Host-requesthub_session" : "requesthub_session";
const uploadDirectory = path.resolve(__dirname, "..", "uploads");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");
if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 24) {
  throw new Error("SESSION_TTL_HOURS must be between 1 and 24.");
}
if (new URL(appOrigin).origin !== appOrigin) throw new Error("APP_ORIGIN must contain only a scheme, host, and port.");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function createNotification(connection, userId, requestId, kind, title, message) {
  await connection.execute(
    `INSERT INTO notifications (user_id, request_id, kind, title, message)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, requestId, kind, title, message],
  );
}

function uploadError(error, _request, _response, next) {
  if (error instanceof multer.MulterError) {
    return next(new HttpError(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, "Attachment upload failed or exceeds the file limits."));
  }
  if (error instanceof HttpError) return next(error);
  next(error);
}

const allowedUploadTypes = new Map([
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/webp", new Set([".webp"])],
  ["application/pdf", new Set([".pdf"])],
  ["text/plain", new Set([".txt"])],
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, _file, callback) => callback(null, crypto.randomUUID()),
  }),
  limits: { files: 3, fileSize: 5 * 1024 * 1024 },
  fileFilter(_request, file, callback) {
    const extensions = allowedUploadTypes.get(file.mimetype);
    const extension = path.extname(file.originalname).toLowerCase();
    if (!extensions || !extensions.has(extension)) {
      return callback(new HttpError(400, "Attachments must be PDF, PNG, JPEG, WebP, or plain text."));
    }
    callback(null, true);
  },
});

function cookieToken(request) {
  const header = request.headers.cookie || "";
  for (const item of header.split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === cookieName) return decodeURIComponent(value.join("="));
  }
  return null;
}

function setSessionCookie(response, token, expiresAt) {
  const options = [
    `${cookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secureCookie) options.push("Secure");
  response.setHeader("Set-Cookie", options.join("; "));
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie ? "; Secure" : ""}`,
  );
}

function requireOrigin(request, _response, next) {
  if (!allowedOrigins.has(request.get("origin"))) return next(new HttpError(403, "Invalid request origin."));
  next();
}

async function authenticate(request, _response, next) {
  try {
    const token = cookieToken(request);
    if (!token || token.length < 40 || token.length > 100) throw new HttpError(401, "Authentication required.");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [rows] = await pool.execute(
      `SELECT u.id, u.institutional_email, u.full_name, u.role, u.department_id
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.is_active = TRUE
       LIMIT 1`,
      [tokenHash],
    );
    if (!rows.length) throw new HttpError(401, "Authentication required.");
    request.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

function requireRoles(...roles) {
  return (request, _response, next) => {
    if (!request.user || !roles.includes(request.user.role)) return next(new HttpError(403, "You are not authorized to perform this action."));
    next();
  };
}

function requireAdmin(request, response, next) {
  authenticate(request, response, (error) => {
    if (error) return next(error);
    requireRoles("administrator")(request, response, next);
  });
}

function bodyObject(request) {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    throw new HttpError(400, "A JSON object is required.");
  }
  return request.body;
}

function requiredText(value, name, maximum, minimum = 1) {
  if (typeof value !== "string") throw new HttpError(400, `${name} is required.`);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new HttpError(400, `${name} must be ${minimum}-${maximum} characters.`);
  }
  return result;
}

function parseId(value, name = "ID") {
  const id = positiveId(value);
  if (!id) throw new HttpError(400, `Invalid ${name}.`);
  return id;
}

function parseOptionalId(value, name) {
  if (value === null || value === "") return null;
  return parseId(value, name);
}

function dateFilters(request) {
  const { from, to } = request.query;
  if (from && !validDate(from)) throw new HttpError(400, "Invalid from date; use YYYY-MM-DD.");
  if (to && !validDate(to)) throw new HttpError(400, "Invalid to date; use YYYY-MM-DD.");
  if (from && to && from > to) throw new HttpError(400, "The from date must not be after the to date.");
  return { from: from || null, to: to || null };
}

function pageNumber(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) throw new HttpError(400, "Page and limit values must be whole numbers.");
  return Math.max(1, Math.min(Number(value), maximum));
}

function addDateConditions(filters, column = "r.created_at") {
  const clauses = [];
  const params = [];
  if (filters.from) {
    clauses.push(`${column} >= ?`);
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    clauses.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(`${filters.to} 00:00:00`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

async function recordActivity(connection, actorId, action, recordType, recordId, details = null) {
  await connection.execute(
    `INSERT INTO activity_logs (actor_user_id, action, affected_record_type, affected_record_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [actorId, action, recordType, recordId, details === null ? null : JSON.stringify(details)],
  );
}

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, origin || appOrigin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
}));
app.use(express.json({ limit: "64kb", strict: true }));
app.use((request, response, next) => {
  if (["POST", "PATCH"].includes(request.method)) return requireOrigin(request, response, next);
  next();
});

app.get("/api/health", async (_request, response, next) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }),
  async (request, response, next) => {
    try {
      const body = bodyObject(request);
      const email = normalizedEmail(body.email);
      if (!email || typeof body.password !== "string" || Buffer.byteLength(body.password, "utf8") > 72) {
        throw new HttpError(400, "Enter a valid institutional email and password.");
      }
      const [rows] = await pool.execute(
        `SELECT id, institutional_email, full_name, password_hash, role, department_id, is_active
         FROM users WHERE institutional_email = ? LIMIT 1`,
        [email],
      );
      const user = rows[0];
      const validPassword = user?.password_hash ? await bcrypt.compare(body.password, user.password_hash) : false;
      if (!user || !user.is_active || !validPassword) throw new HttpError(401, "Invalid email or password.");
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + sessionTtlHours * 60 * 60 * 1000);
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await pool.execute(
        "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        [user.id, tokenHash, expiresAt],
      );
      setSessionCookie(response, token, expiresAt);
      response.json({
        user: {
          id: user.id,
          email: user.institutional_email,
          fullName: user.full_name,
          role: user.role,
          departmentId: user.department_id,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/auth/me", authenticate, (request, response) => {
  response.json({
    user: {
      id: request.user.id,
      email: request.user.institutional_email,
      fullName: request.user.full_name,
      role: request.user.role,
      departmentId: request.user.department_id,
    },
  });
});

app.get("/api/catalog/categories", authenticate, async (_request, response, next) => {
  try {
    const [categories] = await pool.query(
      "SELECT id, name, description FROM request_categories WHERE is_active = TRUE ORDER BY name",
    );
    response.json({ categories });
  } catch (error) {
    next(error);
  }
});

app.get("/api/catalog/departments", authenticate, async (_request, response, next) => {
  try {
    const [departments] = await pool.query(
      "SELECT id, name, code FROM departments WHERE is_active = TRUE ORDER BY name",
    );
    response.json({ departments });
  } catch (error) {
    next(error);
  }
});

app.get("/api/mis/assignees", authenticate, requireRoles("mis", "administrator"), async (_request, response, next) => {
  try {
    const [users] = await pool.query(
      `SELECT id, full_name AS fullName FROM users
       WHERE role = 'mis' AND is_active = TRUE ORDER BY full_name`,
    );
    response.json({ users });
  } catch (error) {
    next(error);
  }
});

app.get("/api/mis/technicians", authenticate, requireRoles("mis", "administrator"), async (_request, response, next) => {
  try {
    const [technicians] = await pool.query(
      `SELECT id, name, description, gender, specialization, experience_years AS experienceYears,
        contact, availability, is_placeholder AS isPlaceholder, is_active AS isActive
       FROM technicians WHERE is_active = TRUE ORDER BY name`,
    );
    response.json({ technicians });
  } catch (error) {
    next(error);
  }
});

app.get("/api/notifications", authenticate, async (request, response, next) => {
  try {
    const [notifications] = await pool.execute(
      `SELECT id, request_id AS requestId, kind, title, message,
        read_at AS readAt, created_at AS createdAt
       FROM notifications WHERE user_id = ?
       ORDER BY id DESC LIMIT 50`,
      [request.user.id],
    );
    response.json({
      notifications,
      unreadCount: notifications.reduce((count, item) => count + Number(!item.readAt), 0),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/notifications/read-all", authenticate, async (request, response, next) => {
  try {
    await pool.execute(
      "UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL",
      [request.user.id],
    );
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", authenticate, async (request, response, next) => {
  try {
    const token = cookieToken(request);
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await pool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hash]);
    clearSessionCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/dashboard", requireAdmin, async (_request, response, next) => {
  try {
    const [[requestCounts]] = await pool.query(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(status = 'new'), 0) AS new_requests,
        COALESCE(SUM(status = 'in_progress'), 0) AS in_progress,
        COALESCE(SUM(status = 'resolved'), 0) AS resolved
       FROM requests`,
    );
    const [[userCounts]] = await pool.query(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(role = 'faculty_staff'), 0) AS faculty_staff,
        COALESCE(SUM(role = 'mis'), 0) AS mis_personnel
       FROM users`,
    );
    response.json({ requests: requestCounts, users: userCounts });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireAdmin, async (request, response, next) => {
  try {
    const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
    const role = request.query.role;
    if (role && !ROLES.has(role)) throw new HttpError(400, "Invalid user role.");
    const active = request.query.active;
    if (active !== undefined && !["true", "false"].includes(active)) throw new HttpError(400, "Invalid active filter.");
    const page = pageNumber(request.query.page, 1, 100000);
    const limit = pageNumber(request.query.limit, 50, 100);
    const conditions = [];
    const params = [];
    if (search) {
      conditions.push("(u.full_name LIKE ? OR u.institutional_email LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      conditions.push("u.role = ?");
      params.push(role);
    }
    if (active !== undefined) {
      conditions.push("u.is_active = ?");
      params.push(active === "true");
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params,
    );
    const [users] = await pool.execute(
      `SELECT u.id, u.institutional_email AS email, u.full_name AS fullName, u.role,
        u.department_id AS departmentId, d.name AS departmentName, u.is_active AS isActive,
        u.created_at AS createdAt, u.updated_at AS updatedAt
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    response.json({ users, page, limit, total });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", requireAdmin, async (request, response, next) => {
  try {
    const body = bodyObject(request);
    const email = normalizedEmail(body.email);
    if (!email) throw new HttpError(400, "Enter a valid institutional email.");
    const fullName = requiredText(body.fullName, "Full name", 160);
    if (!ROLES.has(body.role)) throw new HttpError(400, "Invalid user role.");
    if (!validPassword(body.password)) {
      throw new HttpError(400, "Set a temporary password of at least 14 characters and no more than 72 UTF-8 bytes.");
    }
    const departmentId = parseOptionalId(body.departmentId, "department ID");
    if (departmentId) {
      const [departments] = await pool.execute("SELECT id FROM departments WHERE id = ? AND is_active = TRUE", [departmentId]);
      if (!departments.length) throw new HttpError(400, "Select an active department.");
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    const result = await withTransaction(async (connection) => {
      const [insert] = await connection.execute(
        `INSERT INTO users (institutional_email, full_name, password_hash, role, department_id)
         VALUES (?, ?, ?, ?, ?)`,
        [email, fullName, passwordHash, body.role, departmentId],
      );
      await recordActivity(connection, request.user.id, "user_created", "user", insert.insertId, {
        email,
        role: body.role,
        departmentId,
      });
      return insert.insertId;
    });
    response.status(201).json({ id: result });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return next(new HttpError(409, "That institutional email is already registered."));
    next(error);
  }
});

app.patch("/api/admin/users/:id", requireAdmin, async (request, response, next) => {
  try {
    const id = parseId(request.params.id, "user ID");
    const body = bodyObject(request);
    const allowed = new Set(["email", "fullName", "role", "departmentId", "isActive", "password"]);
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
      throw new HttpError(400, "Provide one or more supported user fields.");
    }

    const values = [];
    const updates = [];
    const auditDetails = {};
    if (Object.hasOwn(body, "email")) {
      const email = normalizedEmail(body.email);
      if (!email) throw new HttpError(400, "Enter a valid institutional email.");
      updates.push("institutional_email = ?");
      values.push(email);
      auditDetails.email = email;
    }
    if (Object.hasOwn(body, "fullName")) {
      updates.push("full_name = ?");
      values.push(requiredText(body.fullName, "Full name", 160));
      auditDetails.fullName = values[values.length - 1];
    }
    if (Object.hasOwn(body, "role")) {
      if (!ROLES.has(body.role)) throw new HttpError(400, "Invalid user role.");
      updates.push("role = ?");
      values.push(body.role);
      auditDetails.role = body.role;
    }
    if (Object.hasOwn(body, "departmentId")) {
      const departmentId = parseOptionalId(body.departmentId, "department ID");
      if (departmentId) {
        const [departments] = await pool.execute("SELECT id FROM departments WHERE id = ? AND is_active = TRUE", [departmentId]);
        if (!departments.length) throw new HttpError(400, "Select an active department.");
      }
      updates.push("department_id = ?");
      values.push(departmentId);
      auditDetails.departmentId = departmentId;
    }
    if (Object.hasOwn(body, "isActive")) {
      if (typeof body.isActive !== "boolean") throw new HttpError(400, "isActive must be true or false.");
      updates.push("is_active = ?");
      values.push(body.isActive);
      auditDetails.isActive = body.isActive;
    }
    if (Object.hasOwn(body, "password")) {
      if (!validPassword(body.password)) {
        throw new HttpError(400, "Set a password of at least 14 characters and no more than 72 UTF-8 bytes.");
      }
      updates.push("password_hash = ?");
      values.push(await bcrypt.hash(body.password, 12));
    }

    await withTransaction(async (connection) => {
      await connection.query("SELECT id FROM system_settings WHERE id = 1 FOR UPDATE");
      const [users] = await connection.execute("SELECT id, role, is_active FROM users WHERE id = ? FOR UPDATE", [id]);
      if (!users.length) throw new HttpError(404, "User not found.");
      const current = users[0];
      const resultingRole = Object.hasOwn(body, "role") ? body.role : current.role;
      const resultingActive = Object.hasOwn(body, "isActive") ? body.isActive : Boolean(current.is_active);
      if (current.role === "administrator" && current.is_active && (resultingRole !== "administrator" || !resultingActive)) {
        const [[count]] = await connection.query(
          "SELECT COUNT(*) AS active_admins FROM users WHERE role = 'administrator' AND is_active = TRUE",
        );
        if (count.active_admins <= 1) throw new HttpError(409, "The last active administrator cannot be demoted or deactivated.");
      }
      values.push(id);
      await connection.execute(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
      await connection.execute("DELETE FROM auth_sessions WHERE user_id = ?", [id]);
      await recordActivity(connection, request.user.id, "user_updated", "user", id, auditDetails);
    });
    response.json({ success: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return next(new HttpError(409, "That institutional email is already registered."));
    next(error);
  }
});

function addCatalogRoutes(name, table, fields) {
  const base = `/api/admin/${name}`;
  app.get(base, requireAdmin, async (_request, response, next) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY name`);
      response.json({ records: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post(base, requireAdmin, async (request, response, next) => {
    try {
      const body = bodyObject(request);
      const accepted = new Set(["name", ...fields.extra]);
      if (Object.keys(body).some((key) => !accepted.has(key))) {
        throw new HttpError(400, "Provide only supported catalog fields.");
      }
      const nameValue = requiredText(body.name, "Name", fields.nameMax);
      const columns = ["name"];
      const values = [nameValue];
      const placeholders = ["?"];
      const details = { name: nameValue };
      for (const field of fields.extra) {
        if (field === "code") {
          const code = requiredText(body.code, "Code", 32).toUpperCase();
          if (!/^[A-Z0-9_-]+$/.test(code)) throw new HttpError(400, "Code may contain only letters, numbers, hyphens, and underscores.");
          columns.push("code");
          values.push(code);
          placeholders.push("?");
          details.code = code;
        } else if (field === "description") {
          const description = body.description === undefined ? null : requiredText(body.description, "Description", 500);
          columns.push("description");
          values.push(description);
          placeholders.push("?");
          details.description = description;
        }
      }
      const id = await withTransaction(async (connection) => {
        const [insert] = await connection.execute(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
          values,
        );
        await recordActivity(connection, request.user.id, `${name}_created`, name, insert.insertId, details);
        return insert.insertId;
      });
      response.status(201).json({ id });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return next(new HttpError(409, "A record with that name or code already exists."));
      next(error);
    }
  });

  app.patch(`${base}/:id`, requireAdmin, async (request, response, next) => {
    try {
      const id = parseId(request.params.id);
      const body = bodyObject(request);
      const updates = [];
      const values = [];
      const details = {};
      if (Object.hasOwn(body, "name")) {
        const value = requiredText(body.name, "Name", fields.nameMax);
        updates.push("name = ?");
        values.push(value);
        details.name = value;
      }
      if (Object.hasOwn(body, "isActive")) {
        if (typeof body.isActive !== "boolean") throw new HttpError(400, "isActive must be true or false.");
        updates.push("is_active = ?");
        values.push(body.isActive);
        details.isActive = body.isActive;
      }
      if (fields.extra.includes("code") && Object.hasOwn(body, "code")) {
        const value = requiredText(body.code, "Code", 32).toUpperCase();
        if (!/^[A-Z0-9_-]+$/.test(value)) throw new HttpError(400, "Invalid code.");
        updates.push("code = ?");
        values.push(value);
        details.code = value;
      }
      if (fields.extra.includes("description") && Object.hasOwn(body, "description")) {
        const value = body.description === null ? null : requiredText(body.description, "Description", 500);
        updates.push("description = ?");
        values.push(value);
        details.description = value;
      }
      if (!updates.length || Object.keys(body).some((key) => !["name", "isActive", "code", "description"].includes(key))) {
        throw new HttpError(400, "Provide supported fields to update.");
      }
      values.push(id);
      await withTransaction(async (connection) => {
        const [result] = await connection.execute(`UPDATE ${table} SET ${updates.join(", ")} WHERE id = ?`, values);
        if (!result.affectedRows) throw new HttpError(404, "Record not found.");
        await recordActivity(connection, request.user.id, `${name}_updated`, name, id, details);
      });
      response.json({ success: true });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return next(new HttpError(409, "A record with that name or code already exists."));
      next(error);
    }
  });
}

addCatalogRoutes("departments", "departments", { nameMax: 160, extra: ["code"] });
addCatalogRoutes("categories", "request_categories", { nameMax: 120, extra: ["description"] });

function technicianFields(body) {
  const values = {};
  if (Object.hasOwn(body, "name")) values.name = requiredText(body.name, "Name", 120);
  if (Object.hasOwn(body, "description")) values.description = requiredText(body.description, "Description", 1000);
  if (Object.hasOwn(body, "gender")) values.gender = requiredText(body.gender, "Gender", 40);
  if (Object.hasOwn(body, "specialization")) values.specialization = requiredText(body.specialization, "Specialization", 100);
  if (Object.hasOwn(body, "experienceYears")) {
    if (!Number.isInteger(body.experienceYears) || body.experienceYears < 0 || body.experienceYears > 60) {
      throw new HttpError(400, "Experience must be a whole number from 0 to 60 years.");
    }
    values.experience_years = body.experienceYears;
  }
  if (Object.hasOwn(body, "contact")) {
    const contact = requiredText(body.contact, "Contact", 32);
    if (!/^[0-9+() -]{7,32}$/.test(contact)) throw new HttpError(400, "Enter a valid phone number.");
    values.contact = contact;
  }
  if (Object.hasOwn(body, "availability")) {
    if (!["Available", "Unavailable"].includes(body.availability)) throw new HttpError(400, "Availability must be Available or Unavailable.");
    values.availability = body.availability;
  }
  return values;
}

app.get("/api/admin/technicians", requireAdmin, async (_request, response, next) => {
  try {
    const [technicians] = await pool.query(
      `SELECT id, name, description, gender, specialization, experience_years AS experienceYears,
        contact, availability, is_placeholder AS isPlaceholder, is_active AS isActive,
        created_at AS createdAt, updated_at AS updatedAt
       FROM technicians ORDER BY is_active DESC, name`,
    );
    response.json({ technicians });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/technicians", requireAdmin, async (request, response, next) => {
  try {
    const body = bodyObject(request);
    const allowed = new Set(["name", "description", "gender", "specialization", "experienceYears", "contact", "availability"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) throw new HttpError(400, "Provide only supported technician fields.");
    const values = technicianFields(body);
    const required = ["name", "description", "gender", "specialization", "experience_years", "contact", "availability"];
    if (required.some((field) => !Object.hasOwn(values, field))) throw new HttpError(400, "Complete all technician profile fields.");
    const result = await withTransaction(async (connection) => {
      const [insert] = await connection.execute(
        `INSERT INTO technicians (name, description, gender, specialization, experience_years, contact, availability)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [values.name, values.description, values.gender, values.specialization, values.experience_years, values.contact, values.availability],
      );
      await recordActivity(connection, request.user.id, "technician_created", "technician", insert.insertId, values);
      return insert.insertId;
    });
    response.status(201).json({ id: result });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/technicians/:id", requireAdmin, async (request, response, next) => {
  try {
    const id = parseId(request.params.id, "technician ID");
    const body = bodyObject(request);
    const allowed = new Set(["name", "description", "gender", "specialization", "experienceYears", "contact", "availability", "isActive"]);
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
      throw new HttpError(400, "Provide one or more supported technician fields.");
    }
    const values = technicianFields(body);
    if (Object.hasOwn(body, "isActive")) {
      if (typeof body.isActive !== "boolean") throw new HttpError(400, "isActive must be true or false.");
      values.is_active = body.isActive;
    }
    if (!Object.keys(values).length) throw new HttpError(400, "Provide one or more supported technician fields.");
    await withTransaction(async (connection) => {
      const [[current]] = await connection.execute("SELECT is_active AS isActive FROM technicians WHERE id = ? FOR UPDATE", [id]);
      if (!current) throw new HttpError(404, "Technician not found.");
      const assignments = Object.keys(values).map((field) => `${field} = ?`).join(", ");
      await connection.execute(
        `UPDATE technicians SET ${assignments} WHERE id = ?`,
        [...Object.values(values), id],
      );
      const action = Object.hasOwn(body, "isActive") && Boolean(current.isActive) !== body.isActive
        ? (body.isActive ? "technician_restored" : "technician_removed")
        : "technician_updated";
      await recordActivity(connection, request.user.id, action, "technician", id, values);
    });
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

async function listRequests(request, response, next) {
  try {
    const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
    const conditions = [];
    const params = [];
    if (request.user.role === "faculty_staff") {
      conditions.push("r.requester_user_id = ?");
      params.push(request.user.id);
    } else if (request.user.role === "mis" && request.query.assignedToMe === "true") {
      conditions.push("r.assigned_mis_user_id = ?");
      params.push(request.user.id);
    }
    if (request.query.status) {
      if (!STATUSES.has(request.query.status)) throw new HttpError(400, "Invalid request status.");
      conditions.push("r.status = ?");
      params.push(request.query.status);
    }
    if (request.query.requesterId) {
      conditions.push("r.requester_user_id = ?");
      params.push(parseId(request.query.requesterId, "requester ID"));
    }
    if (request.query.priority) {
      if (!PRIORITIES.has(request.query.priority)) throw new HttpError(400, "Invalid request priority.");
      conditions.push("r.priority = ?");
      params.push(request.query.priority);
    }
    for (const [queryName, column] of [
      ["departmentId", "r.department_id"],
      ["categoryId", "r.category_id"],
      ["assignedMisId", "r.assigned_mis_user_id"],
      ["assignedTechnicianId", "r.assigned_technician_id"],
    ]) {
      if (request.query[queryName]) {
        conditions.push(`${column} = ?`);
        params.push(parseId(request.query[queryName], queryName));
      }
    }
    if (search) {
      conditions.push("(r.request_number LIKE ? OR r.title LIKE ? OR u.full_name LIKE ? OR u.institutional_email LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const sortColumns = {
      submitted: "r.created_at",
      priority: "r.priority",
      status: "r.status",
      requestNumber: "r.request_number",
      requester: "u.full_name",
      department: "d.name",
      category: "c.name",
      assignedMis: "a.full_name",
    };
    const sortColumn = sortColumns[request.query.sort] || sortColumns.submitted;
    if (request.query.direction !== undefined && !["asc", "desc"].includes(request.query.direction)) {
      throw new HttpError(400, "Sort direction must be asc or desc.");
    }
    const direction = request.query.direction === "asc" ? "ASC" : "DESC";
    const page = pageNumber(request.query.page, 1, 100000);
    const limit = pageNumber(request.query.limit, 50, 100);
    if (request.query.submittedFrom || request.query.submittedTo) {
      const dates = dateFilters({ query: { from: request.query.submittedFrom, to: request.query.submittedTo } });
      const range = addDateConditions(dates);
      if (range.sql) {
        conditions.push(range.sql.slice(6));
        params.push(...range.params);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM requests r JOIN users u ON u.id = r.requester_user_id ${where}`,
      params,
    );
    const [requests] = await pool.execute(
      `SELECT r.id, r.request_number AS requestNumber, r.title, r.priority, r.status,
        r.location, r.created_at AS submittedAt, r.updated_at AS updatedAt,
        u.full_name AS requesterName, u.institutional_email AS requesterEmail,
        d.name AS departmentName, c.name AS categoryName,
        a.full_name AS assignedMisName, r.assigned_mis_user_id AS assignedMisId,
        t.name AS assignedTechnicianName, r.assigned_technician_id AS assignedTechnicianId
       FROM requests r JOIN users u ON u.id = r.requester_user_id
       LEFT JOIN departments d ON d.id = r.department_id
       JOIN request_categories c ON c.id = r.category_id
       LEFT JOIN users a ON a.id = r.assigned_mis_user_id
       LEFT JOIN technicians t ON t.id = r.assigned_technician_id
       ${where} ORDER BY ${sortColumn} ${direction}, r.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    response.json({ requests, page, limit, total });
  } catch (error) {
    next(error);
  }
}

app.get("/api/requests", authenticate, requireRoles("faculty_staff", "mis", "administrator"), listRequests);

app.post(
  "/api/requests",
  authenticate,
  requireRoles("faculty_staff"),
  (request, response, next) => {
    upload.array("attachments")(request, response, (error) => {
      if (error) {
        if (request.files?.length) {
          Promise.all(request.files.map((file) => fs.unlink(file.path).catch(() => {})))
            .finally(() => uploadError(error, request, response, next));
          return;
        }
        return uploadError(error, request, response, next);
      }
      next();
    });
  },
  async (request, response, next) => {
  try {
    const body = bodyObject(request);
    const title = requiredText(body.title, "Title", 180);
    const description = requiredText(body.description, "Description", 10000, 10);
    const location = requiredText(body.location, "Location", 180);
    const categoryId = parseId(body.categoryId, "category ID");
    const departmentId = parseId(body.departmentId || request.user.department_id, "department ID");
    const priority = body.priority || "normal";
    if (!PRIORITIES.has(priority)) throw new HttpError(400, "Invalid request priority.");
    const [[category]] = await pool.execute("SELECT id FROM request_categories WHERE id = ? AND is_active = TRUE", [categoryId]);
    if (!category) throw new HttpError(400, "Select an active request category.");
    const [[department]] = await pool.execute("SELECT id FROM departments WHERE id = ? AND is_active = TRUE", [departmentId]);
    if (!department) throw new HttpError(400, "Select an active department.");
    const result = await withTransaction(async (connection) => {
      const requestNumber = `REQ-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const [insert] = await connection.execute(
        `INSERT INTO requests
          (request_number, requester_user_id, department_id, location, category_id, title, description, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestNumber, request.user.id, departmentId, location, categoryId, title, description, priority],
      );
      await connection.execute(
        `INSERT INTO request_history (request_id, actor_user_id, action, new_status, details)
         VALUES (?, ?, 'submitted', 'new', JSON_OBJECT('requestNumber', ?, 'location', ?))`,
        [insert.insertId, request.user.id, requestNumber, location],
      );
      if (request.files?.length) {
        for (const file of request.files) {
          await connection.execute(
            `INSERT INTO request_attachments
              (request_id, uploaded_by_user_id, original_filename, storage_key, media_type, byte_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              insert.insertId,
              request.user.id,
              path.basename(file.originalname).slice(0, 255),
              file.filename,
              file.mimetype,
              file.size,
            ],
          );
        }
      }
      const [misUsers] = await connection.execute(
        "SELECT id FROM users WHERE role = 'mis' AND is_active = TRUE",
      );
      for (const misUser of misUsers) {
        await createNotification(connection, misUser.id, insert.insertId, "new_request", "New ICT request", `${requestNumber}: ${title}`);
      }
      await recordActivity(connection, request.user.id, "request_submitted", "request", insert.insertId, {
        requestNumber,
        attachmentCount: request.files?.length || 0,
      });
      return { id: insert.insertId, requestNumber };
    });
    response.status(201).json(result);
  } catch (error) {
    if (request.files?.length) await Promise.all(request.files.map((file) => fs.unlink(file.path).catch(() => {})));
    next(error);
  }
  },
);

app.get("/api/requests/:id", authenticate, requireRoles("faculty_staff", "mis", "administrator"), async (request, response, next) => {
  try {
    const id = parseId(request.params.id, "request ID");
    const [rows] = await pool.execute(
      `SELECT r.id, r.request_number AS requestNumber, r.requester_user_id AS requesterId,
        r.department_id AS departmentId, r.location, r.category_id AS categoryId, r.assigned_mis_user_id AS assignedMisId,
        r.assigned_technician_id AS assignedTechnicianId,
        r.title, r.description, r.assessment_note AS assessmentNote, r.priority, r.status, r.resolution_note AS resolutionNote,
        r.first_response_at AS firstResponseAt, r.resolved_at AS resolvedAt,
        r.created_at AS submittedAt, r.updated_at AS updatedAt,
        u.full_name AS requesterName, u.institutional_email AS requesterEmail,
        d.name AS departmentName, c.name AS categoryName, a.full_name AS assignedMisName,
        t.name AS assignedTechnicianName, t.availability AS assignedTechnicianAvailability,
        t.is_active AS assignedTechnicianActive
       FROM requests r JOIN users u ON u.id = r.requester_user_id
       LEFT JOIN departments d ON d.id = r.department_id JOIN request_categories c ON c.id = r.category_id
       LEFT JOIN users a ON a.id = r.assigned_mis_user_id
       LEFT JOIN technicians t ON t.id = r.assigned_technician_id WHERE r.id = ?`,
      [id],
    );
    const record = rows[0];
    if (!record) throw new HttpError(404, "Request not found.");
    if (request.user.role === "faculty_staff" && record.requesterId !== request.user.id) {
      throw new HttpError(404, "Request not found.");
    }
    const [history] = await pool.execute(
      `SELECT h.action, h.old_status AS oldStatus, h.new_status AS newStatus,
        h.old_assigned_technician_id AS oldTechnicianId,
        h.new_assigned_technician_id AS newTechnicianId,
        ot.name AS oldTechnicianName, nt.name AS newTechnicianName,
        h.details, h.created_at AS createdAt, u.full_name AS actorName
       FROM request_history h LEFT JOIN users u ON u.id = h.actor_user_id
       LEFT JOIN technicians ot ON ot.id = h.old_assigned_technician_id
       LEFT JOIN technicians nt ON nt.id = h.new_assigned_technician_id
       WHERE h.request_id = ? ORDER BY h.created_at, h.id`,
      [id],
    );
    const [attachments] = await pool.execute(
      `SELECT id, original_filename AS filename, media_type AS mediaType,
        byte_size AS byteSize, created_at AS createdAt
       FROM request_attachments WHERE request_id = ? ORDER BY id`,
      [id],
    );
    let rating = null;
    if (request.user.role === "faculty_staff") {
      const [ratings] = await pool.execute(
        "SELECT rating, comment FROM satisfaction_ratings WHERE request_id = ? AND rated_by_user_id = ?",
        [id, request.user.id],
      );
      rating = ratings[0] || null;
    }
    response.json({ request: record, history, attachments, rating });
  } catch (error) {
    next(error);
  }
});

app.get("/api/attachments/:id", authenticate, requireRoles("faculty_staff", "mis", "administrator"), async (request, response, next) => {
  try {
    const id = parseId(request.params.id, "attachment ID");
    const [rows] = await pool.execute(
      `SELECT a.original_filename AS filename, a.storage_key AS storageKey,
        a.media_type AS mediaType, r.requester_user_id AS requesterId
       FROM request_attachments a JOIN requests r ON r.id = a.request_id
       WHERE a.id = ?`,
      [id],
    );
    const attachment = rows[0];
    if (!attachment || (request.user.role === "faculty_staff" && attachment.requesterId !== request.user.id)) {
      throw new HttpError(404, "Attachment not found.");
    }
    const storageKey = path.basename(attachment.storageKey);
    if (storageKey !== attachment.storageKey) throw new HttpError(404, "Attachment not found.");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.type(attachment.mediaType);
    response.download(path.join(uploadDirectory, storageKey), attachment.filename, (error) => {
      if (error && !response.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/requests/:id", authenticate, requireRoles("mis", "administrator"), async (request, response, next) => {
  try {
    const id = parseId(request.params.id, "request ID");
    const body = bodyObject(request);
    const allowed = new Set(["status", "assignedMisId", "assignedTechnicianId", "resolutionNote", "assessmentNote"]);
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
      throw new HttpError(400, "Provide a supported status, assignee, or resolution update.");
    }
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT id, status, assigned_mis_user_id, assigned_technician_id FROM requests WHERE id = ? FOR UPDATE",
        [id],
      );
      const current = rows[0];
      if (!current) throw new HttpError(404, "Request not found.");

      const newStatus = Object.hasOwn(body, "status") ? body.status : current.status;
      if (!STATUSES.has(newStatus)) throw new HttpError(400, "Invalid request status.");
      if (newStatus !== current.status && !isAllowedTransition(current.status, newStatus)) {
        throw new HttpError(409, `Request cannot move from ${current.status} to ${newStatus}.`);
      }
      let assigneeId = current.assigned_mis_user_id;
      if (Object.hasOwn(body, "assignedMisId")) {
        assigneeId = parseOptionalId(body.assignedMisId, "MIS user ID");
        if (assigneeId) {
          const [assignees] = await connection.execute(
            "SELECT id FROM users WHERE id = ? AND role = 'mis' AND is_active = TRUE",
            [assigneeId],
          );
          if (!assignees.length) throw new HttpError(400, "Select an active MIS user.");
        }
        if (request.user.role === "mis" && assigneeId !== request.user.id && assigneeId !== current.assigned_mis_user_id) {
          throw new HttpError(403, "MIS personnel cannot reassign requests to another person.");
        }
      }
      if (request.user.role === "mis") {
        if (current.assigned_mis_user_id && current.assigned_mis_user_id !== request.user.id) {
          throw new HttpError(403, "This request is assigned to another MIS user.");
        }
        if (!current.assigned_mis_user_id && assigneeId !== request.user.id) {
          throw new HttpError(403, "Assign this unassigned request to yourself before updating it.");
        }
      }
      let technicianId = current.assigned_technician_id;
      if (Object.hasOwn(body, "assignedTechnicianId")) {
        technicianId = parseOptionalId(body.assignedTechnicianId, "technician ID");
        if (technicianId && technicianId !== current.assigned_technician_id) {
          const [technicians] = await connection.execute(
            `SELECT id FROM technicians
             WHERE id = ? AND is_active = TRUE AND availability = 'Available'`,
            [technicianId],
          );
          if (!technicians.length) throw new HttpError(400, "Select an active, available technician.");
        }
      }
      const resolutionNote = Object.hasOwn(body, "resolutionNote")
        ? (body.resolutionNote === null ? null : requiredText(body.resolutionNote, "Resolution note", 10000))
        : undefined;
      const assessmentNote = Object.hasOwn(body, "assessmentNote")
        ? (body.assessmentNote === null ? null : requiredText(body.assessmentNote, "Assessment note", 10000))
        : undefined;
      if (newStatus === "resolved" && !(resolutionNote ?? "")) {
        const [existing] = await connection.execute("SELECT resolution_note FROM requests WHERE id = ?", [id]);
        if (!existing[0].resolution_note) throw new HttpError(400, "A resolution note is required to resolve a request.");
      }

      const fields = ["status = ?", "assigned_mis_user_id = ?", "assigned_technician_id = ?"];
      const values = [newStatus, assigneeId, technicianId];
      if (resolutionNote !== undefined) {
        fields.push("resolution_note = ?");
        values.push(resolutionNote);
      }
      if (assessmentNote !== undefined) {
        fields.push("assessment_note = ?");
        values.push(assessmentNote);
      }
      if (newStatus === "in_progress" && current.status === "new") fields.push("first_response_at = COALESCE(first_response_at, UTC_TIMESTAMP())");
      if (newStatus === "resolved" && current.status !== "resolved") fields.push("resolved_at = UTC_TIMESTAMP()");
      if (newStatus === "in_progress" && current.status === "resolved") fields.push("resolved_at = NULL");
      values.push(id);
      await connection.execute(`UPDATE requests SET ${fields.join(", ")} WHERE id = ?`, values);

      if (newStatus !== current.status) {
        await connection.execute(
          `INSERT INTO request_history (request_id, actor_user_id, action, old_status, new_status)
           VALUES (?, ?, 'status_changed', ?, ?)`,
          [id, request.user.id, current.status, newStatus],
        );
      }
      if (assigneeId !== current.assigned_mis_user_id) {
        await connection.execute(
          `INSERT INTO request_history
            (request_id, actor_user_id, action, old_assignee_user_id, new_assignee_user_id)
           VALUES (?, ?, 'reassigned', ?, ?)`,
          [id, request.user.id, current.assigned_mis_user_id, assigneeId],
        );
        if (assigneeId) {
          await createNotification(connection, assigneeId, id, "assigned", "Request assigned to you", `Request ${id} has been assigned to you.`);
        }
        const [[requester]] = await connection.execute("SELECT requester_user_id FROM requests WHERE id = ?", [id]);
        await createNotification(
          connection,
          requester.requester_user_id,
          id,
          "assigned",
          "Request assignment updated",
          `The support assignment for request ${id} has been updated.`,
        );
      }
      if (technicianId !== current.assigned_technician_id) {
        await connection.execute(
          `INSERT INTO request_history
            (request_id, actor_user_id, action, old_assigned_technician_id, new_assigned_technician_id)
           VALUES (?, ?, 'reassigned', ?, ?)`,
          [id, request.user.id, current.assigned_technician_id, technicianId],
        );
        const [[requester]] = await connection.execute("SELECT requester_user_id FROM requests WHERE id = ?", [id]);
        const [technicianRows] = technicianId
          ? await connection.execute("SELECT name FROM technicians WHERE id = ?", [technicianId])
          : [[]];
        const message = technicianId
          ? `Technician ${technicianRows[0].name} has been assigned to request ${id}.`
          : `The technician assignment for request ${id} has been cleared.`;
        await createNotification(
          connection,
          requester.requester_user_id,
          id,
          "assigned",
          "Technician assignment updated",
          message,
        );
      }
      if (assessmentNote !== undefined) {
        await connection.execute(
          `INSERT INTO request_history (request_id, actor_user_id, action, details)
           VALUES (?, ?, 'assessment_updated', JSON_OBJECT('assessmentNote', ?))`,
          [id, request.user.id, assessmentNote],
        );
        const [[requester]] = await connection.execute("SELECT requester_user_id FROM requests WHERE id = ?", [id]);
        await createNotification(
          connection,
          requester.requester_user_id,
          id,
          "assessment_updated",
          "Request assessment updated",
          `An update was added to request ${id}.`,
        );
      }
      if (newStatus !== current.status) {
        const [[requester]] = await connection.execute("SELECT requester_user_id FROM requests WHERE id = ?", [id]);
        await createNotification(
          connection,
          requester.requester_user_id,
          id,
          "status_changed",
          "Request status updated",
          `Request ${id} is now ${newStatus.replaceAll("_", " ")}.`,
        );
      }
      await recordActivity(connection, request.user.id, "request_administered", "request", id, {
        status: newStatus,
        assignedMisId: assigneeId,
        assignedTechnicianId: technicianId,
        assessmentUpdated: assessmentNote !== undefined,
      });
    });
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/requests/:id/rating", authenticate, requireRoles("faculty_staff"), async (request, response, next) => {
  try {
    const id = parseId(request.params.id, "request ID");
    const body = bodyObject(request);
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) throw new HttpError(400, "Rating must be from 1 to 5.");
    const comment = body.comment === undefined || body.comment === null ? null : requiredText(body.comment, "Comment", 1000);
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT requester_user_id, status FROM requests WHERE id = ? FOR UPDATE",
        [id],
      );
      if (!rows.length || rows[0].requester_user_id !== request.user.id) throw new HttpError(404, "Request not found.");
      if (!["resolved", "closed"].includes(rows[0].status)) throw new HttpError(409, "Only resolved requests can be rated.");
      await connection.execute(
        "INSERT INTO satisfaction_ratings (request_id, rated_by_user_id, rating, comment) VALUES (?, ?, ?, ?)",
        [id, request.user.id, body.rating, comment],
      );
    });
    response.status(201).json({ success: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return next(new HttpError(409, "This request has already been rated."));
    next(error);
  }
});

app.get("/api/admin/reports", requireAdmin, async (request, response, next) => {
  try {
    const filters = dateFilters(request);
    const date = addDateConditions(filters);
    const [byStatus] = await pool.execute(
      `SELECT r.status, COUNT(*) AS total FROM requests r ${date.sql} GROUP BY r.status ORDER BY r.status`,
      date.params,
    );
    const [byCategory] = await pool.execute(
      `SELECT c.id, c.name, COUNT(r.id) AS total FROM request_categories c
       LEFT JOIN requests r ON r.category_id = c.id ${date.sql ? `AND ${date.sql.slice(6)}` : ""}
       GROUP BY c.id, c.name ORDER BY total DESC, c.name`,
      date.params,
    );
    const [byDepartment] = await pool.execute(
      `SELECT d.id, COALESCE(d.name, 'Unassigned') AS name, COUNT(r.id) AS total
       FROM requests r LEFT JOIN departments d ON d.id = r.department_id ${date.sql}
       GROUP BY d.id, d.name ORDER BY total DESC, name`,
      date.params,
    );
    const [weeklyMonthly] = await pool.execute(
      `SELECT DATE_FORMAT(r.created_at, '%x-W%v') AS week, DATE_FORMAT(r.created_at, '%Y-%m') AS month,
        COUNT(*) AS total FROM requests r ${date.sql}
       GROUP BY week, month ORDER BY MIN(r.created_at)`,
      date.params,
    );
    const [workload] = await pool.execute(
      `SELECT u.id, u.full_name AS misName,
        SUM(r.status IN ('new', 'in_progress', 'waiting_on_requester')) AS openRequests,
        COUNT(r.id) AS totalRequests
       FROM users u LEFT JOIN requests r ON r.assigned_mis_user_id = u.id
         ${date.sql ? `AND ${date.sql.slice(6)}` : ""}
       WHERE u.role = 'mis' GROUP BY u.id, u.full_name ORDER BY openRequests DESC, u.full_name`,
      date.params,
    );
    const [[timings]] = await pool.execute(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, r.created_at, r.first_response_at)) AS averageResponseMinutes,
        AVG(TIMESTAMPDIFF(MINUTE, r.created_at, r.resolved_at)) AS averageResolutionMinutes
       FROM requests r ${date.sql}`,
      date.params,
    );
    const [[satisfaction]] = await pool.execute(
      `SELECT AVG(s.rating) AS averageRating, COUNT(s.id) AS ratingCount
       FROM satisfaction_ratings s JOIN requests r ON r.id = s.request_id ${date.sql}`,
      date.params,
    );
    response.json({ filters, byStatus, byCategory, byDepartment, weeklyMonthly, workload, timings, satisfaction });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/activity", requireAdmin, async (request, response, next) => {
  try {
    const limit = Math.max(1, Math.min(Number(request.query.limit) || 50, 100));
    const before = request.query.before ? parseId(request.query.before, "activity cursor") : null;
    const where = before ? "WHERE a.id < ?" : "";
    const params = before ? [before, limit] : [limit];
    const [items] = await pool.execute(
      `SELECT a.id, a.action, a.affected_record_type AS recordType,
        a.affected_record_id AS recordId, a.details, a.created_at AS createdAt,
        u.full_name AS actorName, u.institutional_email AS actorEmail
       FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_user_id
       ${where} ORDER BY a.id DESC LIMIT ?`,
      params,
    );
    response.json({ activity: items, nextCursor: items.length === limit ? items[items.length - 1].id : null });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_request, _response, next) => next(new HttpError(404, "API endpoint not found.")));

const webRoot = path.resolve(__dirname, "..", "public");
app.use(express.static(webRoot, { index: "index.html", dotfiles: "deny", fallthrough: true }));
app.get("*path", (_request, response, next) => {
  response.sendFile(path.join(webRoot, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _request, response, _next) => {
  if (error.code === "ER_DUP_ENTRY") return response.status(409).json({ error: "A record with those unique values already exists." });
  if (error.code === "ER_NO_REFERENCED_ROW_2") return response.status(400).json({ error: "A referenced record does not exist." });
  if (error instanceof SyntaxError && error.status === 400) return response.status(400).json({ error: "Invalid JSON body." });
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error("RequestHub API error:", error);
  response.status(status).json({ error: status >= 500 ? "An internal server error occurred." : error.message });
});

let server;
async function start() {
  await fs.mkdir(uploadDirectory, { recursive: true });
  await pool.query("SELECT 1");
  server = app.listen(port, host, () => console.log(`RequestHub server listening at http://${host}:${port}`));
}

async function shutdown() {
  if (server) server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  else await pool.end();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
start().catch(async (error) => {
  console.error("RequestHub server could not connect to MySQL:", error.message);
  process.exitCode = 1;
  await pool.end();
});

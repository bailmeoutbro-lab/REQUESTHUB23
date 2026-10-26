const ROLES = new Set(["faculty_staff", "mis", "administrator"]);
const STATUSES = new Set(["new", "in_progress", "waiting_on_requester", "resolved", "closed"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

const TRANSITIONS = {
  new: new Set(["in_progress"]),
  in_progress: new Set(["waiting_on_requester", "resolved"]),
  waiting_on_requester: new Set(["in_progress", "resolved"]),
  resolved: new Set(["in_progress", "closed"]),
  closed: new Set(),
};

function isAllowedTransition(current, next) {
  return STATUSES.has(current) && STATUSES.has(next) && TRANSITIONS[current].has(next);
}

function positiveId(value) {
  if (!/^[1-9]\d{0,15}$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function normalizedEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 14 && Buffer.byteLength(value, "utf8") <= 72;
}

module.exports = {
  ROLES,
  STATUSES,
  PRIORITIES,
  isAllowedTransition,
  positiveId,
  normalizedEmail,
  validDate,
  validPassword,
};

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ROLES,
  STATUSES,
  isAllowedTransition,
  normalizedEmail,
  positiveId,
  validDate,
  validPassword,
} = require("../src/domain");

test("declares only the three system roles and supported request states", () => {
  assert.deepEqual([...ROLES].sort(), ["administrator", "faculty_staff", "mis"]);
  assert.deepEqual([...STATUSES].sort(), ["closed", "in_progress", "new", "resolved", "waiting_on_requester"]);
});

test("allows only explicit forward workflow transitions", () => {
  assert.equal(isAllowedTransition("new", "in_progress"), true);
  assert.equal(isAllowedTransition("in_progress", "resolved"), true);
  assert.equal(isAllowedTransition("resolved", "closed"), true);
  assert.equal(isAllowedTransition("new", "resolved"), false);
  assert.equal(isAllowedTransition("closed", "in_progress"), false);
  assert.equal(isAllowedTransition("unknown", "closed"), false);
});

test("normalizes valid email addresses and rejects malformed input", () => {
  assert.equal(normalizedEmail("  Person@Liceo.edu.ph "), "person@liceo.edu.ph");
  assert.equal(normalizedEmail("not-an-email"), null);
  assert.equal(normalizedEmail(42), null);
});

test("accepts only safe positive numeric identifiers", () => {
  assert.equal(positiveId("12"), 12);
  assert.equal(positiveId("0"), null);
  assert.equal(positiveId("-1"), null);
  assert.equal(positiveId("1; DROP TABLE users"), null);
  assert.equal(positiveId("9007199254740992"), null);
});

test("validates calendar dates rather than only matching date-shaped strings", () => {
  assert.equal(validDate("2026-10-26"), true);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026/10/26"), false);
});

test("accepts long passwords without bcrypt's silent 72-byte truncation", () => {
  assert.equal(validPassword("a-very-long-example-passphrase"), true);
  assert.equal(validPassword("short"), false);
  assert.equal(validPassword("é".repeat(37)), false);
  assert.equal(validPassword(null), false);
});

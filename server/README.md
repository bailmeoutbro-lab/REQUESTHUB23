# RequestHub API and MySQL foundation

This is a new backend foundation alongside the existing compiled website. It does not overwrite the static frontend. The backend uses Node.js, Express, MySQL 8, prepared SQL statements, bcrypt password hashes, and opaque server-side sessions stored as token hashes.

## Requirements

- Node.js 20 or later
- MySQL 8.0.16 or later
- The MySQL 8 Windows service is installed and running on this machine.

## Local setup on Windows

1. In VS Code, open **Terminal → Run Task…** and choose **RequestHub: Set up MySQL (password prompt)**.
2. Enter the MySQL root password in the integrated terminal when prompted. Input is hidden; the password is not stored or printed. The task refuses to overwrite an existing `requesthub` database or pre-existing RequestHub database accounts. It generates separate application and migration credentials in the private, git-ignored `server/.env` file.
3. Choose **RequestHub: Apply MySQL migrations**.
4. Choose **RequestHub: Create first administrator**, then enter the first administrator's institutional email, display name, and password when prompted. Password input is hidden.
5. Choose **RequestHub: Start API and website**.
6. Visit `http://localhost:3001/api/health`. A successful response reports `"database":"connected"`.

Equivalent terminal commands, if preferred:

   ```powershell
   Set-Location .\server
   npm.cmd run setup-mysql
   npm.cmd run migrate
   npm.cmd run bootstrap-admin
   npm.cmd start
   ```

The one-time administrator bootstrap refuses to create a second initial administrator. Keep `.env` private.

If the administrator password is forgotten, use **Terminal → Run Task… → RequestHub: Reset administrator password**. Enter the existing administrator's email, then enter and confirm a new password in the integrated terminal; password input is hidden. This local operation updates only that active administrator's password, invalidates their existing sessions, and records the reset in the activity log. It does not change the MySQL password. Alternatively, run `npm.cmd run reset-admin-password` from `server/`.

For a hosted MySQL service, use its TLS connection settings and set `DB_SSL=true`; keep the application bound behind an HTTPS reverse proxy.

## Current API foundation

- `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`
- `GET /api/admin/dashboard` with live MySQL request and user counts
- Administrator-only user creation/editing, account activation, role assignment, and department/category management
- Administrator-only request monitoring, workflow-validating request updates, reports, activity-log reads, and editable technician profiles
- Faculty/Staff request submission with optional private attachments, own-request reads, status history, notifications, and satisfaction ratings
- MIS request reads and assignment/status updates, including technician assignment, restricted to authorized workflow transitions and assigned work; MIS can view the active technician directory
- Unique institutional email addresses, soft activation/deactivation of reference records, request history, ratings, and audit tables
- Private attachment downloads authorized against the request owner or a privileged role

All database values supplied by API callers are sent through prepared statements. The server never includes password hashes in user responses. Each mutating browser request must include the configured same-origin `Origin` header; production cookies are HTTP-only, secure, and SameSite strict. Change `APP_ORIGIN` when the server's public origin is different.

The API uses the restricted `DB_USER` account. Only the migration command uses the more privileged `DB_MIGRATION_USER` account; migration falls back to the application credentials only if separate migration credentials are not configured.

## React application

The maintainable React/Vite source is in `web/`. It is served by the Express application and includes separate Faculty/Staff, MIS, and Administrator views. Dashboard data and actions use authenticated API routes; request records are not stored in browser `localStorage`. The original compiled website remains at the workspace root and is not used by this application.

From the workspace root, install frontend dependencies once, then build the production frontend:

```powershell
npm.cmd --prefix web install
npm.cmd --prefix web run build
```

The build writes the application to `server/public/`; the Express server serves it at `http://localhost:3001/`. Keep the API running with `npm.cmd start` from `server/`.

For local frontend development, start the API in one terminal, then run:

```powershell
npm.cmd --prefix web run dev
```

Open `http://127.0.0.1:5173/`. Vite proxies `/api` requests to the local API. The development origin must be included in `APP_ORIGINS` in `server/.env`.

The API migration `002_workflow_fields_notifications.sql` adds request location and assessment fields plus persistent notifications. `npm.cmd run migrate` applies any pending migrations; the migration runner records applied versions and skips them on later runs.

## Validation

Run `npm.cmd test` from `server/` for the workflow and input-validation tests, and `npm.cmd run build` from `web/` to validate the React production build. Database migrations and database-backed integration checks require a running MySQL 8 instance.

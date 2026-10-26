# RequestHub

RequestHub is a React frontend and Node.js/Express API backed by MySQL. Keep the `assets`, `server`, and `web` folders in this layout; the frontend imports the university logo from `assets`.

## Deploying the app

This project requires a host that supports Node.js; PHP-only shared hosting cannot run its Express API. For a Render web service, use the repository root and these commands:

- Build: `npm install --prefix web && npm run build --prefix web && npm install --prefix server`
- Start: `npm start --prefix server`

Configure `NODE_ENV=production`, `HOST=0.0.0.0`, `APP_ORIGIN` and `APP_ORIGINS` with the deployed HTTPS origin, and the database environment variables documented in `server/.env.example`. Use a managed MySQL-compatible database with TLS (`DB_SSL=true` when required). Do not commit `.env` files, real credentials, or real user/request data.

Apply the SQL migrations in `server/migrations` to the hosted database before using the app. Create the first administrator securely using `npm run bootstrap-admin --prefix server` in a trusted environment with database credentials configured.

The server currently stores uploaded attachments on its local filesystem. Configure durable external file storage before relying on attachments in a deployment where local files may be erased.

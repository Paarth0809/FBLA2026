# School Lost & Found - FBLA 2026

## Project Overview
This is a Node.js/Express web application built for the FBLA 2026 competition. It serves as a School Lost & Found system where users can report missing items, report found items, and submit claims. Administrators can review and approve reports and claims.

**Key Technologies:**
- **Backend:** Node.js with Express.js
- **Database:** Local JSON files (stored in the `data/` directory, managed via `server/lib/db.js`)
- **Frontend:** Static HTML, CSS, and Vanilla JavaScript (served from the `public/` directory)
- **Authentication:** session-based authentication using `express-session` and `bcryptjs` for password hashing.
- **Testing:** E2E UI testing with Playwright (`tests/ui-flow.test.js`)

**Architecture:**
- `server/index.js`: Main entry point setting up middleware, static file serving, and routing.
- `server/routes/`: Contains API routes for authentication, items, missing items, claims, and admin actions.
- `server/lib/db.js`: Utility for reading/writing to the local JSON file database.
- `public/`: Frontend assets including HTML pages, CSS styles, and client-side JavaScript.
- `data/`: Contains JSON files (`users.json`, `items.json`, `missing-items.json`, `claims.json`) that act as the database.
- `uploads/`: Directory for uploaded item photos.

## Building and Running

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Start the server (Production mode):**
    ```bash
    npm start
    ```
    *This runs `node server/index.js`.*

3.  **Start the server (Development mode):**
    ```bash
    npm run dev
    ```
    *This runs `nodemon server/index.js` to automatically restart the server on code changes.*

The application will be available at `http://localhost:3000` (or the port specified by the `PORT` environment variable).

## Testing

The project uses Playwright for End-to-End (E2E) UI testing.

-   **Run the full test suite:**
    ```bash
    npm run test:ui
    ```
    *This runs the Playwright tests defined in `tests/ui-flow.test.js` to verify the complete lifecycle of reporting missing/found items and the claim approval process.*
- **Custom test script:**
  There is also a custom test script runnable via:
  ```bash
  npm test
  ```
  *(Runs `node tests/run.js`)*

## Development Conventions
- **Database:** The project purposely avoids a traditional database system in favor of simple local JSON files (`data/*.json`). Do not introduce external database dependencies (like PostgreSQL or MongoDB) unless explicitly requested.
- **Routing:** API routes are prefixed with `/api/` and organized by feature in the `server/routes/` directory.
- **Static Files:** The frontend consists of static HTML files, rather than a view engine like EJS or a frontend framework like React. Client-side interactions are handled by vanilla JavaScript fetching from the `/api/` endpoints.
- **Data Initialization:** The database is automatically seeded with starter data on the first run via `server/lib/seed.js` if the JSON files are empty or missing.

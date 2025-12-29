```markdown
// filepath: /home/mikehacker/src/usds/stafferfi/docs/ARCHITECTURE.md
# StafferFi Architecture Overview

This document summarizes the high-level architecture of StafferFi: its components, how they are built, and how they run together in the Docker image.

---

## 1. High-level components

StafferFi is organized as a polyglot monorepo:

- **Web UI** (`apps/web`)
  - Next.js 15, TypeScript, React.
  - Built using Next.js “standalone” output for deployment.

- **API** (`apps/api`)
  - Node.js + Express.
  - Uses DuckDB as an embedded analytical database.
  - Exposes simple health and version endpoints (e.g. `/health`, `/duckdb/version`).

- **Lake** (`apps/lake`)
  - Python web app (served by Gunicorn).
  - Runs inside a dedicated virtualenv (`/opt/venv` in the Docker image).

JavaScript/TypeScript dependencies are managed via **pnpm workspaces** (see ADR-001).

---

## 2. Build & deployment pipeline (Docker)

The `Dockerfile` uses a multi-stage build to produce a single “all-in-one” image (`stafferfi-all`) that runs all three components.

### 2.1 Builder stage (`node:20-alpine`)

- Installs JS/TS dependencies with `pnpm install --frozen-lockfile`.
- Builds web and API:
  - `pnpm build:web` → `apps/web/.next/standalone`, static assets.
  - `pnpm build:api` → `apps/api/dist`.
- Produces a **self-contained API bundle** in `/tmp/api`:
  - Copies `apps/api/package.json` into `/tmp/api`.
  - Runs `npm install --only=production --legacy-peer-deps` in `/tmp/api`.
  - Copies built `dist` into `/tmp/api/dist`.

This decouples the runtime API from pnpm workspace layout (see ADR-004).

### 2.2 Lake-deps stage (`python:3.10-slim`)

- Creates Python virtualenv at `/opt/venv`.
- Installs `apps/lake` dependencies from `apps/lake/requirements.txt`.

### 2.3 Runner stage (`python:3.10-slim`)

- Installs Node.js runtime and corepack (for pnpm if needed in the future).
- Copies in:
  - Next.js standalone bundle and static assets from `apps/web/.next/standalone`.
  - Self-contained API bundle from `/tmp/api` → `/app/apps/api`.
  - Python venv from `/opt/venv` and `apps/lake` sources.

- Installs `supervisor` and uses `supervisord` as the container entrypoint.

Environment in the runner image:

- `NODE_ENV=production`
- `NEXT_TELEMETRY_DISABLED=1`
- `PORT=3000` (web)
- `HOSTNAME=0.0.0.0`
- `API_PORT=4000` (API)

Ports exposed:

- `EXPOSE 3000 4000 8000`

---

## 3. Runtime process model (supervisord)

Inside the container, `supervisord` manages three main programs (see `supervisord.conf`):

- **Web**

  ```ini
  [program:web]
  command=node apps/web/server.js
  autostart=true
  autorestart=true
  ```

  Runs the Next.js standalone server on `PORT` (default `3000`).

- **API**

  ```ini
  [program:api]
  command=node apps/api/dist/index.js
  autostart=true
  autorestart=true
  ```

  Runs the Express API, listening on `API_PORT` (default `4000`).

- **Lake**

  ```ini
  [program:lake]
  command=gunicorn app:app --bind 0.0.0.0:8000 --chdir /app/apps/lake
  ```

  Serves the Python lake application via Gunicorn on port `8000`.

An optional `[program:init]` is defined but disabled by default (see ADR-007). It can be used for one-time initialization or banner output if needed.

---

## 4. Local development vs. container runtime

### Local development

- Use `pnpm` at the repo root to install and build:

  ```bash
  pnpm install
  pnpm build:web
  pnpm build:api
  ```

- Run each app individually:
  - Web: `cd apps/web && pnpm dev`
  - API: `cd apps/api && pnpm dev` (or `node dist/index.js` after build)
  - Lake: `cd apps/lake && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && gunicorn app:app --bind 0.0.0.0:8000`

### Container runtime

- All three services run together in one container, launched via:

  ```bash
  docker run --rm \
    -p 3000:3000 \
    -p 4000:4000 \
    -p 8000:8000 \
    stafferfi-all
  ```

- Endpoints:
  - Web UI: `http://localhost:3000`
  - API: `http://localhost:4000`
  - Lake: `http://localhost:8000`

---

## 5. Design rationale

Key design decisions are recorded in [`docs/ADRs.md`](./ADRs.md), including:

- ADR-001: pnpm workspaces.
- ADR-002: Next.js standalone output.
- ADR-003: Single all-in-one Docker image with supervisord.
- ADR-004: Self-contained API bundle in builder stage.
- ADR-005: API and web port separation (`PORT` vs `API_PORT`).
- ADR-006: DuckDB import style in the API.
- ADR-007: Disabling `init` program by default.

Refer to those ADRs for more detailed context and trade-offs.
```
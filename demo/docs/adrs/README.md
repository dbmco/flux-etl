# Architecture Decision Records (ADRs)

[Back to Main README.md](../../README.md)

This document captures key architecture and design decisions for the StafferFi project.

---

## ADR-001: Use pnpm workspaces for JavaScript/TypeScript

**Status:** Accepted  
**Date:** 2025-11-30

### Context

The project includes multiple JavaScript/TypeScript applications:

- `apps/web` (Next.js web UI)
- `apps/api` (Express API)

We want a single dependency graph, shared tooling, and faster installs for local development and CI.

### Decision

Use **pnpm** with workspaces for managing JavaScript/TypeScript dependencies.

- `pnpm install` at the repo root manages all app dependencies.
- Builds are run via workspace scripts, e.g. `pnpm build:web` and `pnpm build:api`.

### Consequences

- Faster and more space-efficient installs vs. npm/yarn.
- Some tooling (e.g. Docker runtime) cannot rely on workspace hoisting and needs explicit handling (addressed by ADR-004).
- Contributors must either use `corepack` or install `pnpm` globally.

---

## ADR-002: Next.js standalone output for web frontend

**Status:** Accepted  
**Date:** 2025-11-30

### Context

We want to run the Next.js web UI in a production-like Docker container alongside other services (API, Python lake). A single process per service is preferred.

### Decision

Use Next.js **standalone** output in the Docker `builder` stage:

- Run `pnpm build:web`.
- Copy `apps/web/.next/standalone` into the final image.
- Start the web server with:

  ```ini
  [program:web]
  command=node apps/web/server.js
  ```

### Consequences

- The Next.js app runs as a single Node process with minimal runtime dependencies.
- The final container does not need the full source tree for the web app.
- Port configuration is controlled via env vars (`PORT=3000`, `HOSTNAME=0.0.0.0`).

---

## ADR-003: Single “all-in-one” Docker image with supervisord

**Status:** Accepted  
**Date:** 2025-11-30

### Context

We want a simple way (especially for demos, local testing, and small deployments) to run:

- Web (Next.js)
- API (Express)
- Lake (Python)

in a single container while keeping each as a separate process.

### Decision

Use a **multi-stage Docker build** and **supervisord** as the process manager:

- `builder` stage builds web and API.
- `lake-deps` stage builds the Python virtualenv.
- `runner` stage:
  - Copies web standalone build.
  - Copies a self-contained API bundle.
  - Copies Python venv and lake sources.
  - Starts `supervisord` as `CMD`.

`supervisord.conf` manages:

```ini
[program:web]
command=node apps/web/server.js

[program:api]
command=node apps/api/dist/index.js

[program:lake]
command=gunicorn app:app --bind 0.0.0.0:8000 --chdir /app/apps/lake
```

An optional `[program:init]` exists but is disabled by default (`autostart=false`).

### Consequences

- A single image (`stafferfi-all`) exposes ports:
  - 3000 → web
  - 4000 → API
  - 8000 → lake
- Easy for users: one `docker run` starts everything.
- Slightly more complex Dockerfile and supervision logic vs. one-process-per-container.

---

## ADR-004: Self-contained API bundle built in Docker builder stage

**Status:** Accepted  
**Date:** 2025-11-30

### Context

`apps/api` is part of a pnpm workspace. In early Docker attempts, the API in the final image failed to resolve dependencies like `express` because:

- pnpm hoisted dependencies to workspace-level `node_modules`.
- Copying only `apps/api/dist` into the runtime container did not include the right `node_modules`.
- Trying to reproduce workspace resolution with npm in the runtime stage led to dependency resolution issues (`ERESOLVE`, peer deps, etc.).

### Decision

Create a self-contained API bundle **in the builder stage** using npm, then copy that bundle into the runtime image:

1. In the `builder` stage:
   - Build the API: `pnpm build:api` → `apps/api/dist`.
   - Prepare a clean location `/tmp/api`.
   - Copy `apps/api/package.json` to `/tmp/api`.
   - Run:

     ```bash
     npm install --only=production --legacy-peer-deps
     ```

     inside `/tmp/api`, so that `node_modules` only contains the API’s runtime deps.

   - Copy the built `dist` from `apps/api/dist` into `/tmp/api/dist`.

2. In the `runner` stage:

   - Copy `/tmp/api` from the builder:

     ```dockerfile
     COPY --from=builder /tmp/api ./apps/api
     ```

   - Start the API via supervisord:

     ```ini
     [program:api]
     command=node apps/api/dist/index.js
     ```

### Consequences

- The API no longer depends on pnpm’s workspace layout at runtime.
- All runtime dependencies (`express`, `duckdb`, etc.) are local to `apps/api/node_modules`.
- Docker build is more deterministic; runtime stage does not run `npm install`.
- There is duplicated dependency resolution (pnpm in dev, npm for the runtime bundle), but this is acceptable for the current scope.

---

## ADR-005: API and web port separation

**Status:** Accepted  
**Date:** 2025-11-30

### Context

The default environment variable `PORT` is used by the Next.js web server. Initially, the API also used `process.env.PORT`, which caused both web and API to bind to `3000`. This led to `EADDRINUSE` errors when both tried to listen on the same port.

### Decision

- Use a dedicated environment variable for the API port: `API_PORT`.
- In `apps/api/src/index.ts`:

  ```ts
  const port = Number(process.env.API_PORT ?? 4000);
  ```

- In the Docker `runner` stage:

  ```dockerfile
  ENV PORT=3000       # web
  ENV API_PORT=4000   # api
  ```

- Keep API mapped to host port `4000` in `docker run`.

### Consequences

- Web and API no longer conflict over port 3000.
- Port assignments are explicit and easy to override per environment.
- Local and Docker usage are consistent:
  - Web at `http://localhost:3000`
  - API at `http://localhost:4000`

---

## ADR-006: DuckDB import style in the API

**Status:** Accepted  
**Date:** 2025-11-30

### Context

The API uses DuckDB. The `duckdb` package is CommonJS, but the API’s TypeScript is compiled in a way that uses ESM-style imports. A direct named import:

```ts
import { Database } from 'duckdb';
```

caused runtime errors in Node 20:

> `Named export 'Database' not found. The requested module 'duckdb' is a CommonJS module...`

### Decision

Use a default import and destructuring to interoperate with DuckDB’s CommonJS module:

```ts
import duckdb from 'duckdb';

const { Database } = duckdb;
const db = new Database(':memory:');
```

### Consequences

- API starts cleanly under Node 20 ESM semantics.
- No need for additional bundlers or transpilation changes.
- Keeps DuckDB usage simple and explicit in the API code.

---

## ADR-007: Disable `init` program by default in supervisord

**Status:** Accepted  
**Date:** 2025-11-30

### Context

The `supervisord.conf` includes an `[program:init]` section intended for a simple startup script (`/app/init.sh`) that prints banner information such as:

- “StafferFi container starting…”
- Service URLs (web, API, lake)

When configured with `autostart=true` and `autorestart=true`, this short-lived script exits immediately with status `0`, causing `supervisord` to repeatedly restart it and eventually mark it as `FATAL`, spamming the logs:

- `WARN exited: init (exit status 0; not expected)`
- `gave up: init entered FATAL state, too many start retries too quickly`

The main services (`web`, `api`, `lake`) remained healthy, but the noise was confusing.

### Decision

Keep `init` defined but **disabled by default**:

```ini
[program:init]
command=/app/init.sh
autostart=false
autorestart=false
```

This preserves the option to run `/app/init.sh` manually (e.g., via `supervisorctl start init`) without affecting the core services or cluttering logs.

### Consequences

- Default container startup is clean: only `web`, `api`, and `lake` are managed by `supervisord`.
- No repeated warnings or `FATAL` state for `init`.
- If in the future we need one-time initialization (e.g., migrations or sanity checks), we can:
  - Enable `autostart` with `autorestart=false` and `exitcodes=0`, or
  - Run `init` manually as needed.
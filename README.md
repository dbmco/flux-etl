# StafferFi

StafferFi is a multi-tier polyglot ETL service collection represented by the following services:

- **Web UI** – Next.js 15 (TypeScript, Tailwind, etc.) under `apps/web`
- **API** – Express + DuckDB under `apps/api`
- **Lake** – Python (FastAPI/Flask-style app) served by Gunicorn under `apps/lake`

The project uses **pnpm** workspaces in development and a single **Docker image** with `supervisord` to run all three services in production-like environments.

## Documentation

[Discovery](./docs/discovery/DISCOVERY.md)
[Planning](./docs/)
[ADRs](./docs/)

## Demo Quick Start (local docker)

You can also run everything from the all‑in‑one image directly, if you prefer to manage Postgres yourself.

### 1. Demo Build

```bash
brew install --cask docker
./demo.sh
```

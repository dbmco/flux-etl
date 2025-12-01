# StafferFi 🦕

StafferFi is a multi-tier polyglot ETL service collection represented by the following services.

> [!NOTE]
> - **Web UI** – Next.js 15 (TypeScript, Tailwind, etc.) under `apps/web`
> - **API** – Express + DuckDB under `apps/api`
> - **Lake** – Python (FastAPI/Flask-style app) served by Gunicorn under `apps/lake`

## Documentation

- [Discovery](./docs/discovery/README.md)
- [Planning](./docs/planning/README.md)
- [ADRs](./docs/adrs/README.md)

> [!IMPORTANT]
> This project uses **pnpm** workspaces in a single **Docker image** with `supervisord` running all services in prd-like environment.

## Demo Quick Start (local docker)

- [Start here for demo documentation](./docs/demo/README.md)

### 1. Demo Build Launch 🚀

```bash
brew install --cask docker
./demo.sh
```

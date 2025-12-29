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

## Gitpod (recommended for quick, isolated runs)

If you want an environment that runs the ETL and services without changing your host Python setup, open this repository in Gitpod. The workspace will:

- install JS dependencies with `pnpm`
- create a Python virtualenv for `apps/lake` and install Python deps
- start `postgres`, run the containerized `etl` job, then bring up `api` and `web` using the repository `docker-compose.yml`

To run locally using the same helper script (requires Docker):

```bash
# from repo root
bash .gitpod/gitpod-start.sh
```

The Gitpod configuration and helper script do not modify your existing Dockerfiles or `docker-compose.yml` — they only orchestrate them.

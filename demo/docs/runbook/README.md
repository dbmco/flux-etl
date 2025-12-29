## Operations Runbook

#### Docker

:::info
This runbook is in active development. Contributions are welcome.
:::

### Docker Compose

The easiest way to run the full stack locally is via Docker Compose.

AC

- Start a Postgres container.
- Run the DuckDB → Postgres pipeline (ingestion + ETL) once.
- Start the API and web UI, wired to dev Postgres.

From the repo root:

```bash
# Build and run all services
sudo docker compose up --build
```

Then open:

- Web UI:  http://localhost:3000  
- API:     http://localhost:4000  
- Lake:    http://localhost:8000  

To stop everything:

```bash
sudo docker compose down
```

### What Compose Does

`docker-compose.yml` defines:

- `postgres` – Postgres 16 (non-persistent for MVP):
  - `POSTGRES_DB=ecfr_analytics`
  - `POSTGRES_USER=stafferfi`
  - `POSTGRES_PASSWORD=stafferfi_dev`
- `etl` – one-shot data loader:
  - Waits for `postgres` to be healthy, then runs:
    ```bash
    /opt/venv/bin/python apps/lake/ingestion.py \
      && /opt/venv/bin/python apps/lake/etl_to_postgres.py
    ```
  - Uses `DATABASE_URL=postgresql://stafferfi:stafferfi_dev@postgres:5432/ecfr_analytics`.
- `api` – Node/Express API:
  - Depends on healthy `postgres` and successful `etl`.
  - Exposed on `http://localhost:4000`.
- `web` – Next.js frontend:
  - Depends on `api`.
  - Exposed on `http://localhost:3000`.

All of these use the same `Dockerfile` (`target: runner`) and are built from the monorepo.

### Known Issues

- Docker compose e2e orchestration pending [DuckDB locking conflict](./supervisord.conf)
- Active work on [Local (Production Staging) Development Environment](./local-dev.sh)
- Current work on [Orchestration](./docker-start.sh)

## SRE

### Check running containers

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

### View logs (Compose)

```bash
sudo docker compose logs -f
```

### View logs (single container)

```bash
sudo docker logs stafferfi-all
sudo docker logs stafferfi-postgres
```

### Inspect processes inside the all-in-one container

```bash
sudo docker exec -it stafferfi-all bash

# Inside the container:
supervisorctl -c /etc/supervisord.conf status
supervisorctl -c /etc/supervisord.conf tail lake_pipeline stdout
supervisorctl -c /etc/supervisord.conf tail api stdout
supervisorctl -c /etc/supervisord.conf tail web stdout
```

### Reset the stack (Compose)

```bash
sudo docker compose down -v
sudo docker compose up --build
```

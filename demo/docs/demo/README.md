# Demo

[Back to Main README.md](../../README.md)

## Run Demo Documentation

```bash
git clone git@github.com:eUSDSRecruiting/Michael-H-Take-Home-Assessment.git stafferfi
cd stafferfi

# Build the multi-stage Docker image
sudo docker build -t stafferfi-all .

# Create Docker network only if it does NOT exist
if ! sudo docker network ls --format '{{.Name}}' | grep -q "^stafferfi-net$"; then
  echo "Creating Docker network: stafferfi-net"
  sudo docker network create stafferfi-net
else
  echo "Docker network already exists: stafferfi-net"
fi

# Remove any existing Postgres container
sudo docker rm -f stafferfi-postgres || true

# Start Postgres
sudo docker run -d \
  --name stafferfi-postgres \
  --network stafferfi-net \
  -e POSTGRES_USER=stafferfi \
  -e POSTGRES_PASSWORD=stafferfi_dev \
  -e POSTGRES_DB=ecfr_analytics \
  -p 5432:5432 \
  postgres:16-alpine

# Start the main StafferFi container
sudo docker run --rm \
  --name stafferfi-all \
  --network stafferfi-net \
  -p 3000:3000 -p 4000:4000 -p 8000:8000 \
  -e DATABASE_URL='postgresql://stafferfi:stafferfi_dev@stafferfi-postgres:5432/ecfr_analytics' \
  stafferfi-all

echo "🚀 StafferFi USDS Demo"
echo "=========================================="
echo "Web UI:  http://localhost:3000"
echo "API:     http://localhost:4000"
echo "Lake:    http://localhost:8000"
```

### 2. Start Postgres in Docker

```bash
sudo docker network create stafferfi-net || true

sudo docker rm -f stafferfi-postgres || true
sudo docker run -d \
  --name stafferfi-postgres \
  --network stafferfi-net \
  -e POSTGRES_USER=stafferfi \
  -e POSTGRES_PASSWORD=stafferfi_dev \
  -e POSTGRES_DB=ecfr_analytics \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Run the all‑in‑one app container

```bash
sudo docker run --rm \
  --name stafferfi-all \
  --network stafferfi-net \
  -p 3000:3000 -p 4000:4000 -p 8000:8000 \
  -e DATABASE_URL='postgresql://stafferfi:stafferfi_dev@stafferfi-postgres:5432/ecfr_analytics' \
  stafferfi-all
```

Inside `stafferfi-all`, `supervisord` will:

- Run `lake_pipeline` (DuckDB ingestion + ETL to Postgres).
- Start:
  - Next.js web on port 3000.
  - Node API on port 4000.
  - Gunicorn lake app on port 8000.
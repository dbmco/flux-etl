#!/usr/bin/env bash
set -euo pipefail

echo "Starting Postgres (docker compose)"
docker compose up -d postgres

echo "Waiting for Postgres to be ready..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U stafferfi -d ecfr_analytics >/dev/null 2>&1; then
    echo "Postgres is ready"
    break
  fi
  echo "Waiting for Postgres... ($i)"
  sleep 2
done

echo "Running ETL (containerized)"
docker compose up --build etl

echo "Starting API and Web services"
docker compose up -d api web

echo "Tailing logs (ctrl-c to stop)"
docker compose logs -f

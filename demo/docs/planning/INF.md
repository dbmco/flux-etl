# StafferFi - Docker Deployment Guide

## Quick Start

### One Command to Rule Them All

```bash
./docker-start.sh
```

This script will:
1. Stop any existing containers
2. Build all Docker images
3. Start all services in the correct order
4. Load data into PostgreSQL
5. Display service URLs (Gitpod-aware)

## What's Running

### Services

| Service | Port | Description |
|---------|------|-------------|
| **postgres** | 5432 | PostgreSQL database (non-persistent) |
| **etl** | - | Data loader (runs once, then exits) |
| **api** | 4000 | Node.js Express API |
| **web** | 3000 | Next.js React frontend |

### Service Dependencies

```
postgres (starts first)
    ↓
etl (loads data, then exits)
    ↓
api (starts after ETL completes)
    ↓
web (starts after API is ready)
```

---

## Access URLs

### In Gitpod

The `docker-start.sh` script automatically detects Gitpod and shows the correct URLs:

```
Web:  https://3000-<workspace-id>.gitpod.dev
API:  https://4000-<workspace-id>.gitpod.dev
```

### Local Development

```
Web:  http://localhost:3000
API:  http://localhost:4000
```

**Note:** The frontend automatically detects if it's running in Gitpod and constructs the correct API URL.

## Manual Commands

### Start All Services
```bash
docker-compose up -d
```

### Stop All Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f etl
```

### Rebuild After Code Changes
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Check Service Status
```bash
docker-compose ps
```

## Architecture Improvements

### What Changed

1. **All services in Docker** - No more manual process management
2. **Automatic data loading** - ETL runs automatically on startup
3. **Proper service orchestration** - Services start in the correct order
4. **Gitpod URL detection** - Frontend automatically uses correct API URL
5. **Network isolation** - Services communicate via Docker network
6. **Health checks** - PostgreSQL waits until healthy before starting dependents

### Why This is Better

✅ **Reproducible** - Same environment everywhere  
✅ **Robust** - Services restart automatically if they crash  
✅ **Isolated** - No port conflicts or process management issues  
✅ **Portable** - Works in Gitpod, local, or any Docker environment  
✅ **Production-ready** - Same setup can be used for deployment  


## Environment Variables

### Automatic Configuration

The system automatically configures itself based on the environment:

**In Gitpod:**
- `NEXT_PUBLIC_API_URL` is set to `https://4000-<workspace-id>.gitpod.dev`
- Frontend detects Gitpod and constructs API URLs dynamically

**Locally:**
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000`
- Standard localhost URLs work out of the box

### Manual Override

You can override the API URL if needed:

```bash
export NEXT_PUBLIC_API_URL=https://your-custom-api-url.com
docker-compose up -d
```


## Data Persistence

### Current Setup (MVP)

PostgreSQL uses `tmpfs` (in-memory storage):
- ✅ Fast
- ✅ Clean slate on restart
- ✅ Good for development/testing
- ❌ Data lost when container stops

### For Production

To make data persistent, update `docker-compose.yml`:

```yaml
postgres:
  volumes:
    - postgres_data:/var/lib/postgresql/data
  # Remove tmpfs line

volumes:
  postgres_data:
```


## Troubleshooting

### Services Not Starting

```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs api
```

### Port Already in Use

```bash
# Kill processes on ports 3000 and 4000
sudo lsof -i:3000 -t | xargs sudo kill -9
sudo lsof -i:4000 -t | xargs sudo kill -9

# Restart
docker-compose up -d
```

### Data Not Loading

```bash
# Check ETL logs
docker-compose logs etl

# Manually run ETL
docker-compose run --rm etl python apps/lake/etl_to_postgres.py
```

### Web Shows "Loading..." Forever

This means the frontend can't reach the API. Check:

1. API is running: `curl http://localhost:4000/health`
2. API URL is correct in browser console
3. CORS is enabled (it is by default)


## Development Workflow

### Making Changes

**API Changes:**
```bash
# Edit files in apps/api/src/
docker-compose down
docker-compose build api
docker-compose up -d
```

**Web Changes:**
```bash
# Edit files in apps/web/app/
docker-compose down
docker-compose build web
docker-compose up -d
```

**For faster development**, you can still run services locally:
```bash
# Terminal 1: API
cd apps/api
DATABASE_URL=postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics node dist/index.js

# Terminal 2: Web (with hot reload)
cd apps/web
pnpm dev
```


## Testing the Stack

### Quick Health Check

```bash
# API
curl http://localhost:4000/health

# API Stats
curl http://localhost:4000/api/stats

# Web (should return HTML)
curl -I http://localhost:3000
```

### Full Test

```bash
# Run the smoke test
curl http://localhost:4000/api/agencies/top/corrections?limit=3 | jq '.'
```

Expected output:
```json
[
  {
    "slug": "justice-department",
    "name": "Department of Justice",
    "total_corrections": 1024,
    "rvi": "12800.00"
  },
  ...
]
```

## Docker Compose Configuration

### Key Features

1. **Service Dependencies**
   ```yaml
   depends_on:
     postgres:
       condition: service_healthy
     etl:
       condition: service_completed_successfully
   ```

2. **Health Checks**
   ```yaml
   healthcheck:
     test: ["CMD-SHELL", "pg_isready -U stafferfi -d ecfr_analytics"]
     interval: 5s
   ```

3. **Restart Policies**
   ```yaml
   restart: unless-stopped  # API and Web
   restart: "no"            # ETL (runs once)
   ```

4. **Network Isolation**
   ```yaml
   networks:
     - stafferfi
   ```


## Comparison: Before vs After

### Before (Manual)
```bash
# Terminal 1
docker-compose up -d postgres

# Terminal 2
cd apps/lake && python3 etl_to_postgres.py

# Terminal 3
cd apps/api && DATABASE_URL=... node dist/index.js

# Terminal 4
cd apps/web && pnpm dev
```

❌ 4 terminals  
❌ Manual coordination  
❌ Easy to forget steps  
❌ Processes can die silently  

### After (Docker)
```bash
./docker-start.sh
```

✅ One command  
✅ Automatic coordination  
✅ Reproducible  
✅ Services auto-restart  

## Next Steps

Now that the infrastructure is solid:

1. ✅ All services running in Docker
2. ✅ Automatic data loading
3. ✅ Gitpod URL detection
4. 🚀 Ready to continue Phase 3 (UI development)

Access your dashboard:
- **Gitpod:** Check the URLs shown by `./docker-start.sh`
- **Local:** http://localhost:3000

## Quick Reference

```bash
# Start everything
./docker-start.sh

# Stop everything
docker-compose down

# View logs
docker-compose logs -f

# Rebuild after changes
docker-compose down && docker-compose build && docker-compose up -d

# Check status
docker-compose ps

# Access database
docker-compose exec postgres psql -U stafferfi -d ecfr_analytics
```

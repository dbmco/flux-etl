# Service Status & Startup Guide

## Current Status

### ✅ PostgreSQL
- **Status:** Running and healthy
- **Port:** 5432
- **Data:** Loaded (316 agencies, 3,343 corrections)
- **Check:** `docker-compose ps`

### ✅ API Server
- **Status:** Running
- **Port:** 4000
- **URL:** [https://4000--019ad7e6-193a-7382-a07c-94261dfc9bd5.us-east-1-01.gitpod.dev](https://4000--019ad7e6-193a-7382-a07c-94261dfc9bd5.us-east-1-01.gitpod.dev)
- **Health:** `curl http://localhost:4000/health`
- **Test:** `curl http://localhost:4000/api/stats`

### ⚠️ Web Frontend
- **Status:** Needs manual start
- **Port:** 3000
- **Built:** ✅ Yes (production build successful)
- **Start:** `cd apps/web && pnpm dev`

---

## Quick Start

### Option 1: Manual Start (Recommended for Development)

```bash
# 1. Start PostgreSQL
docker-compose up -d postgres

# 2. Load data
cd apps/lake
python3 etl_to_postgres.py
cd ../..

# 3. Start API (in terminal 1)
cd apps/api
DATABASE_URL=postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics node dist/index.js

# 4. Start Web (in terminal 2)
cd apps/web
pnpm dev
```

### Option 2: Using the Startup Script

```bash
./start-services.sh
```

**Note:** The script starts services in the background. Check logs:
- API: `tail -f /tmp/api.log`
- Web: `tail -f /tmp/web.log`

---

## Service URLs

### Local Development
- **API:** http://localhost:4000
- **Web:** http://localhost:3000

### Gitpod Preview URLs
- **API:** https://4000--019ad7e6-193a-7382-a07c-94261dfc9bd5.us-east-1-01.gitpod.dev
- **Web:** https://3000--019ad7e6-193a-7382-a07c-94261dfc9bd5.us-east-1-01.gitpod.dev (when running)

---

## Testing Services

### Test API
```bash
# Health check
curl http://localhost:4000/health

# Statistics
curl http://localhost:4000/api/stats

# Top agencies
curl http://localhost:4000/api/agencies/top/corrections?limit=5
```

### Test Web
```bash
# Check if running
curl -I http://localhost:3000

# Or open in browser
open http://localhost:3000  # macOS
xdg-open http://localhost:3000  # Linux
```

---

## Troubleshooting

### PostgreSQL Not Running
```bash
docker-compose up -d postgres
docker-compose ps  # Check status
```

### No Data in PostgreSQL
```bash
cd apps/lake
python3 etl_to_postgres.py
```

### API Not Responding
```bash
# Check if process is running
ps aux | grep "node dist/index.js"

# Check logs
tail -f /tmp/api.log

# Restart
cd apps/api
DATABASE_URL=postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics node dist/index.js
```

### Web Not Starting
```bash
# Check if port is in use
lsof -i:3000

# Kill existing process
pkill -f "next dev"

# Restart
cd apps/web
pnpm dev
```

### "Service Unavailable" Error
This usually means:
1. PostgreSQL is down → `docker-compose up -d postgres`
2. Data not loaded → `cd apps/lake && python3 etl_to_postgres.py`
3. API not running → Start API server
4. Web not running → Start web server

---

## Stopping Services

### Stop All Services
```bash
# Stop API and Web
pkill -f "node dist/index.js"
pkill -f "next dev"

# Stop PostgreSQL
docker-compose down
```

### Stop Individual Services
```bash
# Stop API
pkill -f "node dist/index.js"

# Stop Web
pkill -f "next dev"

# Stop PostgreSQL
docker-compose stop postgres
```

---

## Development Workflow

### Making Changes

**API Changes:**
```bash
cd apps/api
# Edit src/index.ts
pnpm build
# Restart API server
```

**Web Changes:**
```bash
cd apps/web
# Edit files in app/
# Next.js hot-reloads automatically (no restart needed)
```

**Data Pipeline Changes:**
```bash
cd apps/lake
# Edit Python files
python3 etl_to_postgres.py  # Reload data
```

---

## Current Implementation Status

### ✅ Completed
- PostgreSQL database with schema
- ETL pipeline (DuckDB → PostgreSQL)
- API with 11 endpoints
- Dashboard homepage with:
  - Overview statistics cards
  - Top 5 agencies list
  - Navigation menu
  - Quick links

### 🚧 In Progress
- Agency list page (placeholder)
- Agency detail page (placeholder)
- Corrections page (placeholder)
- Trends page (placeholder)
- amCharts4 visualizations

### 📋 Next Steps
1. Build agency list page with sortable table
2. Add amCharts4 bar chart for top agencies
3. Create agency detail page with metrics
4. Add line chart for yearly trends
5. Implement filtering and search

---

## Known Issues

1. **Background processes timeout in exec commands**
   - Workaround: Start services in separate terminals
   - Or use the startup script

2. **Gitpod preview URLs may change**
   - URLs are session-specific
   - Check current URLs with `gp url 3000` and `gp url 4000`

3. **Non-persistent PostgreSQL**
   - Data is lost when container restarts
   - Intentional for MVP
   - Re-run ETL to reload: `cd apps/lake && python3 etl_to_postgres.py`

---

## Quick Reference

### Check Service Status
```bash
# PostgreSQL
docker-compose ps

# API
curl http://localhost:4000/health

# Web
curl -I http://localhost:3000
```

### View Logs
```bash
# API
tail -f /tmp/api.log

# Web
tail -f /tmp/web.log

# PostgreSQL
docker-compose logs -f postgres
```

### Restart Everything
```bash
# Stop all
pkill -f "node dist/index.js"
pkill -f "next dev"
docker-compose down

# Start all
./start-services.sh
```

---

**Last Updated:** 2025-12-01  
**API Status:** ✅ Running  
**Web Status:** ⚠️ Needs manual start  
**PostgreSQL Status:** ✅ Running with data

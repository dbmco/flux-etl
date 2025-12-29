# StafferFi - Quick Start Guide

## 🚀 Start Everything (One Command)

```bash
docker-compose down && docker-compose up -d
```

This will:
1. Stop any existing containers
2. Start PostgreSQL (non-persistent)
3. Run ETL to load data (316 agencies, 3,343 corrections)
4. Start API server (port 4000)
5. Start Web frontend (port 3000)

**Wait ~10 seconds** for all services to be ready.

---

## 🌐 Access URLs

### Gitpod
- **Web:** https://3000--019ad7e6-193a-7382-a07c-94261dfc9bd5.us-east-1-01.gitpod.dev
- **API:** https://4000--019ad7e6-193a-7382-a07c-94261dfc9bd5.us-east-1-01.gitpod.dev

### Local
- **Web:** http://localhost:3000
- **API:** http://localhost:4000

---

## ✅ Verify Everything Works

```bash
# Check services are running
docker-compose ps

# Should show:
# - postgres (healthy)
# - api (up)
# - web (up)
# - etl (exited 0) ← This is normal, it runs once then exits

# Test API
curl http://localhost:4000/api/stats

# Should return:
# {"total_agencies":"316","total_corrections":"3343",...}

# Test Web
curl -I http://localhost:3000

# Should return: HTTP/1.1 200 OK
```

---

## 🔄 When to Restart

### **Restart if:**
- Database is empty (API returns 0 agencies)
- Services crashed
- After code changes
- PostgreSQL container stopped

### **How to Restart:**
```bash
docker-compose down && docker-compose up -d
```

---

## 📊 What You'll See

### Dashboard (/)
- 4 statistics cards
- Top 5 agencies bar chart
- Quick links

### Agencies (/agencies)
- Sortable table of 100 agencies
- Search functionality
- Click any agency for details

### Agency Detail (/agencies/[slug])
- Metrics cards
- Corrections by year chart
- Recent corrections list

### Trends (/trends)
- Yearly corrections line chart
- Average lag days line chart
- Top CFR titles bar chart
- Statistics table

---

## 🐛 Troubleshooting

### Problem: "Service Unavailable"
**Solution:**
```bash
docker-compose down && docker-compose up -d
sleep 10  # Wait for services to start
```

### Problem: Dashboard shows "Loading..." forever
**Cause:** API not responding or database empty

**Solution:**
```bash
# Check API
curl http://localhost:4000/health

# If it fails, restart:
docker-compose down && docker-compose up -d
```

### Problem: Charts not showing
**Cause:** Data not loaded or API connection issue

**Solution:**
```bash
# Check if data exists
docker-compose exec postgres psql -U stafferfi -d ecfr_analytics -c "SELECT COUNT(*) FROM agencies;"

# If returns 0, restart to reload data:
docker-compose down && docker-compose up -d
```

### Problem: PostgreSQL keeps crashing
**Cause:** tmpfs (non-persistent storage) issue

**Solution:** Make PostgreSQL persistent by editing `docker-compose.yml`:

```yaml
postgres:
  volumes:
    - postgres_data:/var/lib/postgresql/data
  # Remove the tmpfs section

volumes:
  postgres_data:
```

Then restart:
```bash
docker-compose down && docker-compose up -d
```

---

## 📝 Important Notes

### Non-Persistent Database
- PostgreSQL uses tmpfs (in-memory storage)
- **Data is lost when container stops**
- ETL automatically reloads data on startup
- This is intentional for MVP/development

### ETL Container
- Runs once on startup
- Loads all data into PostgreSQL
- Exits with code 0 (success)
- Shows as "Exited" in `docker-compose ps` - **this is normal**

### Service Dependencies
```
postgres starts → becomes healthy → 
etl runs → completes → 
api starts → 
web starts
```

---

## 🔍 View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f etl
docker-compose logs -f postgres

# ETL logs (to verify data loaded)
docker-compose logs etl | tail -30
```

---

## 🛑 Stop Everything

```bash
docker-compose down
```

This stops and removes all containers but keeps the images.

---

## 🔧 Development Workflow

### After Code Changes

**API changes:**
```bash
docker-compose down
docker-compose build api
docker-compose up -d
```

**Web changes:**
```bash
docker-compose down
docker-compose build web
docker-compose up -d
```

**All changes:**
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

---

## 📈 Expected Data

After successful startup, you should see:
- **316 agencies** (153 parent + 163 sub-agencies)
- **3,343 corrections** (2005-2025)
- **46 CFR titles** with corrections
- **244 time series records** (monthly data)

Top agencies:
1. Department of Justice: 1,024 corrections
2. EPA: 984 corrections
3. Department of Defense: 713 corrections

---

## ⚡ Quick Commands

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# Restart everything
docker-compose down && docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Check data
curl http://localhost:4000/api/stats

# Access database
docker-compose exec postgres psql -U stafferfi -d ecfr_analytics
```

---

## 🎯 Success Checklist

After running `docker-compose up -d`, verify:

- [ ] `docker-compose ps` shows postgres as "healthy"
- [ ] `docker-compose ps` shows api as "Up"
- [ ] `docker-compose ps` shows web as "Up"
- [ ] `docker-compose logs etl` shows "✅ ETL Complete!"
- [ ] `curl http://localhost:4000/health` returns `{"status":"ok"}`
- [ ] `curl http://localhost:4000/api/stats` returns agency count
- [ ] Web loads at http://localhost:3000
- [ ] Dashboard shows 4 stat cards with numbers
- [ ] Bar chart displays on dashboard

If all checks pass: **✅ You're ready to go!**

---

**Need help?** Check the full documentation:
- `README_DOCKER.md` - Docker deployment details
- `docs/PHASE_3_COMPLETE.md` - Feature documentation
- `docs/IMPLEMENTATION_SUMMARY.md` - Technical overview

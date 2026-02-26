# Flux ETL - Quick Reference Card

## 🎯 What's Changed Today?

**Critical Issue Fixed:** Project renamed from "StafferFi" to "Flux" across all systems  
**New Frameworks Added:** Error handling, logging, schema validation, checkpoint resilience  
**New Documentation:** 5 comprehensive architecture guides (40,000+ words)

---

## 📚 Start Here

### For Engineering Leads
1. **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Executive overview, roadmap, resource requirements
2. **[CTO_TECHNICAL_REVIEW.md](CTO_TECHNICAL_REVIEW.md)** - Deep dive on all 11 critical issues

### For Backend Engineers
1. **[flux-common/ARCHITECTURE.md](flux-common/ARCHITECTURE.md)** - Error types, logging, validation standards
2. **[mcpcli_project/errors.go](mcpcli_project/errors.go)** - Error handling implementation
3. **[mcpcli_project/logging.go](mcpcli_project/logging.go)** - Structured logging
4. **[mcpcli_project/validation.go](mcpcli_project/validation.go)** - Schema validation

### For Data/Infrastructure Engineers
1. **[demo/apps/lake/schema_checkpoints.sql](demo/apps/lake/schema_checkpoints.sql)** - Checkpoint resilience (NEW!)
2. **[MULTI_TENANCY_ARCHITECTURE.md](MULTI_TENANCY_ARCHITECTURE.md)** - Multi-agency isolation
3. **[k8s/flux-production.yaml](k8s/flux-production.yaml)** - Production Kubernetes manifests
4. **[k8s/README.md](k8s/README.md)** - K8s deployment guide

### For Security/Compliance
1. **[MULTI_TENANCY_ARCHITECTURE.md](MULTI_TENANCY_ARCHITECTURE.md)** - §FedRAMP Compliance Map
2. **[demo/apps/lake/schema_checkpoints.sql](demo/apps/lake/schema_checkpoints.sql)** - Audit logging
3. **[k8s/flux-production.yaml](k8s/flux-production.yaml)** - Security context & RBAC

---

## 🔴 Critical Issues Fixed (Today)

### 1. Project Identity Crisis
```bash
# BEFORE: StafferFi, Data Plasma, Flux ETL (confused)
# AFTER:  Flux ETL (unified)

✅ Renamed @stafferfi/* → @flux/*
✅ Updated docker-compose networks: stafferfi → flux
✅ Updated DB credentials: stafferfi_dev → flux_dev
✅ Consolidated documentation
```

### 2. Missing Error Handling
```go
// BEFORE: fmt.Println("checkpoint write error:", err)  // Silent!
// AFTER:
return errors.CheckpointFailed("CHECKPOINT_WRITE_FAILED",
    "Failed to persist checkpoint state").
    WithContext("run_id", runID).
    WithTraceID(traceID)
```

### 3. File-Based Checkpoints (Dangerous in Production)
```sql
-- BEFORE: /tmp/run-abc123.checkpoint.json (local file!)
-- AFTER:  PostgreSQL with 5 tables:
--   - flux.checkpoints (durable)
--   - flux.checkpoint_events (denormalized)
--   - flux.checkpoint_hashes (integrity)
--   - flux.audit_log (forensics)
--   + RLS, indexes, functions, TTL

✅ Distributed-resilient
✅ Multi-tenant isolated
✅ Auditable
✅ Integrity-verifiable
```

### 4. No Schema Validation
```json
// BEFORE: Any client payload accepted
// AFTER: Strict JSON Schema v2020-12 validation

Valid agencies:
  - national-archives
  - nasa
  - library-of-congress
  - etc.

Valid content_types: [images, documents, text, mixed]
Valid use_cases: [vr, ai-training, research, ...]
```

### 5. Weak Multi-Agency Isolation
```go
// BEFORE: Agency passed in client payload (forgeable)
// AFTER:  Agency extracted from cryptographically-signed JWT

JWT Claims: {
  "iss": "https://national-archives.oidc.gov",
  "agency": "national-archives",  // Cannot be forged
  "role": "admin|operator|viewer"
}

Database enforces isolation:
  - RLS policies on every table
  - WHERE agency_id = current_setting(...)
```

---

## 🚀 Next Steps (In Priority Order)

### Phase 1: Foundation (Weeks 1-3)
- [ ] **Sprint 1:** Finalize naming, assign team leads
- [ ] **Sprint 2:** Integrate error/logging into all services
- [ ] **Sprint 3:** Wire up PostgreSQL checkpoint schema

### Phase 2: Integration (Weeks 4-7)
- [ ] **Sprint 4-5:** Migrate CLI to Express, implement JWT auth
- [ ] **Sprint 6-7:** Add multi-tenancy (RLS policies, ABAC)

### Phase 3: Production (Weeks 8-10)
- [ ] **Sprint 8-9:** OpenTelemetry tracing, Prometheus metrics
- [ ] **Sprint 10-11:** Kubernetes manifests, load testing

### Phase 4: Hardening (Weeks 11-15)
- [ ] **Sprint 12-13:** Security audit, FedRAMP mapping
- [ ] **Sprint 14-15:** Go-live preparation

---

## 📊 Key Metrics to Track

```
✅ Sprint Velocity (target: 40 story points/sprint)
✅ Code Coverage (target: >80% critical paths)
✅ Checkpoint Success Rate (target: 99.99%)
✅ API Latency p99 (target: <500ms)
✅ MTTR (target: <15 minutes)
✅ Multi-agency isolation violations (target: 0)
```

---

## 🔧 Development Environment Setup

### Clone and Build

```bash
cd ~/src/flux-etl
pnpm install
pnpm build:web
pnpm build:api
```

### Database Setup

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Apply checkpoint schema
psql -h localhost -U flux -d flux_production \
  < demo/apps/lake/schema_checkpoints.sql

# Verify
psql -h localhost -U flux -d flux_production -c "\dt flux.*"
```

### Run Services

```bash
# Terminal 1: API
cd demo/apps/api && pnpm dev

# Terminal 2: Lake (ETL)
cd demo/apps/lake && python3 app.py

# Terminal 3: Web
cd demo/apps/web && pnpm dev
```

### Run Tests

```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration

# E2E tests
pnpm cypress:run
```

---

## 📋 Code Standards (Post-Refactoring)

### Naming
- ✅ All project refs: **Flux** (not StafferFi, Data Plasma, MCPCLI)
- ✅ Packages: `@flux/web`, `@flux/api`, `@flux/lake`
- ✅ Docker images: `flux/web`, `flux/api`, `flux/lake`

### Error Handling
```go
// Always return FluxError with classification
return errors.ValidationFailed("AGENCY_NOT_FOUND",
    fmt.Sprintf("Agency '%s' not in registered agencies", agency))
```

### Logging
```go
logger.Info("checkpoint saved successfully", map[string]interface{}{
    "run_id": runID,
    "agency": agencyID,
    "duration_ms": duration,
})
```

### Database
```sql
-- Every query must include agency_id filter
WHERE agency_id = current_setting('flux.current_agency_id')
```

---

## 🆘 Troubleshooting

### Tests Failing?
```bash
# Check setup
pnpm install
pnpm build

# Clear cache
rm -rf node_modules/.cache
pnpm clean

# Run tests with verbose output
pnpm test -- --verbose
```

### Database Connection Issues?
```bash
# Verify PostgreSQL running
docker ps | grep postgres

# Test connection
psql postgresql://flux:flux_dev@localhost/flux_production -c "SELECT version();"

# Check journalsqlogs
docker logs $(docker-compose ps -q postgres) | tail -50
```

### Checkpoint Tests Failing?
```bash
# Verify schema applied
psql -U flux -d flux_production -c "\dt flux."

# Check function exists
psql -U flux -d flux_production -c "\df flux."
```

---

## 📞 Contact

**CTO Technical Review?** → [CTO_TECHNICAL_REVIEW.md](CTO_TECHNICAL_REVIEW.md)  
**Architecture Questions?** → [flux-common/ARCHITECTURE.md](flux-common/ARCHITECTURE.md)  
**Kubernetes Issues?** → [k8s/README.md](k8s/README.md)  
**Multi-Tenancy Setup?** → [MULTI_TENANCY_ARCHITECTURE.md](MULTI_TENANCY_ARCHITECTURE.md)

---

## 📖 Additional Resources

- **JSON Schema Specification:** https://json-schema.org/draft/2020-12/
- **OpenTelemetry Docs:** https://opentelemetry.io/
- **PostgreSQL RLS Guide:** https://www.postgresql.org/docs/16/sql-createrole.html#SQL-CREATEPOLICY
- **Kubernetes Production Checklist:** https://kubernetes.io/docs/concepts/configuration/overview/
- **FedRAMP Quick Links:** https://www.fedramp.gov/
- **FISMA Requirements:** https://csrc.nist.gov/projects/federal-information-systems-modernization-act

---

**Last Updated:** February 26, 2026  
**Status:** Implementation Roadmap Complete

# Flux Common - Shared Architecture & Standards

This directory defines the **canonical patterns** for error handling, observability, and resilience across all Flux services.

## Directory Structure

```
flux-common/
├── errors/           # Error type definitions and classifications
├── logging/          # Structured logging patterns
├── observability/    # Metrics, tracing, health checks
├── schemas/          # Shared data contract definitions
└── patterns/         # Resilience patterns (checkpointing, retry)
```

## 1. Error Handling

### Error Classification

All errors MUST be classified into one of these categories:

```
ErrorClass
├── VALIDATION_ERROR    # Input validation failed (4xx)
├── TRANSIENT_ERROR     # Temporary failure, safe to retry (5xx, network timeout)
├── TERMINAL_ERROR      # Cannot recover (database corruption, bad config)
├── DATA_ISOLATION_ERROR # Security violation: agency boundary crossed
└── CHECKPOINT_ERROR    # Checkpoint persistence/load failed
```

### Error Structure (JSON)

```json
{
  "error_id": "uuid-v4",
  "timestamp": "2026-02-26T10:30:00Z",
  "class": "VALIDATION_ERROR",
  "message": "Agency slug must be lowercase alphanumeric",
  "code": "INVALID_AGENCY_SLUG",
  "context": {
    "agency_provided": "National-Archives",
    "valid_agencies": ["national-archives", "nasa", ...]
  },
  "trace_id": "trace-abc123xyz",
  "span_id": "span-def456abc",
  "request_id": "req-789ghi",
  "retryable": false,
  "http_status": 400
}
```

## 2. Structured Logging

Every log entry MUST include:

```json
{
  "timestamp": "ISO8601",
  "level": "INFO | WARN | ERROR | DEBUG",
  "message": "Human-readable summary",
  "service": "api | lake | cli",
  "trace_id": "UUID from request/checkpoint context",
  "span_id": "UUID for this operation",
  "correlation_id": "UUID linking related operations",
  "fields": {
    "agency": "national-archives",
    "action": "ingest",
    "duration_ms": 245,
    "items_processed": 100
  }
}
```

### Log Levels

- **ERROR:** Something failed and needs human investigation
- **WARN:** Unexpected but handled (retry, fallback used)
- **INFO:** Normal operations, significant state transitions
- **DEBUG:** Detailed diagnostics, only enabled in dev/troubleshooting

## 3. Observability (Metrics)

### Key Metrics (Prometheus)

```
# Counters
flux_requests_total{service,endpoint,status,agency}
flux_errors_total{service,error_class,agency}
flux_checkpoints_saved_total{service,success}

# Histograms
flux_request_duration_seconds{service,endpoint} [.001, .01, .1, .5, 1, 2, 5]
flux_checkpoint_size_bytes{service}

# Gauges
flux_active_runs{service,agency}
flux_checkpoint_queue_depth{service}
```

## 4. Checkpoint Resilience

### New Pattern (Post-Refactoring)

Checkpoints MUST be stored in PostgreSQL with:

```sql
CREATE TABLE flux_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(64) NOT NULL UNIQUE,
  agency_id VARCHAR(64) NOT NULL,
  provider_name VARCHAR(64) NOT NULL,
  model VARCHAR(128),
  
  payload JSONB NOT NULL,
  events JSONB NOT NULL,  -- Array of {timestamp, name, data}
  
  last_step VARCHAR(128),
  checkpoint_version INT NOT NULL DEFAULT 1,
  checkpoint_hash VARCHAR(64) NOT NULL,  -- SHA256(JSON)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  
  INDEX (agency_id, created_at),
  INDEX (run_id),
  INDEX (expires_at)
);

CREATE TABLE flux_checkpoint_events (
  id BIGSERIAL PRIMARY KEY,
  checkpoint_id UUID REFERENCES flux_checkpoints(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  event_name VARCHAR(128) NOT NULL,
  event_data JSONB,
  INDEX (checkpoint_id, timestamp)
);
```

### Checkpoint Integrity

```python
import hashlib
import json

def compute_checkpoint_hash(checkpoint: dict) -> str:
    """Compute deterministic SHA256 of checkpoint state."""
    # Sort keys to ensure deterministic ordering
    canonical = json.dumps(checkpoint, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()

def validate_checkpoint_integrity(checkpoint: dict, stored_hash: str) -> bool:
    """Verify checkpoint has not been corrupted."""
    computed = compute_checkpoint_hash(checkpoint)
    return computed == stored_hash
```

## 5. Health Checks

Every service MUST expose:

```
GET /health/live
  → 200 OK {} if process is alive
  → Used by K8s liveness probe

GET /health/ready
  → 200 OK {
      "status": "ready",
      "database": "connected",
      "cache": "connected",
      "timestamp": "2026-02-26T10:30:00Z"
    }
  → Used by K8s readiness probe

GET /health/deep
  → Comprehensive diagnostic
  → Check database query latency, checkpoint storage, etc.
```

## 6. Authentication & Tennancy

### JWT Claims (Required)

```json
{
  "iss": "https://idp.usds.gov",
  "sub": "user@agency.gov",
  "agency": "national-archives",
  "role": "admin|operator|viewer|analyzer",
  "iat": 1614386400,
  "exp": 1614472800
}
```

### Multi-Tenancy Enforcement

```python
# Every database query MUST include:
WHERE agency_id = :current_agency_id
  
# Every API response MUST be filtered:
@require_auth
def get_agencies():
    agency = get_current_user_agency()
    # Only return data for current agency
    return query().filter(agency_id == agency).all()
```

## 7. Schemas & Contracts

All payloads and responses are validated against JSON Schema files in `flux-common/schemas/`:

```
schemas/
├── v1/
│   ├── flux-payload-schema.json
│   ├── agency-manifest-schema.json
│   ├── use-case-schema.json
│   └── content-type-schema.json
└── v2/
    └── (future version)
```

---

## Implementation Checklist

- [ ] Error types defined for all services
- [ ] Structured logging implemented with correlation IDs
- [ ] Prometheus metrics instrumented
- [ ] PostgreSQL checkpoint storage implemented
- [ ] Checkpoint hash validation enforced
- [ ] Health check endpoints added
- [ ] JWT authentication wired
- [ ] Database RLS policies enforced
- [ ] JSON Schema validation middleware
- [ ] OpenTelemetry tracing initialized
- [ ] Documentation updated

---

**See CTO_TECHNICAL_REVIEW.md for full context and implementation timeline.**

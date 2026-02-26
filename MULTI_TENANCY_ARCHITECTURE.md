# Multi-Tenancy & Data Isolation Architecture

**Status:** CRITICAL for FedRAMP/FISMA compliance  
**Severity:** 🔴 MUST implement before production  
**Timeline:** Sprint 6-7 (2 weeks)

---

## Overview

Flux ETL serves **multiple federal agencies independently**. Each agency's data MUST be:
- ✅ **Isolated** - Agency A cannot see Agency B's data
- ✅ **Auditable** - Every access logged with WHO and WHEN
- ✅ **Enforced at database layer** - Not just application logic
- ✅ **Compliant** - Meets FedRAMP data segregation requirements

---

## Current Risk: Data Isolation Violation (Issue 2.2)

```go
// VULNERABLE CODE:
payload := map[string]interface{}{
    "agency": "national-archives",  // ← Client can forge this
}

// Malicious client:
payload := map[string]interface{}{
    "agency": "nasa",  // ← Gets NASA data instead!
}

// No enforcement = FedRAMP audit **FINDING**
```

---

## Solution: Multi-Layer Isolation

### Layer 1: Authentication (OIDC/SSO)

**Every request must include a valid JWT from the agency's identity provider.**

```
User Request
    ↓
[JWT Validation Middleware]
    ↓
Extract agency_id from JWT claims (cryptographically signed)
    ↓
Cannot be forged by client
```

#### Minimal JWT Claims (Required)

```json
{
  "iss": "https://national-archives.oidc.gov",     // Issuer must be verified
  "sub": "user@archives.gov",                      // User ID
  "agency": "national-archives",                   // This cannot be forged!
  "role": "admin|operator|viewer|analyzer",
  "groups": ["records-mgmt", "preservation"],
  "iat": 1614386400,                               // Issued at
  "exp": 1614472800,                               // Expires at
  "aud": "flux-api"                                // Audience = this API only
}
```

**Implementation Path:**
```go
// middleware/auth.go
func JWTMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        
        claims := ValidateJWT(token)  // Cryptographically verified
        if claims == nil {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }
        
        // Extract agency ID from JWT (NOT client payload)
        agencyID := claims["agency"].(string)
        
        // Store in context for this request
        ctx := context.WithValue(r.Context(), "agency_id", agencyID)
        ctx = context.WithValue(ctx, "user_id", claims["sub"].(string))
        ctx = context.WithValue(ctx, "role", claims["role"].(string))
        
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### Layer 2: Row-Level Security (PostgreSQL)

**Database enforces isolation at the SQL layer.**

```sql
-- Enable RLS on all data tables
ALTER TABLE flux_agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE flux_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE flux_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE flux_data_items ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only see their own agency's data
CREATE POLICY agencies_isolation ON flux_agencies
    USING (agency_id = current_setting('flux.current_agency_id'));

CREATE POLICY checkpoints_isolation ON flux_checkpoints
    USING (agency_id = current_setting('flux.current_agency_id'));

CREATE POLICY events_isolation ON flux_events
    USING (agency_id = current_setting('flux.current_agency_id'));

CREATE POLICY data_items_isolation ON flux_data_items
    USING (agency_id = current_setting('flux.current_agency_id'));

-- Set the current agency before each query
SET flux.current_agency_id = 'national-archives';
SELECT * FROM flux_checkpoints;  -- Only returns NA's checkpoints
```

**Why This Matters:** Even if application logic is bypassed (SQL injection), the database enforces isolation.

### Layer 3: Audit Logging

**Every data access is logged with full context.**

```sql
CREATE TABLE flux_audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- WHO
  user_id VARCHAR(256) NOT NULL,
  agency_id VARCHAR(64) NOT NULL,
  role VARCHAR(64),
  
  -- WHAT
  action VARCHAR(64) NOT NULL,  -- SELECT, INSERT, UPDATE, DELETE
  table_name VARCHAR(128) NOT NULL,
  record_id UUID,
  
  -- WHERE
  ip_address INET,
  user_agent TEXT,
  
  -- WHY (optional)
  reason TEXT,
  
  -- RESULT
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  -- PROOF
  request_id UUID,
  trace_id UUID,
  
  INDEX (timestamp),
  INDEX (agency_id, timestamp),
  INDEX (user_id, timestamp),
  INDEX (action, timestamp)
);

-- Trigger: log all INSERT/UPDATE/DELETE operations
CREATE TRIGGER flux_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON flux_checkpoints
FOR EACH ROW
EXECUTE FUNCTION audit_table_action();
```

**Query Example (audit for one user):**
```sql
SELECT timestamp, action, record_id, success, error_message
FROM flux_audit_log
WHERE user_id = 'user@archives.gov' AND agency_id = 'national-archives'
ORDER BY timestamp DESC
LIMIT 100;
```

### Layer 4: Request Isolation Context

**Every request carries immutable agency ID context.**

```go
// context/context.go
type RequestContext struct {
    AgencyID      string
    UserID        string
    Role          string  // admin, operator, viewer, analyzer
    TraceID       string
    RequestID     string
    Timestamp     time.Time
}

func (rc *RequestContext) CanModify() bool {
    return rc.Role == "admin" || rc.Role == "operator"
}

func (rc *RequestContext) CanView() bool {
    return rc.Role != "" // all roles can view their own data
}

// In every SQL query, enforce agency_id filter:
func GetCheckpoint(ctx context.Context, checkpointID uuid.UUID) (*Checkpoint, error) {
    reqCtx := ctx.Value("request_context").(RequestContext)
    
    checkpoint := &Checkpoint{}
    err := db.WithContext(ctx).
        Where("id = ? AND agency_id = ?", checkpointID, reqCtx.AgencyID).
        First(checkpoint).
        Error
    
    if err != nil {
        log.WithContext(ctx).Error("checkpoint not found for agency", map[string]interface{}{
            "checkpoint_id": checkpointID,
            "agency_id": reqCtx.AgencyID,
            "error": err,
        })
        return nil, DataIsolationViolation(reqCtx.AgencyID, reqCtx.UserID, checkpointID.String())
    }
    
    return checkpoint, nil
}
```

---

## Data Model Changes (All Tables)

**Every table MUST add:**

```sql
ALTER TABLE flux_checkpoints ADD COLUMN agency_id VARCHAR(64) NOT NULL;
ALTER TABLE flux_checkpoints ADD COLUMN created_by_user VARCHAR(256) NOT NULL;
ALTER TABLE flux_checkpoints ADD INDEX (agency_id);

ALTER TABLE flux_events ADD COLUMN agency_id VARCHAR(64) NOT NULL;
ALTER TABLE flux_events ADD INDEX (agency_id);

-- For other tables: add_agencies, agencies_analytics, etc.
```

---

## Role-Based Access Control (RBAC)

```
Role        | View Own | Modify Own | View Others | Admin
─────────────────────────────────────────────────────────
admin       | ✅      | ✅        | ❌         | ✅
operator    | ✅      | ✅        | ❌         | ❌
viewer      | ✅      | ❌        | ❌         | ❌
analyzer    | ✅      | ❌        | ❌         | ❌
```

**Implementation:**

```go
// middleware/authz.go
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            ctx := r.Context()
            claims := ctx.Value("jwt_claims").(map[string]interface{})
            userRole := claims["role"].(string)
            
            allowed := false
            for _, role := range allowedRoles {
                if userRole == role {
                    allowed = true
                    break
                }
            }
            
            if !allowed {
                http.Error(w, "Forbidden", http.StatusForbidden)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}

// Usage:
apiRouter.Post("/checkpoints", 
    RequireRole("admin", "operator"),
    handlers.CreateCheckpoint)

apiRouter.Get("/checkpoints/:id",
    RequireRole("admin", "operator", "viewer", "analyzer"),
    handlers.GetCheckpoint)
```

---

## Testing Multi-Tenancy Isolation

**Critical: exhaustive testing before production.**

```go
// tests/isolation_test.go
func TestAgencyDomainIsolation(t *testing.T) {
    // Setup: Create checkpoint for Agency A
    checkpointA := createCheckpoint("national-archives", "checkpoint-a")
    
    // Context: User from Agency B tries to access
    ctxB := contextFor("nasa", "user@nasa.gov")
    
    // Should fail: Agency B cannot access Agency A's checkpoint
    _, err := getCheckpoint(ctxB, checkpointA.ID)
    if err == nil {
        t.Fatal("SECURITY VIOLATION: Agency B accessed Agency A's data!")
    }
    
    if !strings.Contains(err.Error(), "DATA_ISOLATION") {
        t.Fatal("Expected DATA_ISOLATION error, got:", err)
    }
}

func TestAgencyJWTCannotBeForged(t *testing.T) {
    // Attacker tries to create JWT claiming to be NASA
    attackerToken := jwt.New(jwt.SigningMethodHS256)
    attackerToken.Claims = map[string]interface{}{
        "agency": "nasa",
        "iss": "attacker-forged",
    }
    
    // Should be rejected (signature invalid)
    valid := validateJWT(attackerToken, trustedKeys)
    if valid {
        t.Fatal("SECURITY VIOLATION: Forged JWT accepted!")
    }
}

func TestAuditLogCaptures(t *testing.T) {
    // Create checkpoint for Agency A
    ctxA := contextFor("national-archives", "user@archives.gov")
    checkpoint := createCheckpoint(ctxA, "test-checkpoint")
    
    // Verify audit log recorded the access
    auditEntry := queryAuditLog("national-archives", "user@archives.gov", "INSERT", checkpoint.ID)
    
    if auditEntry == nil {
        t.Fatal("Audit log did not record checkpoint creation!")
    }
    
    if auditEntry.Success != true {
        t.Fatal("Audit log shows operation failed but it succeeded")
    }
}

func TestConcurrentAgencyAccess(t *testing.T) {
    // Simulate 10 users from different agencies accessing simultaneously
    var wg sync.WaitGroup
    agencies := []string{"nasa", "national-archives", "library-of-congress", "noaa"}
    
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func(idx int) {
            defer wg.Done()
            agency := agencies[idx % len(agencies)]
            ctx := contextFor(agency, fmt.Sprintf("user%d@%s.gov", idx, agency))
            
            // Each should only see their own data
            checkpoints := listCheckpoints(ctx)
            for _, cp := range checkpoints {
                if cp.AgencyID != agency {
                    t.Errorf("User from %s accessed %s checkpoint!", agency, cp.AgencyID)
                }
            }
        }(i)
    }
    
    wg.Wait()
}
```

---

## Implementation Checklist

- [ ] JWT authentication middleware implemented
- [ ] Agency ID extracted from JWT (not client payload)
- [ ] PostgreSQL RLS policies created and enforced
- [ ] All tables have `agency_id` column + index
- [ ] Audit logging table + triggers created
- [ ] RBAC middleware implemented
- [ ] Multi-tenancy isolation tests written (>95% pass)
- [ ] Security audit performed
- [ ] FedRAMP data segregation requirements verified
- [ ] Documentation updated for operators

---

## FedRAMP Compliance Map

| FedRAMP Requirement | Implementation | Evidence |
|-------------------|-----------------|----------|
| AC-3 (Access Control) | JWT + RBAC | middleware/auth.go |
| AC-4 (Data Segregation)| RLS policies | schema.sql |
| AU-2 (Audit Events) | Audit table + triggers | audit.sql |
| AU-12 (Audit Generation) | All DML logged | schema.sql |
| SC-7 (Boundary Protection) | Agency context isolation | context.go |

---

**See CTO_TECHNICAL_REVIEW.md §2.2 for full context.**

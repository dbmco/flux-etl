-- Flux ETL Checkpoint Resilience Schema
-- Replaces file-based .checkpoint.json with PostgreSQL durability
-- See: CTO_TECHNICAL_REVIEW.md §1.3 & flux-common/ARCHITECTURE.md

CREATE SCHEMA IF NOT EXISTS flux;

-- ============================================================================
-- CHECKPOINT STORAGE (replaces .checkpoint.json files)
-- ============================================================================

CREATE TABLE flux.checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Run identification
  run_id VARCHAR(64) NOT NULL UNIQUE,
  agency_id VARCHAR(64) NOT NULL,
  
  -- Execution context
  provider_name VARCHAR(64) NOT NULL,     -- flux-etl, kilo, mock
  model VARCHAR(128),                      -- AI model used
  
  -- Immutable payload snapshot
  payload JSONB NOT NULL,
  
  -- Event history (append-only)
  events JSONB NOT NULL,                   -- Array of {timestamp, name, data}
  event_count INT DEFAULT 0,               -- Denormalized for query optimization
  
  -- Resume cursor & version
  last_step VARCHAR(128),
  checkpoint_version INT NOT NULL DEFAULT 1,
  checkpoint_hash VARCHAR(64) NOT NULL,    -- SHA256 for integrity verification
  
  -- Audit trail
  created_by_user VARCHAR(256),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Retention policy
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  
  -- Status tracking
  status VARCHAR(32) DEFAULT 'PENDING',    -- PENDING, IN_PROGRESS, COMPLETED, FAILED
  failure_reason TEXT,
  
  -- Enable row-level security for multi-tenancy
  CONSTRAINT fk_agency CHECK (agency_id IS NOT NULL)
);

-- Indexes for common queries
CREATE INDEX idx_checkpoints_agency_created 
  ON flux.checkpoints(agency_id, created_at DESC);
CREATE INDEX idx_checkpoints_run_id 
  ON flux.checkpoints(run_id);
CREATE INDEX idx_checkpoints_status 
  ON flux.checkpoints(status, agency_id);
CREATE INDEX idx_checkpoints_expires 
  ON flux.checkpoints(expires_at);
CREATE INDEX idx_checkpoints_provider 
  ON flux.checkpoints(provider_name, agency_id);

-- JSONB index for fast event search
CREATE INDEX idx_checkpoints_events_gin 
  ON flux.checkpoints USING GIN (events);


-- ============================================================================
-- EVENT LOG (denormalized view for high-speed access)
-- ============================================================================

CREATE TABLE flux.checkpoint_events (
  id BIGSERIAL PRIMARY KEY,
  checkpoint_id UUID NOT NULL REFERENCES flux.checkpoints(id) ON DELETE CASCADE,
  
  -- Event metadata
  event_index INT NOT NULL,                -- Position in sequence (0-based)
  timestamp TIMESTAMPTZ NOT NULL,
  event_name VARCHAR(128) NOT NULL,        -- ingest, transform, export, checkpoint_saved
  
  -- Event data (flexible schema)
  event_data JSONB,
  
  -- Denormalized context (for query efficiency)
  agency_id VARCHAR(64) NOT NULL,
  
  -- Automatic timestamp tracking
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_checkpoint FOREIGN KEY (checkpoint_id)
    REFERENCES flux.checkpoints(id) ON DELETE CASCADE,
  CONSTRAINT order_check CHECK (event_index >= 0)
);

CREATE INDEX idx_checkpoint_events_checkpoint_idx 
  ON flux.checkpoint_events(checkpoint_id, event_index);
CREATE INDEX idx_checkpoint_events_agency_timestamp 
  ON flux.checkpoint_events(agency_id, timestamp DESC);
CREATE INDEX idx_checkpoint_events_name 
  ON flux.checkpoint_events(event_name, timestamp DESC);


-- ============================================================================
-- CHECKPOINT INTEGRITY VERIFICATION
-- ============================================================================

CREATE TABLE flux.checkpoint_hashes (
  id BIGSERIAL PRIMARY KEY,
  checkpoint_id UUID NOT NULL UNIQUE REFERENCES flux.checkpoints(id) ON DELETE CASCADE,
  
  -- Integrity verification
  computed_hash VARCHAR(64) NOT NULL,      -- SHA256 computed at save
  verified_hash VARCHAR(64) NOT NULL,      -- SHA256 computed at load
  
  -- Verification result
  integrity_valid BOOLEAN NOT NULL,
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Corruption detection
  hash_mismatch_detected BOOLEAN DEFAULT FALSE,
  mismatch_detected_at TIMESTAMPTZ,
  
  INDEX (checkpoint_id),
  INDEX (integrity_valid, last_verified_at)
);


-- ============================================================================
-- AUDIT LOG (all checkpoint operations for compliance)
-- ============================================================================

CREATE TABLE flux.audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- WHO (always required for FedRAMP/FISMA)
  user_id VARCHAR(256) NOT NULL,
  agency_id VARCHAR(64) NOT NULL,
  role VARCHAR(64),
  
  -- WHAT
  action VARCHAR(64) NOT NULL,              -- CREATE, RESUME, COMPLETE, DELETE
  resource_type VARCHAR(64) NOT NULL,       -- checkpoint
  resource_id UUID,
  
  -- CONTEXT
  trace_id UUID,
  request_id UUID,
  
  -- ENVIRONMENT
  ip_address INET,
  user_agent TEXT,
  
  -- RESULT
  success BOOLEAN NOT NULL,
  error_code VARCHAR(64),
  error_message TEXT,
  
  -- PAYLOAD SNAPSHOT (for forensics)
  before_state JSONB,
  after_state JSONB,
  
  INDEX (timestamp),
  INDEX (agency_id, timestamp),
  INDEX (user_id, timestamp),
  INDEX (action, timestamp),
  INDEX (success, timestamp)
);


-- ============================================================================
-- MATERIALIZED VIEW: Checkpoint Summary (for dashboards)
-- ============================================================================

CREATE MATERIALIZED VIEW flux.checkpoint_summary AS
SELECT
  c.id,
  c.run_id,
  c.agency_id,
  c.provider_name,
  c.model,
  c.status,
  c.event_count,
  c.checkpoint_version,
  c.created_at,
  c.updated_at,
  c.expires_at,
  EXTRACT(EPOCH FROM (NOW() - c.created_at)) as duration_seconds,
  (EXTRACT(EPOCH FROM (c.expires_at - NOW())) > 0) as is_valid,
  COUNT(DISTINCT ce.event_name) as unique_events
FROM flux.checkpoints c
LEFT JOIN flux.checkpoint_events ce ON ce.checkpoint_id = c.id
GROUP BY c.id, c.run_id, c.agency_id, c.provider_name, c.model, 
         c.status, c.event_count, c.checkpoint_version, 
         c.created_at, c.updated_at, c.expires_at;

CREATE UNIQUE INDEX idx_checkpoint_summary_id ON flux.checkpoint_summary(id);


-- ============================================================================
-- FUNCTIONS: Checkpoint Operations
-- ============================================================================

CREATE OR REPLACE FUNCTION flux.save_checkpoint(
  p_run_id VARCHAR,
  p_agency_id VARCHAR,
  p_provider_name VARCHAR,
  p_model VARCHAR,
  p_payload JSONB,
  p_events JSONB,
  p_last_step VARCHAR,
  p_checkpoint_hash VARCHAR,
  p_user_id VARCHAR
)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_checkpoint_id UUID;
  v_event_count INT;
BEGIN
  v_event_count := jsonb_array_length(p_events);
  
  INSERT INTO flux.checkpoints (
    run_id, agency_id, provider_name, model, payload, events,
    event_count, last_step, checkpoint_hash, created_by_user, status
  )
  VALUES (
    p_run_id, p_agency_id, p_provider_name, p_model, p_payload, p_events,
    v_event_count, p_last_step, p_checkpoint_hash, p_user_id, 'PENDING'
  )
  ON CONFLICT (run_id) DO UPDATE SET
    payload = p_payload,
    events = p_events,
    event_count = v_event_count,
    last_step = p_last_step,
    checkpoint_hash = p_checkpoint_hash,
    updated_at = NOW()
  RETURNING id INTO v_checkpoint_id;
  
  -- Log audit entry
  INSERT INTO flux.audit_log (
    user_id, agency_id, action, resource_type, resource_id,
    success, timestamp
  )
  VALUES (p_user_id, p_agency_id, 'CREATE', 'checkpoint', v_checkpoint_id,
    TRUE, NOW());
  
  RETURN v_checkpoint_id;
END;
$$;


CREATE OR REPLACE FUNCTION flux.load_checkpoint(
  p_run_id VARCHAR,
  p_agency_id VARCHAR
)
RETURNS TABLE (
  id UUID,
  payload JSONB,
  events JSONB,
  last_step VARCHAR,
  checkpoint_hash VARCHAR,
  is_valid BOOLEAN
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.payload,
    c.events,
    c.last_step,
    c.checkpoint_hash,
    ch.integrity_valid
  FROM flux.checkpoints c
  LEFT JOIN flux.checkpoint_hashes ch ON ch.checkpoint_id = c.id
  WHERE c.run_id = p_run_id
    AND c.agency_id = p_agency_id
    AND c.expires_at > NOW()
  LIMIT 1;
END;
$$;


-- ============================================================================
-- FUNCTION: Validate Checkpoint Integrity
-- ============================================================================

CREATE OR REPLACE FUNCTION flux.validate_checkpoint_integrity(
  p_checkpoint_id UUID,
  p_computed_hash VARCHAR
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_stored_hash VARCHAR;
  v_is_valid BOOLEAN;
BEGIN
  SELECT checkpoint_hash INTO v_stored_hash
  FROM flux.checkpoints
  WHERE id = p_checkpoint_id;
  
  v_is_valid := (v_stored_hash = p_computed_hash);
  
  INSERT INTO flux.checkpoint_hashes (
    checkpoint_id, computed_hash, verified_hash, integrity_valid,
    last_verified_at, hash_mismatch_detected
  )
  VALUES (
    p_checkpoint_id, v_stored_hash, p_computed_hash, v_is_valid,
    NOW(), NOT v_is_valid
  )
  ON CONFLICT (checkpoint_id) DO UPDATE SET
    verified_hash = p_computed_hash,
    integrity_valid = v_is_valid,
    last_verified_at = NOW(),
    hash_mismatch_detected = NOT v_is_valid,
    mismatch_detected_at = CASE WHEN NOT v_is_valid THEN NOW() ELSE NULL END;
  
  RETURN v_is_valid;
END;
$$;


-- ============================================================================
-- TRIGGER: Auto-update checkpoint updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION flux.checkpoint_update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER checkpoint_timestamp_trigger
BEFORE UPDATE ON flux.checkpoints
FOR EACH ROW
EXECUTE FUNCTION flux.checkpoint_update_timestamp();


-- ============================================================================
-- RETENTION POLICY: Cleanup expired checkpoints
-- ============================================================================

CREATE OR REPLACE FUNCTION flux.cleanup_expired_checkpoints()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM flux.checkpoints
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  INSERT INTO flux.audit_log (
    user_id, agency_id, action, resource_type,
    success, timestamp
  )
  VALUES ('system', 'system', 'CLEANUP', 'checkpoints',
    TRUE, NOW());
  
  RETURN v_deleted_count;
END;
$$;

-- Schedule cleanup to run daily
-- NOTE: PostgreSQL doesn't have native cron, use pg_cron extension
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup_expired_checkpoints', '0 2 * * *',
--   'SELECT flux.cleanup_expired_checkpoints()');


-- ============================================================================
-- ENABLE ROW-LEVEL SECURITY (Multi-tenancy)
-- ============================================================================

ALTER TABLE flux.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE flux.checkpoint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE flux.audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own agency's checkpoints
CREATE POLICY checkpoint_isolation ON flux.checkpoints
  USING (agency_id = current_setting('flux.current_agency_id'));

CREATE POLICY checkpoint_events_isolation ON flux.checkpoint_events
  USING (agency_id = current_setting('flux.current_agency_id'));

CREATE POLICY audit_log_isolation ON flux.audit_log
  USING (agency_id = current_setting('flux.current_agency_id'));


-- ============================================================================
-- INDEXES FOR PERFORMANCE (Additional)
-- ============================================================================

-- Fast lookup by status and agency
CREATE INDEX idx_checkpoints_status_agency_created
  ON flux.checkpoints(status, agency_id, created_at DESC);

-- Fast event queries by event type
CREATE INDEX idx_checkpoint_events_event_name_agency
  ON flux.checkpoint_events(event_name, agency_id, timestamp DESC);


-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA flux TO flux_app_role;
GRANT SELECT ON ALL TABLES IN SCHEMA flux TO flux_app_role;
GRANT INSERT, UPDATE, DELETE ON flux.checkpoints TO flux_app_role;
GRANT INSERT ON flux.checkpoint_events TO flux_app_role;
GRANT INSERT ON flux.audit_log TO flux_app_role;

-- Allow functions to be called
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA flux TO flux_app_role;

-- PostgreSQL Schema for eCFR Analytics
-- Purpose: Store processed analytics data for API consumption

-- ============================================================================
-- DIMENSION TABLES
-- ============================================================================

-- Agency dimension
CREATE TABLE IF NOT EXISTS agencies (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(500) NOT NULL,
    short_name VARCHAR(100),
    parent_slug VARCHAR(255),
    total_cfr_references INTEGER DEFAULT 0,
    child_count INTEGER DEFAULT 0,
    checksum VARCHAR(64) NOT NULL,
    last_updated TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (parent_slug) REFERENCES agencies(slug) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agencies_slug ON agencies(slug);
CREATE INDEX IF NOT EXISTS idx_agencies_parent ON agencies(parent_slug);

-- ============================================================================
-- FACT TABLES
-- ============================================================================

-- Corrections fact table
CREATE TABLE IF NOT EXISTS corrections (
    id SERIAL PRIMARY KEY,
    ecfr_id INTEGER UNIQUE NOT NULL,
    cfr_reference VARCHAR(255) NOT NULL,
    title INTEGER NOT NULL,
    chapter VARCHAR(50),
    part VARCHAR(50),
    section VARCHAR(50),
    corrective_action TEXT,
    error_occurred DATE,
    error_corrected DATE,
    lag_days INTEGER,
    fr_citation VARCHAR(100),
    year INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    last_modified TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_title ON corrections(title);
CREATE INDEX IF NOT EXISTS idx_corrections_year ON corrections(year);
CREATE INDEX IF NOT EXISTS idx_corrections_ecfr_id ON corrections(ecfr_id);
CREATE INDEX IF NOT EXISTS idx_corrections_dates ON corrections(error_occurred, error_corrected);

-- ============================================================================
-- ANALYTICS TABLES
-- ============================================================================

-- Agency metrics (pre-computed for fast API responses)
CREATE TABLE IF NOT EXISTS agency_metrics (
    id SERIAL PRIMARY KEY,
    agency_slug VARCHAR(255) NOT NULL,
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_corrections INTEGER DEFAULT 0,
    years_with_corrections INTEGER DEFAULT 0,
    first_correction_year INTEGER,
    last_correction_year INTEGER,
    avg_correction_lag_days DECIMAL(10,2),
    rvi DECIMAL(10,2) DEFAULT 0,  -- Regulatory Volatility Index
    word_count_estimate INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (agency_slug) REFERENCES agencies(slug) ON DELETE CASCADE,
    UNIQUE(agency_slug, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_agency_metrics_slug ON agency_metrics(agency_slug);
CREATE INDEX IF NOT EXISTS idx_agency_metrics_rvi ON agency_metrics(rvi DESC);

-- Time series data for charting
CREATE TABLE IF NOT EXISTS correction_time_series (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    correction_count INTEGER DEFAULT 0,
    avg_lag_days DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(year, month)
);

CREATE INDEX IF NOT EXISTS idx_time_series_date ON correction_time_series(year, month);

-- CFR title statistics
CREATE TABLE IF NOT EXISTS cfr_title_stats (
    id SERIAL PRIMARY KEY,
    title INTEGER UNIQUE NOT NULL,
    correction_count INTEGER DEFAULT 0,
    years_active INTEGER DEFAULT 0,
    first_year INTEGER,
    last_year INTEGER,
    avg_lag_days DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cfr_title_stats_title ON cfr_title_stats(title);

-- ============================================================================
-- METADATA TABLES
-- ============================================================================

-- ETL run log
CREATE TABLE IF NOT EXISTS etl_log (
    id SERIAL PRIMARY KEY,
    run_timestamp TIMESTAMP DEFAULT NOW(),
    source_db VARCHAR(255) NOT NULL,
    records_processed INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    duration_seconds INTEGER
);

-- Data checksums for integrity verification
CREATE TABLE IF NOT EXISTS data_checksums (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_count INTEGER NOT NULL,
    aggregate_checksum VARCHAR(64) NOT NULL,
    checked_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- VIEWS FOR API
-- ============================================================================

-- Top agencies by correction count
CREATE OR REPLACE VIEW v_top_agencies_by_corrections AS
SELECT 
    a.slug,
    a.name,
    a.short_name,
    am.total_corrections,
    am.rvi,
    a.total_cfr_references
FROM agencies a
INNER JOIN agency_metrics am ON a.slug = am.agency_slug
WHERE am.total_corrections > 0
ORDER BY am.total_corrections DESC
LIMIT 50;

-- Top agencies by RVI
CREATE OR REPLACE VIEW v_top_agencies_by_rvi AS
SELECT 
    a.slug,
    a.name,
    a.short_name,
    am.total_corrections,
    am.rvi,
    a.total_cfr_references
FROM agencies a
INNER JOIN agency_metrics am ON a.slug = am.agency_slug
WHERE am.rvi > 0
ORDER BY am.rvi DESC
LIMIT 50;

-- Yearly correction trends
CREATE OR REPLACE VIEW v_yearly_trends AS
SELECT 
    year,
    SUM(correction_count) as total_corrections,
    AVG(avg_lag_days) as avg_lag_days
FROM correction_time_series
GROUP BY year
ORDER BY year;

-- Recent corrections (last 100)
CREATE OR REPLACE VIEW v_recent_corrections AS
SELECT 
    ecfr_id,
    cfr_reference,
    title,
    corrective_action,
    error_occurred,
    error_corrected,
    lag_days,
    year
FROM corrections
ORDER BY error_corrected DESC NULLS LAST, year DESC
LIMIT 100;

-- Agency hierarchy (parent-child relationships)
CREATE OR REPLACE VIEW v_agency_hierarchy AS
SELECT 
    parent.slug as parent_slug,
    parent.name as parent_name,
    child.slug as child_slug,
    child.name as child_name,
    child.total_cfr_references as child_cfr_refs
FROM agencies parent
INNER JOIN agencies child ON child.parent_slug = parent.slug
ORDER BY parent.name, child.name;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate aggregate checksum for a table
CREATE OR REPLACE FUNCTION calculate_table_checksum(table_name TEXT)
RETURNS VARCHAR AS $$
DECLARE
    checksum_value VARCHAR;
BEGIN
    EXECUTE format('
        SELECT MD5(STRING_AGG(checksum, '''' ORDER BY id))
        FROM %I
    ', table_name) INTO checksum_value;
    
    RETURN checksum_value;
END;
$$ LANGUAGE plpgsql;

-- Function to get agency detail with metrics
CREATE OR REPLACE FUNCTION get_agency_detail(agency_slug_param VARCHAR)
RETURNS TABLE (
    slug VARCHAR,
    name VARCHAR,
    short_name VARCHAR,
    parent_slug VARCHAR,
    total_cfr_references INTEGER,
    child_count INTEGER,
    total_corrections INTEGER,
    rvi DECIMAL,
    avg_lag_days DECIMAL,
    first_correction_year INTEGER,
    last_correction_year INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.slug,
        a.name,
        a.short_name,
        a.parent_slug,
        a.total_cfr_references,
        a.child_count,
        am.total_corrections,
        am.rvi,
        am.avg_correction_lag_days,
        am.first_correction_year,
        am.last_correction_year
    FROM agencies a
    LEFT JOIN agency_metrics am ON a.slug = am.agency_slug
    WHERE a.slug = agency_slug_param;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA VALIDATION
-- ============================================================================

-- Trigger to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agencies_update_timestamp ON agencies;
CREATE TRIGGER agencies_update_timestamp
    BEFORE UPDATE ON agencies
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated();

DROP TRIGGER IF EXISTS corrections_update_timestamp ON corrections;
CREATE TRIGGER corrections_update_timestamp
    BEFORE UPDATE ON corrections
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated();

-- DuckDB Schema for eCFR Data Analytics
-- Purpose: Store raw eCFR data and compute analytics for PostgreSQL export

-- ============================================================================
-- RAW DATA TABLES
-- ============================================================================

-- Raw agencies data (JSON storage)
CREATE TABLE IF NOT EXISTS agencies_raw (
    id INTEGER PRIMARY KEY,
    slug VARCHAR UNIQUE NOT NULL,
    name VARCHAR NOT NULL,
    short_name VARCHAR,
    parent_slug VARCHAR,  -- NULL for top-level agencies
    data JSON NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Raw corrections data (JSON storage)
CREATE TABLE IF NOT EXISTS corrections_raw (
    id INTEGER PRIMARY KEY,
    ecfr_id INTEGER UNIQUE NOT NULL,
    data JSON NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingestion metadata
CREATE SEQUENCE IF NOT EXISTS ingestion_log_seq START 1;
CREATE TABLE IF NOT EXISTS ingestion_log (
    id INTEGER PRIMARY KEY DEFAULT nextval('ingestion_log_seq'),
    source_file VARCHAR NOT NULL,
    record_count INTEGER NOT NULL,
    file_checksum VARCHAR(64) NOT NULL,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR DEFAULT 'success'
);

-- ============================================================================
-- PARSED DATA TABLES (Flattened for analytics)
-- ============================================================================

-- Agencies with computed fields
CREATE TABLE IF NOT EXISTS agencies_parsed (
    id INTEGER PRIMARY KEY,
    slug VARCHAR UNIQUE NOT NULL,
    name VARCHAR NOT NULL,
    short_name VARCHAR,
    parent_slug VARCHAR,
    cfr_reference_count INTEGER DEFAULT 0,
    child_count INTEGER DEFAULT 0,
    checksum VARCHAR(64) NOT NULL,
    parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CFR references (many-to-many with agencies)
CREATE SEQUENCE IF NOT EXISTS cfr_references_seq START 1;
CREATE TABLE IF NOT EXISTS cfr_references (
    id INTEGER PRIMARY KEY DEFAULT nextval('cfr_references_seq'),
    agency_slug VARCHAR NOT NULL,
    title INTEGER NOT NULL,
    chapter VARCHAR,
    subtitle VARCHAR,
    part VARCHAR,
    FOREIGN KEY (agency_slug) REFERENCES agencies_parsed(slug)
);

-- Corrections with parsed fields
CREATE TABLE IF NOT EXISTS corrections_parsed (
    id INTEGER PRIMARY KEY,
    ecfr_id INTEGER UNIQUE NOT NULL,
    cfr_reference VARCHAR NOT NULL,
    title INTEGER NOT NULL,
    chapter VARCHAR,
    part VARCHAR,
    section VARCHAR,
    corrective_action TEXT,
    error_occurred DATE,
    error_corrected DATE,
    lag_days INTEGER,  -- Computed: error_corrected - error_occurred
    fr_citation VARCHAR,
    year INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ANALYTICS VIEWS
-- ============================================================================

-- Agency metrics summary
CREATE OR REPLACE VIEW agency_metrics AS
WITH agency_titles AS (
    SELECT agency_slug, title
    FROM cfr_references
    GROUP BY agency_slug, title
),
agency_corrections AS (
    SELECT 
        at.agency_slug,
        COUNT(DISTINCT c.ecfr_id) as total_corrections,
        COUNT(DISTINCT c.year) as years_with_corrections,
        MIN(c.year) as first_correction_year,
        MAX(c.year) as last_correction_year,
        AVG(c.lag_days) as avg_correction_lag_days
    FROM agency_titles at
    INNER JOIN corrections_parsed c ON c.title = at.title
    GROUP BY at.agency_slug
)
SELECT 
    a.slug,
    a.name,
    a.short_name,
    a.parent_slug,
    a.cfr_reference_count,
    a.child_count,
    COALESCE(ac.total_corrections, 0) as total_corrections,
    COALESCE(ac.years_with_corrections, 0) as years_with_corrections,
    ac.first_correction_year,
    ac.last_correction_year,
    ac.avg_correction_lag_days,
    -- Regulatory Volatility Index (RVI)
    CASE 
        WHEN a.cfr_reference_count > 0 AND ac.total_corrections > 0
        THEN ROUND((ac.total_corrections::DECIMAL / a.cfr_reference_count) * 100, 2)
        ELSE 0 
    END as rvi
FROM agencies_parsed a
LEFT JOIN agency_corrections ac ON ac.agency_slug = a.slug;

-- Correction trends by year
CREATE OR REPLACE VIEW correction_trends_yearly AS
SELECT 
    year,
    COUNT(*) as correction_count,
    COUNT(DISTINCT title) as unique_titles,
    AVG(lag_days) as avg_lag_days,
    MIN(lag_days) as min_lag_days,
    MAX(lag_days) as max_lag_days
FROM corrections_parsed
WHERE lag_days IS NOT NULL
GROUP BY year
ORDER BY year;

-- Correction trends by title (CFR title)
CREATE OR REPLACE VIEW correction_trends_by_title AS
SELECT 
    title,
    COUNT(*) as correction_count,
    COUNT(DISTINCT year) as years_active,
    MIN(year) as first_year,
    MAX(year) as last_year,
    AVG(lag_days) as avg_lag_days
FROM corrections_parsed
GROUP BY title
ORDER BY correction_count DESC;

-- Monthly correction activity (for time series charts)
CREATE OR REPLACE VIEW correction_time_series AS
SELECT 
    year,
    MONTH(error_corrected) as month,
    COUNT(*) as correction_count,
    AVG(lag_days) as avg_lag_days
FROM corrections_parsed
WHERE error_corrected IS NOT NULL
GROUP BY year, MONTH(error_corrected)
ORDER BY year, month;

-- Top agencies by correction frequency
CREATE OR REPLACE VIEW top_agencies_by_corrections AS
SELECT 
    slug,
    name,
    short_name,
    total_corrections as correction_count,
    cfr_reference_count,
    rvi
FROM agency_metrics
WHERE total_corrections > 0
ORDER BY total_corrections DESC
LIMIT 50;

-- ============================================================================
-- EXPORT TABLES (Ready for PostgreSQL)
-- ============================================================================

-- Export: Agency dimension
CREATE OR REPLACE VIEW export_agencies AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY slug) as id,
    slug,
    name,
    short_name,
    parent_slug,
    cfr_reference_count as total_cfr_references,
    checksum,
    parsed_at as last_updated
FROM agencies_parsed;

-- Export: Corrections fact table
CREATE OR REPLACE VIEW export_corrections AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY ecfr_id) as id,
    ecfr_id,
    cfr_reference,
    title,
    year,
    error_occurred,
    error_corrected,
    lag_days,
    corrective_action,
    checksum,
    parsed_at as last_modified
FROM corrections_parsed;

-- Export: Agency metrics
CREATE OR REPLACE VIEW export_agency_metrics AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY slug) as id,
    slug as agency_slug,
    CURRENT_DATE as metric_date,
    0 as word_count,  -- TODO: Implement word counting
    total_corrections as correction_count,
    rvi
FROM agency_metrics;

-- Export: Time series
CREATE OR REPLACE VIEW export_correction_time_series AS
SELECT 
    year,
    month,
    correction_count,
    avg_lag_days
FROM correction_time_series;

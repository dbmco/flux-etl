## Sterilization Pipeline (Deterministic Linkage Without Exposing PII)

This document describes the sterilization pipeline to be applied between staging and harmonization in DuckDB. It ensures that downstream consumers only see data that has been identity‑treated, had sensitive attributes suppressed, and passed structural risk controls.

---

### Overview

Sterilization consists of three major phases:

1. **Identity Treatment**
2. **Attribute Suppression**
3. **Structural Risk Controls**

All transformations must be expressed as **deterministic SQL in DuckDB** to support auditability, reproducibility, and version control.

---

## Identity Treatment

**Goal:** Remove or transform direct identifiers so that raw PII is never included in the harmonized schema, while enabling deterministic cross‑table or cross‑agency linkage if permitted.

**Direct Identifiers Include:**
- Names (first, last, full)
- Exact dates of birth
- Contact information (email, phone)
- Agency‑specific identifiers (e.g., employee ID, SSN)

### Deterministic Hashing

Replace direct identifiers with salted, deterministic hashes.

```sql
CREATE OR REPLACE TABLE stage_ids_h AS
SELECT
  sha256(concat('<salt>', raw_name)) AS person_hash,
  sha256(concat('<salt>', raw_ssn))  AS ssn_hash,
  NULL AS raw_name,
  NULL AS raw_ssn,
  other_fields
FROM stage_raw;
```

**Notes:**
- `<salt>` should be stored securely and versioned outside the database.
- Hash functions must be deterministic and consistent across runs.

---

## Attribute Suppression

**Goal:** Reduce identifiable detail in quasi‑identifiers and sensitive fields so they cannot be used for indirect re‑identification.

**Quasi‑Identifiers Include:**
- Precise age
- Timestamp granularity (seconds)
- Free‑text fields

### Techniques

1. **Generalization**
   - Group ages into bands (e.g., 30–39)
   - Convert timestamps to week or month buckets

2. **Text Redaction or Exclusion**
   - Remove free‑text fields entirely from harmonized schema
   - Optionally apply automated redaction models before loading

### Example SQL

```sql
CREATE OR REPLACE TABLE stage_attrs_h AS
SELECT
  person_hash,
  CASE
    WHEN age IS NOT NULL THEN floor(age / 10) * 10 || '_to_' || (floor(age / 10) * 10 + 9)
    ELSE NULL
  END AS age_band,
  date_trunc('week', encounter_ts) AS encounter_week,
  NULL AS clinician_notes,
  other_safe_fields
FROM stage_ids_h;
```

---

## Structural Risk Controls

**Goal:** Prevent re‑identification through small cohort sizes or unique combinations of quasi‑identifiers.

### Controls

- **Minimum Cell Count Thresholds:** Do not materialize subsets where counts fall below a configured minimum (e.g., k = 5)
- **K‑Anonymity Enforcement:** Validate that groups do not uniquely identify individuals

### Example SQL

```sql
CREATE OR REPLACE TABLE group_counts AS
SELECT age_band, encounter_week, COUNT(*) AS ct
FROM stage_attrs_h
GROUP BY age_band, encounter_week;

CREATE OR REPLACE TABLE safe_data AS
SELECT s.*
FROM stage_attrs_h s
JOIN group_counts g
  ON s.age_band = g.age_band
 AND s.encounter_week = g.encounter_week
WHERE g.ct >= 5;
```

---

## Provenance and Audit

All transformations must support auditability:

- **Provenance Tables:** Store hashes and transformation metadata
- **Version Control:** Keep all DuckDB SQL scripts in a repository with version history
- **Determinism:** Use deterministic expressions to allow reproducibility

---

## Cross‑Agency Deterministic Linkage

### When Linkage Is Allowed

- Use the same salt and hash function across agencies
- Exchange salts securely under a contract or trust framework
- Only hashed tokens appear in harmonized tables

### When Linkage Must Be Restricted

- Use agency‑specific salts so hashed tokens differ per agency
- No linkage without salt reconciliation

### Hybrid Pattern (Selective Linkage)

- Compute both a global hash (for linkage) and an agency hash (for safety)
- Use global hash only in explicitly authorized contexts

---

## Implementation Guidelines

- Ensure all sterilization operations are **SQL functions, views, or table transformations** in DuckDB.
- Maintain strict access controls on salts and raw staging environments.
- Validate structural risk controls with automated checks.
- Document transformation logic and version every change.

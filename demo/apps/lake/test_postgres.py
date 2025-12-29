"""
PostgreSQL Data Integrity Tests

Verifies that data in PostgreSQL matches DuckDB source
and that all checksums are valid.
"""

import os
import duckdb
import psycopg2
from pathlib import Path


def test_record_counts():
    """Test that record counts match between DuckDB and PostgreSQL."""
    print("\n🧪 Testing Record Counts...")
    
    duck_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    duck_conn = duckdb.connect(str(duck_path), read_only=True)
    
    pg_url = os.getenv(
        'DATABASE_URL',
        'postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics'
    )
    pg_conn = psycopg2.connect(pg_url)
    pg_cursor = pg_conn.cursor()
    
    # Test agencies
    duck_agencies = duck_conn.execute("SELECT COUNT(*) FROM agencies_parsed").fetchone()[0]
    pg_cursor.execute("SELECT COUNT(*) FROM agencies")
    pg_agencies = pg_cursor.fetchone()[0]
    
    assert duck_agencies == pg_agencies, f"Agency count mismatch: {duck_agencies} != {pg_agencies}"
    print(f"  ✅ Agencies: {pg_agencies} (matches DuckDB)")
    
    # Test corrections
    duck_corrections = duck_conn.execute("SELECT COUNT(*) FROM corrections_parsed").fetchone()[0]
    pg_cursor.execute("SELECT COUNT(*) FROM corrections")
    pg_corrections = pg_cursor.fetchone()[0]
    
    assert duck_corrections == pg_corrections, f"Correction count mismatch: {duck_corrections} != {pg_corrections}"
    print(f"  ✅ Corrections: {pg_corrections} (matches DuckDB)")
    
    duck_conn.close()
    pg_cursor.close()
    pg_conn.close()


def test_checksum_integrity():
    """Test that checksums are present and valid."""
    print("\n🧪 Testing Checksum Integrity...")
    
    pg_url = os.getenv(
        'DATABASE_URL',
        'postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics'
    )
    pg_conn = psycopg2.connect(pg_url)
    pg_cursor = pg_conn.cursor()
    
    # Check for NULL checksums in agencies
    pg_cursor.execute("SELECT COUNT(*) FROM agencies WHERE checksum IS NULL")
    null_checksums = pg_cursor.fetchone()[0]
    
    assert null_checksums == 0, f"Found {null_checksums} agencies with NULL checksums"
    print(f"  ✅ All agencies have checksums")
    
    # Check for NULL checksums in corrections
    pg_cursor.execute("SELECT COUNT(*) FROM corrections WHERE checksum IS NULL")
    null_checksums = pg_cursor.fetchone()[0]
    
    assert null_checksums == 0, f"Found {null_checksums} corrections with NULL checksums"
    print(f"  ✅ All corrections have checksums")
    
    # Verify checksum format (64 hex characters)
    pg_cursor.execute("""
        SELECT COUNT(*) FROM agencies 
        WHERE checksum !~ '^[a-f0-9]{64}$'
    """)
    invalid_checksums = pg_cursor.fetchone()[0]
    
    assert invalid_checksums == 0, f"Found {invalid_checksums} agencies with invalid checksum format"
    print(f"  ✅ All agency checksums are valid SHA-256 hashes")
    
    pg_cursor.close()
    pg_conn.close()


def test_data_relationships():
    """Test that foreign key relationships are valid."""
    print("\n🧪 Testing Data Relationships...")
    
    pg_url = os.getenv(
        'DATABASE_URL',
        'postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics'
    )
    pg_conn = psycopg2.connect(pg_url)
    pg_cursor = pg_conn.cursor()
    
    # Test agency_metrics foreign keys
    pg_cursor.execute("""
        SELECT COUNT(*) FROM agency_metrics am
        LEFT JOIN agencies a ON am.agency_slug = a.slug
        WHERE a.slug IS NULL
    """)
    orphan_metrics = pg_cursor.fetchone()[0]
    
    assert orphan_metrics == 0, f"Found {orphan_metrics} agency_metrics with invalid agency_slug"
    print(f"  ✅ All agency_metrics link to valid agencies")
    
    # Test parent-child relationships
    pg_cursor.execute("""
        SELECT COUNT(*) FROM agencies child
        WHERE child.parent_slug IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM agencies parent 
              WHERE parent.slug = child.parent_slug
          )
    """)
    invalid_parents = pg_cursor.fetchone()[0]
    
    assert invalid_parents == 0, f"Found {invalid_parents} agencies with invalid parent_slug"
    print(f"  ✅ All parent-child relationships are valid")
    
    pg_cursor.close()
    pg_conn.close()


def test_analytics_accuracy():
    """Test that analytics calculations are accurate."""
    print("\n🧪 Testing Analytics Accuracy...")
    
    pg_url = os.getenv(
        'DATABASE_URL',
        'postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics'
    )
    pg_conn = psycopg2.connect(pg_url)
    pg_cursor = pg_conn.cursor()
    
    # Test RVI calculation for a sample agency
    pg_cursor.execute("""
        SELECT 
            a.slug,
            a.total_cfr_references,
            am.total_corrections,
            am.rvi
        FROM agencies a
        INNER JOIN agency_metrics am ON a.slug = am.agency_slug
        WHERE am.total_corrections > 0 AND a.total_cfr_references > 0
        LIMIT 5
    """)
    
    for slug, cfr_refs, corrections, rvi in pg_cursor.fetchall():
        expected_rvi = round((corrections / cfr_refs) * 100, 2)
        rvi_float = float(rvi) if rvi is not None else 0
        assert abs(rvi_float - expected_rvi) < 0.01, \
            f"RVI mismatch for {slug}: {rvi_float} != {expected_rvi}"
    
    print(f"  ✅ RVI calculations are accurate")
    
    # Test time series aggregation
    pg_cursor.execute("""
        SELECT year, SUM(correction_count) as total
        FROM correction_time_series
        WHERE year = 2024
        GROUP BY year
    """)
    
    result = pg_cursor.fetchone()
    if result:
        year, ts_total = result
        
        pg_cursor.execute("""
            SELECT COUNT(*) FROM corrections WHERE year = 2024
        """)
        actual_total = pg_cursor.fetchone()[0]
        
        assert ts_total == actual_total, \
            f"Time series total mismatch for 2024: {ts_total} != {actual_total}"
        
        print(f"  ✅ Time series aggregations are accurate")
    
    pg_cursor.close()
    pg_conn.close()


def test_views():
    """Test that views return data correctly."""
    print("\n🧪 Testing Views...")
    
    pg_url = os.getenv(
        'DATABASE_URL',
        'postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics'
    )
    pg_conn = psycopg2.connect(pg_url)
    pg_cursor = pg_conn.cursor()
    
    # Test v_top_agencies_by_corrections
    pg_cursor.execute("SELECT COUNT(*) FROM v_top_agencies_by_corrections")
    count = pg_cursor.fetchone()[0]
    
    assert count > 0, "v_top_agencies_by_corrections returned no rows"
    print(f"  ✅ v_top_agencies_by_corrections: {count} rows")
    
    # Test v_top_agencies_by_rvi
    pg_cursor.execute("SELECT COUNT(*) FROM v_top_agencies_by_rvi")
    count = pg_cursor.fetchone()[0]
    
    assert count > 0, "v_top_agencies_by_rvi returned no rows"
    print(f"  ✅ v_top_agencies_by_rvi: {count} rows")
    
    # Test v_yearly_trends
    pg_cursor.execute("SELECT COUNT(*) FROM v_yearly_trends")
    count = pg_cursor.fetchone()[0]
    
    assert count > 0, "v_yearly_trends returned no rows"
    print(f"  ✅ v_yearly_trends: {count} rows")
    
    # Test v_recent_corrections
    pg_cursor.execute("SELECT COUNT(*) FROM v_recent_corrections")
    count = pg_cursor.fetchone()[0]
    
    assert count > 0, "v_recent_corrections returned no rows"
    print(f"  ✅ v_recent_corrections: {count} rows")
    
    pg_cursor.close()
    pg_conn.close()


def run_all_tests():
    """Run all PostgreSQL tests."""
    print("=" * 60)
    print("PostgreSQL Data Integrity Tests")
    print("=" * 60)
    
    tests = [
        ("Record Counts", test_record_counts),
        ("Checksum Integrity", test_checksum_integrity),
        ("Data Relationships", test_data_relationships),
        ("Analytics Accuracy", test_analytics_accuracy),
        ("Views", test_views),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"\n❌ {test_name} FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"\n❌ {test_name} ERROR: {e}")
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"Test Results: {passed} passed, {failed} failed")
    print("=" * 60)
    
    if failed == 0:
        print("✅ All tests passed! PostgreSQL data is valid.")
    else:
        print(f"❌ {failed} test(s) failed. Please review errors above.")
    
    return failed == 0


if __name__ == '__main__':
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)

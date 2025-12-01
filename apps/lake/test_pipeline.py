"""
End-to-end pipeline test

Validates:
- Data ingestion integrity
- Checksum verification
- Analytics calculations
- Export data quality
"""

import json
from pathlib import Path
import duckdb


def test_data_integrity():
    """Test that all data was ingested correctly."""
    print("\n🧪 Testing Data Integrity...")
    
    db_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    conn = duckdb.connect(str(db_path), read_only=True)
    
    # Test 1: Record counts match source files
    with open('json/usds/ecfr/agencies.json', 'r') as f:
        agencies_json = json.load(f)
    
    with open('json/usds/ecfr/corrections.json', 'r') as f:
        corrections_json = json.load(f)
    
    expected_agencies = len(agencies_json['agencies'])
    expected_sub_agencies = sum(len(a.get('children', [])) for a in agencies_json['agencies'])
    expected_total = expected_agencies + expected_sub_agencies
    expected_corrections = len(corrections_json['ecfr_corrections'])
    
    actual_agencies = conn.execute("SELECT COUNT(*) FROM agencies_parsed").fetchone()[0]
    actual_corrections = conn.execute("SELECT COUNT(*) FROM corrections_parsed").fetchone()[0]
    
    assert actual_agencies == expected_total, f"Agency count mismatch: {actual_agencies} != {expected_total}"
    assert actual_corrections == expected_corrections, f"Correction count mismatch: {actual_corrections} != {expected_corrections}"
    
    print(f"  ✅ Agency count: {actual_agencies} (expected {expected_total})")
    print(f"  ✅ Correction count: {actual_corrections} (expected {expected_corrections})")
    
    # Test 2: No NULL checksums
    null_checksums = conn.execute("""
        SELECT COUNT(*) FROM agencies_parsed WHERE checksum IS NULL
    """).fetchone()[0]
    
    assert null_checksums == 0, f"Found {null_checksums} agencies with NULL checksums"
    print(f"  ✅ All agencies have checksums")
    
    null_checksums = conn.execute("""
        SELECT COUNT(*) FROM corrections_parsed WHERE checksum IS NULL
    """).fetchone()[0]
    
    assert null_checksums == 0, f"Found {null_checksums} corrections with NULL checksums"
    print(f"  ✅ All corrections have checksums")
    
    # Test 3: No duplicate records
    dup_agencies = conn.execute("""
        SELECT COUNT(*) FROM (
            SELECT slug, COUNT(*) as cnt 
            FROM agencies_parsed 
            GROUP BY slug 
            HAVING COUNT(*) > 1
        )
    """).fetchone()[0]
    
    assert dup_agencies == 0, f"Found {dup_agencies} duplicate agency slugs"
    print(f"  ✅ No duplicate agencies")
    
    dup_corrections = conn.execute("""
        SELECT COUNT(*) FROM (
            SELECT ecfr_id, COUNT(*) as cnt 
            FROM corrections_parsed 
            GROUP BY ecfr_id 
            HAVING COUNT(*) > 1
        )
    """).fetchone()[0]
    
    assert dup_corrections == 0, f"Found {dup_corrections} duplicate corrections"
    print(f"  ✅ No duplicate corrections")
    
    conn.close()


def test_checksum_verification():
    """Test that checksums are valid and consistent."""
    print("\n🧪 Testing Checksum Verification...")
    
    from checksums import calculate_agency_checksum, calculate_correction_checksum
    
    db_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    conn = duckdb.connect(str(db_path), read_only=True)
    
    # Test a sample of agencies
    agencies = conn.execute("""
        SELECT data, checksum FROM agencies_raw LIMIT 10
    """).fetchall()
    
    for data_json, stored_checksum in agencies:
        data = json.loads(data_json)
        calculated_checksum = calculate_agency_checksum(data)
        assert calculated_checksum == stored_checksum, \
            f"Checksum mismatch for agency {data.get('slug')}"
    
    print(f"  ✅ Verified {len(agencies)} agency checksums")
    
    # Test a sample of corrections
    corrections = conn.execute("""
        SELECT data, checksum FROM corrections_raw LIMIT 10
    """).fetchall()
    
    for data_json, stored_checksum in corrections:
        data = json.loads(data_json)
        calculated_checksum = calculate_correction_checksum(data)
        assert calculated_checksum == stored_checksum, \
            f"Checksum mismatch for correction {data.get('id')}"
    
    print(f"  ✅ Verified {len(corrections)} correction checksums")
    
    conn.close()


def test_analytics_calculations():
    """Test that analytics are calculated correctly."""
    print("\n🧪 Testing Analytics Calculations...")
    
    db_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    conn = duckdb.connect(str(db_path), read_only=True)
    
    # Test 1: RVI calculation
    # RVI = (total_corrections / cfr_reference_count) * 100
    sample = conn.execute("""
        SELECT 
            slug,
            cfr_reference_count,
            total_corrections,
            rvi
        FROM agency_metrics
        WHERE total_corrections > 0 AND cfr_reference_count > 0
        LIMIT 5
    """).fetchall()
    
    for slug, cfr_refs, corrections, rvi in sample:
        expected_rvi = round((corrections / cfr_refs) * 100, 2)
        assert abs(rvi - expected_rvi) < 0.01, \
            f"RVI mismatch for {slug}: {rvi} != {expected_rvi}"
    
    print(f"  ✅ RVI calculations verified for {len(sample)} agencies")
    
    # Test 2: Lag days calculation
    sample_lags = conn.execute("""
        SELECT 
            ecfr_id,
            error_occurred,
            error_corrected,
            lag_days
        FROM corrections_parsed
        WHERE error_occurred IS NOT NULL 
          AND error_corrected IS NOT NULL
          AND lag_days IS NOT NULL
        LIMIT 5
    """).fetchall()
    
    from datetime import datetime, date
    
    for ecfr_id, occurred, corrected, lag_days in sample_lags:
        # Handle both string and date objects
        if isinstance(occurred, str):
            occurred_dt = datetime.strptime(occurred, '%Y-%m-%d')
        else:
            occurred_dt = datetime.combine(occurred, datetime.min.time())
        
        if isinstance(corrected, str):
            corrected_dt = datetime.strptime(corrected, '%Y-%m-%d')
        else:
            corrected_dt = datetime.combine(corrected, datetime.min.time())
        
        expected_lag = (corrected_dt - occurred_dt).days
        assert lag_days == expected_lag, \
            f"Lag days mismatch for correction {ecfr_id}: {lag_days} != {expected_lag}"
    
    print(f"  ✅ Lag day calculations verified for {len(sample_lags)} corrections")
    
    # Test 3: Yearly trends aggregation
    yearly_count = conn.execute("""
        SELECT year, correction_count
        FROM correction_trends_yearly
        WHERE year = 2024
    """).fetchone()
    
    if yearly_count:
        year, count = yearly_count
        actual_count = conn.execute("""
            SELECT COUNT(*) FROM corrections_parsed WHERE year = 2024
        """).fetchone()[0]
        
        assert count == actual_count, \
            f"Yearly trend mismatch for 2024: {count} != {actual_count}"
        
        print(f"  ✅ Yearly trend aggregation verified (2024: {count} corrections)")
    
    conn.close()


def test_export_data():
    """Test that exported data is valid and complete."""
    print("\n🧪 Testing Export Data...")
    
    export_dir = Path(__file__).parent / 'exports'
    
    # Test 1: All export files exist
    required_files = [
        'agencies.json',
        'corrections.json',
        'agency_metrics.json',
        'time_series.json',
        'summary_report.json'
    ]
    
    for filename in required_files:
        filepath = export_dir / filename
        assert filepath.exists(), f"Missing export file: {filename}"
    
    print(f"  ✅ All {len(required_files)} export files exist")
    
    # Test 2: Export files are valid JSON
    for filename in required_files:
        filepath = export_dir / filename
        with open(filepath, 'r') as f:
            data = json.load(f)
            assert data is not None, f"Invalid JSON in {filename}"
    
    print(f"  ✅ All export files contain valid JSON")
    
    # Test 3: Export record counts match database
    db_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    conn = duckdb.connect(str(db_path), read_only=True)
    
    with open(export_dir / 'agencies.json', 'r') as f:
        agencies_export = json.load(f)
    
    db_agencies = conn.execute("SELECT COUNT(*) FROM export_agencies").fetchone()[0]
    assert len(agencies_export) == db_agencies, \
        f"Agency export count mismatch: {len(agencies_export)} != {db_agencies}"
    
    print(f"  ✅ Agency export count matches database: {len(agencies_export)}")
    
    with open(export_dir / 'corrections.json', 'r') as f:
        corrections_export = json.load(f)
    
    db_corrections = conn.execute("SELECT COUNT(*) FROM export_corrections").fetchone()[0]
    assert len(corrections_export) == db_corrections, \
        f"Correction export count mismatch: {len(corrections_export)} != {db_corrections}"
    
    print(f"  ✅ Correction export count matches database: {len(corrections_export)}")
    
    conn.close()


def test_data_relationships():
    """Test that data relationships are correct."""
    print("\n🧪 Testing Data Relationships...")
    
    db_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    conn = duckdb.connect(str(db_path), read_only=True)
    
    # Test 1: All CFR references link to valid agencies
    orphan_refs = conn.execute("""
        SELECT COUNT(*) 
        FROM cfr_references cfr
        LEFT JOIN agencies_parsed a ON cfr.agency_slug = a.slug
        WHERE a.slug IS NULL
    """).fetchone()[0]
    
    assert orphan_refs == 0, f"Found {orphan_refs} CFR references with invalid agency links"
    print(f"  ✅ All CFR references link to valid agencies")
    
    # Test 2: Parent-child relationships are valid
    invalid_parents = conn.execute("""
        SELECT COUNT(*)
        FROM agencies_parsed child
        WHERE child.parent_slug IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM agencies_parsed parent 
              WHERE parent.slug = child.parent_slug
          )
    """).fetchone()[0]
    
    assert invalid_parents == 0, f"Found {invalid_parents} agencies with invalid parent links"
    print(f"  ✅ All parent-child relationships are valid")
    
    # Test 3: Child counts are accurate
    parent_check = conn.execute("""
        SELECT 
            parent.slug,
            parent.child_count,
            COUNT(child.slug) as actual_children
        FROM agencies_parsed parent
        LEFT JOIN agencies_parsed child ON child.parent_slug = parent.slug
        WHERE parent.child_count > 0
        GROUP BY parent.slug, parent.child_count
        HAVING parent.child_count != COUNT(child.slug)
    """).fetchall()
    
    assert len(parent_check) == 0, f"Found {len(parent_check)} agencies with incorrect child counts"
    print(f"  ✅ All child counts are accurate")
    
    conn.close()


def run_all_tests():
    """Run all pipeline tests."""
    print("=" * 60)
    print("eCFR Data Pipeline - End-to-End Tests")
    print("=" * 60)
    
    tests = [
        ("Data Integrity", test_data_integrity),
        ("Checksum Verification", test_checksum_verification),
        ("Analytics Calculations", test_analytics_calculations),
        ("Export Data", test_export_data),
        ("Data Relationships", test_data_relationships),
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
        print("✅ All tests passed! Pipeline is working correctly.")
    else:
        print(f"❌ {failed} test(s) failed. Please review errors above.")
    
    return failed == 0


if __name__ == '__main__':
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)

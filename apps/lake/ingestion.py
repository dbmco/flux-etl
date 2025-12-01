"""
eCFR Data Ingestion Pipeline

Loads agencies and corrections data from JSON files into DuckDB for analytics.
Handles checksums, data validation, and transformation.
"""

import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple
import duckdb

from checksums import add_checksums_to_agencies, add_checksums_to_corrections


class ECFRIngestion:
    """Manages ingestion of eCFR data into DuckDB."""
    
    def __init__(self, db_path: str = 'ecfr_analytics.duckdb'):
        """
        Initialize ingestion pipeline.
        
        Args:
            db_path: Path to DuckDB database file
        """
        self.db_path = db_path
        self.conn = None
        
    def connect(self):
        """Establish DuckDB connection."""
        self.conn = duckdb.connect(self.db_path)
        print(f"✅ Connected to DuckDB: {self.db_path}")
        
    def close(self):
        """Close DuckDB connection."""
        if self.conn:
            self.conn.close()
            print("✅ Closed DuckDB connection")
    
    def initialize_schema(self):
        """Create tables and views from schema file."""
        schema_path = Path(__file__).parent / 'duckdb_schema.sql'
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        # Execute schema (DuckDB supports multiple statements)
        self.conn.execute(schema_sql)
        print("✅ Initialized DuckDB schema")
    
    def calculate_file_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum of entire file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def load_agencies(self, json_path: Path) -> Tuple[int, int]:
        """
        Load agencies data into DuckDB.
        
        Args:
            json_path: Path to agencies.json file
            
        Returns:
            Tuple of (parent_agencies_count, sub_agencies_count)
        """
        print(f"\n📥 Loading agencies from {json_path}")
        
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        # Add checksums if not present
        if 'checksum' not in data['agencies'][0]:
            print("  Calculating checksums...")
            data = add_checksums_to_agencies(data)
        
        parent_count = 0
        sub_count = 0
        
        # Insert parent agencies
        for idx, agency in enumerate(data['agencies'], start=1):
            self.conn.execute("""
                INSERT INTO agencies_raw (id, slug, name, short_name, parent_slug, data, checksum)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                idx,
                agency['slug'],
                agency['name'],
                agency.get('short_name'),
                None,  # Parent agencies have no parent
                json.dumps(agency),
                agency['checksum']
            ])
            
            # Parse into structured table
            self.conn.execute("""
                INSERT INTO agencies_parsed (id, slug, name, short_name, parent_slug, 
                                            cfr_reference_count, child_count, checksum)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                idx,
                agency['slug'],
                agency['name'],
                agency.get('short_name'),
                None,
                len(agency.get('cfr_references', [])),
                len(agency.get('children', [])),
                agency['checksum']
            ])
            
            # Insert CFR references
            for cfr_ref in agency.get('cfr_references', []):
                self.conn.execute("""
                    INSERT INTO cfr_references (agency_slug, title, chapter, subtitle, part)
                    VALUES (?, ?, ?, ?, ?)
                """, [
                    agency['slug'],
                    cfr_ref.get('title'),
                    cfr_ref.get('chapter'),
                    cfr_ref.get('subtitle'),
                    cfr_ref.get('part')
                ])
            
            parent_count += 1
            
            # Insert sub-agencies (children)
            for child_idx, child in enumerate(agency.get('children', []), start=1):
                child_id = idx * 1000 + child_idx  # Unique ID for children
                
                self.conn.execute("""
                    INSERT INTO agencies_raw (id, slug, name, short_name, parent_slug, data, checksum)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, [
                    child_id,
                    child['slug'],
                    child['name'],
                    child.get('short_name'),
                    agency['slug'],  # Parent slug
                    json.dumps(child),
                    child['checksum']
                ])
                
                self.conn.execute("""
                    INSERT INTO agencies_parsed (id, slug, name, short_name, parent_slug, 
                                                cfr_reference_count, child_count, checksum)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    child_id,
                    child['slug'],
                    child['name'],
                    child.get('short_name'),
                    agency['slug'],
                    len(child.get('cfr_references', [])),
                    0,  # Children don't have children
                    child['checksum']
                ])
                
                # Insert CFR references for child
                for cfr_ref in child.get('cfr_references', []):
                    self.conn.execute("""
                        INSERT INTO cfr_references (agency_slug, title, chapter, subtitle, part)
                        VALUES (?, ?, ?, ?, ?)
                    """, [
                        child['slug'],
                        cfr_ref.get('title'),
                        cfr_ref.get('chapter'),
                        cfr_ref.get('subtitle'),
                        cfr_ref.get('part')
                    ])
                
                sub_count += 1
        
        # Log ingestion
        file_checksum = self.calculate_file_checksum(json_path)
        self.conn.execute("""
            INSERT INTO ingestion_log (source_file, record_count, file_checksum)
            VALUES (?, ?, ?)
        """, [str(json_path), parent_count + sub_count, file_checksum])
        
        print(f"  ✅ Loaded {parent_count} parent agencies")
        print(f"  ✅ Loaded {sub_count} sub-agencies")
        
        return parent_count, sub_count
    
    def load_corrections(self, json_path: Path) -> int:
        """
        Load corrections data into DuckDB.
        
        Args:
            json_path: Path to corrections.json file
            
        Returns:
            Number of corrections loaded
        """
        print(f"\n📥 Loading corrections from {json_path}")
        
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        # Add checksums if not present
        if 'checksum' not in data['ecfr_corrections'][0]:
            print("  Calculating checksums...")
            data = add_checksums_to_corrections(data)
        
        count = 0
        
        for idx, correction in enumerate(data['ecfr_corrections'], start=1):
            # Insert raw data
            self.conn.execute("""
                INSERT INTO corrections_raw (id, ecfr_id, data, checksum)
                VALUES (?, ?, ?, ?)
            """, [
                idx,
                correction['id'],
                json.dumps(correction),
                correction['checksum']
            ])
            
            # Parse CFR reference
            cfr_ref = correction.get('cfr_references', [{}])[0].get('cfr_reference', '')
            hierarchy = correction.get('cfr_references', [{}])[0].get('hierarchy', {})
            
            # Calculate lag days
            lag_days = None
            if correction.get('error_occurred') and correction.get('error_corrected'):
                try:
                    occurred = datetime.strptime(correction['error_occurred'], '%Y-%m-%d')
                    corrected = datetime.strptime(correction['error_corrected'], '%Y-%m-%d')
                    lag_days = (corrected - occurred).days
                except:
                    pass
            
            # Insert parsed data
            self.conn.execute("""
                INSERT INTO corrections_parsed (
                    id, ecfr_id, cfr_reference, title, chapter, part, section,
                    corrective_action, error_occurred, error_corrected, lag_days,
                    fr_citation, year, checksum
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                idx,
                correction['id'],
                cfr_ref,
                correction['title'],
                hierarchy.get('chapter'),
                hierarchy.get('part'),
                hierarchy.get('section'),
                correction.get('corrective_action'),
                correction.get('error_occurred'),
                correction.get('error_corrected'),
                lag_days,
                correction.get('fr_citation'),
                correction['year'],
                correction['checksum']
            ])
            
            count += 1
        
        # Log ingestion
        file_checksum = self.calculate_file_checksum(json_path)
        self.conn.execute("""
            INSERT INTO ingestion_log (source_file, record_count, file_checksum)
            VALUES (?, ?, ?)
        """, [str(json_path), count, file_checksum])
        
        print(f"  ✅ Loaded {count} corrections")
        
        return count
    
    def verify_data(self):
        """Run verification queries to ensure data integrity."""
        print("\n🔍 Verifying data integrity...")
        
        # Check record counts
        agencies_count = self.conn.execute("SELECT COUNT(*) FROM agencies_parsed").fetchone()[0]
        corrections_count = self.conn.execute("SELECT COUNT(*) FROM corrections_parsed").fetchone()[0]
        cfr_refs_count = self.conn.execute("SELECT COUNT(*) FROM cfr_references").fetchone()[0]
        
        print(f"  Agencies: {agencies_count}")
        print(f"  Corrections: {corrections_count}")
        print(f"  CFR References: {cfr_refs_count}")
        
        # Check for duplicates
        dup_agencies = self.conn.execute("""
            SELECT slug, COUNT(*) as cnt 
            FROM agencies_parsed 
            GROUP BY slug 
            HAVING COUNT(*) > 1
        """).fetchall()
        
        if dup_agencies:
            print(f"  ⚠️  Found {len(dup_agencies)} duplicate agency slugs")
        else:
            print("  ✅ No duplicate agencies")
        
        # Check checksums
        null_checksums = self.conn.execute("""
            SELECT COUNT(*) FROM agencies_parsed WHERE checksum IS NULL
        """).fetchone()[0]
        
        if null_checksums > 0:
            print(f"  ⚠️  Found {null_checksums} agencies with NULL checksums")
        else:
            print("  ✅ All agencies have checksums")
        
        # Sample analytics
        print("\n📊 Sample Analytics:")
        
        top_agencies = self.conn.execute("""
            SELECT name, total_corrections, rvi
            FROM agency_metrics
            WHERE total_corrections > 0
            ORDER BY total_corrections DESC
            LIMIT 5
        """).fetchall()
        
        print("  Top 5 agencies by correction count:")
        for name, corrections, rvi in top_agencies:
            print(f"    {name}: {corrections} corrections (RVI: {rvi})")
        
        yearly_trends = self.conn.execute("""
            SELECT year, correction_count, ROUND(avg_lag_days, 1) as avg_lag
            FROM correction_trends_yearly
            ORDER BY year DESC
            LIMIT 5
        """).fetchall()
        
        print("\n  Recent correction trends:")
        for year, count, avg_lag in yearly_trends:
            print(f"    {year}: {count} corrections (avg lag: {avg_lag} days)")


def main():
    """Run the complete ingestion pipeline."""
    print("=" * 60)
    print("eCFR Data Ingestion Pipeline")
    print("=" * 60)
    
    # Paths
    base_path = Path(__file__).parent
    agencies_json = base_path / 'json/usds/ecfr/agencies.json'
    corrections_json = base_path / 'json/usds/ecfr/corrections.json'
    db_path = base_path / 'ecfr_analytics.duckdb'
    
    # Remove existing database for clean start
    if db_path.exists():
        db_path.unlink()
        print(f"🗑️  Removed existing database: {db_path}")
    
    # Initialize pipeline
    pipeline = ECFRIngestion(str(db_path))
    
    try:
        pipeline.connect()
        pipeline.initialize_schema()
        
        # Load data
        pipeline.load_agencies(agencies_json)
        pipeline.load_corrections(corrections_json)
        
        # Verify
        pipeline.verify_data()
        
        print("\n" + "=" * 60)
        print("✅ Ingestion complete!")
        print(f"📁 Database: {db_path}")
        print("=" * 60)
        
    finally:
        pipeline.close()


if __name__ == '__main__':
    main()

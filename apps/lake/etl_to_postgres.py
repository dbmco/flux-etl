"""
ETL Pipeline: DuckDB → PostgreSQL

Transfers processed analytics data from DuckDB to PostgreSQL
for API consumption.
"""

import os
import time
from pathlib import Path
from typing import Optional
import duckdb
import psycopg2
from psycopg2.extras import execute_batch


class DuckDBToPostgresETL:
    """ETL pipeline from DuckDB analytics to PostgreSQL."""
    
    def __init__(
        self,
        duckdb_path: str = 'ecfr_analytics.duckdb',
        postgres_url: Optional[str] = None
    ):
        """
        Initialize ETL pipeline.
        
        Args:
            duckdb_path: Path to DuckDB database
            postgres_url: PostgreSQL connection URL (or use DATABASE_URL env var)
        """
        self.duckdb_path = duckdb_path
        self.postgres_url = postgres_url or os.getenv(
            'DATABASE_URL',
            'postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics'
        )
        self.duck_conn = None
        self.pg_conn = None
        self.start_time = None
    
    def connect(self):
        """Establish connections to both databases."""
        print(f"📡 Connecting to DuckDB: {self.duckdb_path}")
        self.duck_conn = duckdb.connect(self.duckdb_path, read_only=True)
        
        print(f"📡 Connecting to PostgreSQL...")
        self.pg_conn = psycopg2.connect(self.postgres_url)
        self.pg_conn.autocommit = False
        
        print("✅ Connected to both databases")
    
    def close(self):
        """Close database connections."""
        if self.duck_conn:
            self.duck_conn.close()
        if self.pg_conn:
            self.pg_conn.close()
        print("✅ Closed database connections")
    
    def initialize_postgres_schema(self):
        """Create PostgreSQL schema if it doesn't exist."""
        print("\n🏗️  Initializing PostgreSQL schema...")
        
        schema_path = Path(__file__).parent / 'postgres_schema.sql'
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        cursor = self.pg_conn.cursor()
        cursor.execute(schema_sql)
        self.pg_conn.commit()
        cursor.close()
        
        print("✅ PostgreSQL schema initialized")
    
    def clear_postgres_data(self):
        """Clear existing data from PostgreSQL tables."""
        print("\n🗑️  Clearing existing PostgreSQL data...")
        
        cursor = self.pg_conn.cursor()
        
        # Disable foreign key checks temporarily
        cursor.execute("SET session_replication_role = 'replica';")
        
        tables = [
            'correction_time_series',
            'cfr_title_stats',
            'agency_metrics',
            'corrections',
            'agencies',
            'etl_log',
            'data_checksums'
        ]
        
        for table in tables:
            cursor.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;")
            print(f"  Cleared {table}")
        
        # Re-enable foreign key checks
        cursor.execute("SET session_replication_role = 'origin';")
        
        self.pg_conn.commit()
        cursor.close()
        
        print("✅ PostgreSQL data cleared")
    
    def transfer_agencies(self):
        """Transfer agencies from DuckDB to PostgreSQL."""
        print("\n📤 Transferring agencies...")
        
        # Fetch from DuckDB
        agencies = self.duck_conn.execute("""
            SELECT 
                slug,
                name,
                short_name,
                parent_slug,
                cfr_reference_count as total_cfr_references,
                child_count,
                checksum
            FROM agencies_parsed
            ORDER BY id
        """).fetchall()
        
        cursor = self.pg_conn.cursor()
        
        # Insert into PostgreSQL
        insert_sql = """
            INSERT INTO agencies (
                slug, name, short_name, parent_slug, 
                total_cfr_references, child_count, checksum
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        
        execute_batch(cursor, insert_sql, agencies, page_size=100)
        self.pg_conn.commit()
        cursor.close()
        
        print(f"  ✅ Transferred {len(agencies)} agencies")
        return len(agencies)
    
    def transfer_corrections(self):
        """Transfer corrections from DuckDB to PostgreSQL."""
        print("\n📤 Transferring corrections...")
        
        # Fetch from DuckDB
        corrections = self.duck_conn.execute("""
            SELECT 
                ecfr_id,
                cfr_reference,
                title,
                chapter,
                part,
                section,
                corrective_action,
                error_occurred,
                error_corrected,
                lag_days,
                fr_citation,
                year,
                checksum
            FROM corrections_parsed
            ORDER BY id
        """).fetchall()
        
        cursor = self.pg_conn.cursor()
        
        # Insert into PostgreSQL
        insert_sql = """
            INSERT INTO corrections (
                ecfr_id, cfr_reference, title, chapter, part, section,
                corrective_action, error_occurred, error_corrected, lag_days,
                fr_citation, year, checksum
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        execute_batch(cursor, insert_sql, corrections, page_size=100)
        self.pg_conn.commit()
        cursor.close()
        
        print(f"  ✅ Transferred {len(corrections)} corrections")
        return len(corrections)
    
    def transfer_agency_metrics(self):
        """Transfer agency metrics from DuckDB to PostgreSQL."""
        print("\n📤 Transferring agency metrics...")
        
        # Calculate word counts using tiered estimation
        word_counts_query = self.duck_conn.execute("""
            SELECT 
                agency_slug,
                SUM(CASE 
                    WHEN part IS NOT NULL THEN 2000
                    WHEN chapter IS NOT NULL THEN 10000
                    ELSE 50000
                END) as word_count
            FROM cfr_references
            GROUP BY agency_slug
        """).fetchall()
        
        word_counts_dict = {slug: count for slug, count in word_counts_query}
        
        # Fetch metrics from DuckDB
        metrics = self.duck_conn.execute("""
            SELECT 
                slug,
                total_corrections,
                years_with_corrections,
                first_correction_year,
                last_correction_year,
                avg_correction_lag_days,
                rvi
            FROM agency_metrics
            ORDER BY slug
        """).fetchall()
        
        # Add word counts to metrics
        metrics_with_words = []
        for metric in metrics:
            slug = metric[0]
            word_count = word_counts_dict.get(slug, 0)
            metrics_with_words.append(metric + (word_count,))
        
        cursor = self.pg_conn.cursor()
        
        # Insert into PostgreSQL
        insert_sql = """
            INSERT INTO agency_metrics (
                agency_slug, total_corrections, years_with_corrections,
                first_correction_year, last_correction_year,
                avg_correction_lag_days, rvi, word_count_estimate
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        execute_batch(cursor, insert_sql, metrics_with_words, page_size=100)
        self.pg_conn.commit()
        cursor.close()
        
        print(f"  ✅ Transferred {len(metrics_with_words)} agency metrics")
        return len(metrics_with_words)
    
    def transfer_time_series(self):
        """Transfer time series data from DuckDB to PostgreSQL."""
        print("\n📤 Transferring time series data...")
        
        # Fetch from DuckDB
        time_series = self.duck_conn.execute("""
            SELECT 
                year,
                month,
                correction_count,
                avg_lag_days
            FROM correction_time_series
            ORDER BY year, month
        """).fetchall()
        
        cursor = self.pg_conn.cursor()
        
        # Insert into PostgreSQL
        insert_sql = """
            INSERT INTO correction_time_series (
                year, month, correction_count, avg_lag_days
            ) VALUES (%s, %s, %s, %s)
        """
        
        execute_batch(cursor, insert_sql, time_series, page_size=100)
        self.pg_conn.commit()
        cursor.close()
        
        print(f"  ✅ Transferred {len(time_series)} time series records")
        return len(time_series)
    
    def transfer_cfr_title_stats(self):
        """Transfer CFR title statistics from DuckDB to PostgreSQL."""
        print("\n📤 Transferring CFR title statistics...")
        
        # Fetch from DuckDB
        title_stats = self.duck_conn.execute("""
            SELECT 
                title,
                correction_count,
                years_active,
                first_year,
                last_year,
                avg_lag_days
            FROM correction_trends_by_title
            ORDER BY title
        """).fetchall()
        
        cursor = self.pg_conn.cursor()
        
        # Insert into PostgreSQL
        insert_sql = """
            INSERT INTO cfr_title_stats (
                title, correction_count, years_active,
                first_year, last_year, avg_lag_days
            ) VALUES (%s, %s, %s, %s, %s, %s)
        """
        
        execute_batch(cursor, insert_sql, title_stats, page_size=100)
        self.pg_conn.commit()
        cursor.close()
        
        print(f"  ✅ Transferred {len(title_stats)} CFR title stats")
        return len(title_stats)
    
    def log_etl_run(self, records_processed: int, status: str = 'success', error_msg: Optional[str] = None):
        """Log ETL run to PostgreSQL."""
        duration = int(time.time() - self.start_time) if self.start_time else 0
        
        cursor = self.pg_conn.cursor()
        cursor.execute("""
            INSERT INTO etl_log (
                source_db, records_processed, status, error_message, duration_seconds
            ) VALUES (%s, %s, %s, %s, %s)
        """, [self.duckdb_path, records_processed, status, error_msg, duration])
        self.pg_conn.commit()
        cursor.close()
    
    def verify_data(self):
        """Verify data integrity in PostgreSQL."""
        print("\n🔍 Verifying PostgreSQL data...")
        
        cursor = self.pg_conn.cursor()
        
        # Check record counts
        cursor.execute("SELECT COUNT(*) FROM agencies")
        agencies_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM corrections")
        corrections_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM agency_metrics")
        metrics_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM correction_time_series")
        ts_count = cursor.fetchone()[0]
        
        print(f"  Agencies: {agencies_count}")
        print(f"  Corrections: {corrections_count}")
        print(f"  Agency Metrics: {metrics_count}")
        print(f"  Time Series: {ts_count}")
        
        # Check for NULL checksums
        cursor.execute("SELECT COUNT(*) FROM agencies WHERE checksum IS NULL")
        null_checksums = cursor.fetchone()[0]
        
        if null_checksums > 0:
            print(f"  ⚠️  Found {null_checksums} agencies with NULL checksums")
        else:
            print("  ✅ All agencies have checksums")
        
        # Sample top agencies
        cursor.execute("""
            SELECT a.name, am.total_corrections, am.rvi
            FROM agencies a
            INNER JOIN agency_metrics am ON a.slug = am.agency_slug
            WHERE am.total_corrections > 0
            ORDER BY am.total_corrections DESC
            LIMIT 5
        """)
        
        print("\n  Top 5 agencies by corrections:")
        for name, corrections, rvi in cursor.fetchall():
            print(f"    {name}: {corrections} corrections (RVI: {rvi})")
        
        cursor.close()
    
    def run(self):
        """Execute the complete ETL pipeline."""
        print("=" * 60)
        print("DuckDB → PostgreSQL ETL Pipeline")
        print("=" * 60)
        
        self.start_time = time.time()
        total_records = 0
        
        try:
            self.connect()
            self.initialize_postgres_schema()
            self.clear_postgres_data()
            
            # Transfer data
            total_records += self.transfer_agencies()
            total_records += self.transfer_corrections()
            total_records += self.transfer_agency_metrics()
            total_records += self.transfer_time_series()
            total_records += self.transfer_cfr_title_stats()
            
            # Verify
            self.verify_data()
            
            # Log success
            self.log_etl_run(total_records, 'success')
            
            duration = int(time.time() - self.start_time)
            
            print("\n" + "=" * 60)
            print(f"✅ ETL Complete!")
            print(f"   Records Processed: {total_records}")
            print(f"   Duration: {duration} seconds")
            print("=" * 60)
            
        except Exception as e:
            print(f"\n❌ ETL Failed: {e}")
            try:
                self.pg_conn.rollback()
                self.log_etl_run(total_records, 'failed', str(e))
            except:
                pass
            raise
        
        finally:
            self.close()


def main():
    """Run the ETL pipeline."""
    db_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    
    if not db_path.exists():
        print(f"❌ DuckDB database not found: {db_path}")
        print("Run ingestion.py first to create the database.")
        return
    
    etl = DuckDBToPostgresETL(str(db_path))
    etl.run()


if __name__ == '__main__':
    main()

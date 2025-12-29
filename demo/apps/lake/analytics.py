"""
eCFR Analytics Module

Computes metrics and analytics from DuckDB data:
- Word counts per agency (estimated from CFR references)
- Correction frequencies and trends
- Regulatory Volatility Index (RVI)
- Time series data for charting
"""

import duckdb
from pathlib import Path
from typing import Dict, List, Any
import json


class ECFRAnalytics:
    """Analytics engine for eCFR data."""
    
    def __init__(self, db_path: str = 'ecfr_analytics.duckdb'):
        """
        Initialize analytics engine.
        
        Args:
            db_path: Path to DuckDB database
        """
        self.db_path = db_path
        self.conn = None
    
    def connect(self):
        """Connect to DuckDB."""
        self.conn = duckdb.connect(self.db_path, read_only=True)
        print(f"✅ Connected to DuckDB: {self.db_path}")
    
    def close(self):
        """Close connection."""
        if self.conn:
            self.conn.close()
    
    def get_agency_metrics(self, limit: int = None) -> List[Dict[str, Any]]:
        """
        Get agency metrics including RVI.
        
        Args:
            limit: Optional limit on number of results
            
        Returns:
            List of agency metric dictionaries
        """
        query = """
            SELECT 
                slug,
                name,
                short_name,
                parent_slug,
                cfr_reference_count,
                child_count,
                total_corrections,
                years_with_corrections,
                first_correction_year,
                last_correction_year,
                ROUND(avg_correction_lag_days, 1) as avg_correction_lag_days,
                rvi
            FROM agency_metrics
            ORDER BY total_corrections DESC
        """
        
        if limit:
            query += f" LIMIT {limit}"
        
        results = self.conn.execute(query).fetchall()
        
        columns = [
            'slug', 'name', 'short_name', 'parent_slug', 
            'cfr_reference_count', 'child_count', 'total_corrections',
            'years_with_corrections', 'first_correction_year', 
            'last_correction_year', 'avg_correction_lag_days', 'rvi'
        ]
        
        return [dict(zip(columns, row)) for row in results]
    
    def get_correction_trends_yearly(self) -> List[Dict[str, Any]]:
        """Get yearly correction trends."""
        results = self.conn.execute("""
            SELECT 
                year,
                correction_count,
                unique_titles,
                ROUND(avg_lag_days, 1) as avg_lag_days,
                min_lag_days,
                max_lag_days
            FROM correction_trends_yearly
            ORDER BY year
        """).fetchall()
        
        columns = ['year', 'correction_count', 'unique_titles', 
                   'avg_lag_days', 'min_lag_days', 'max_lag_days']
        
        return [dict(zip(columns, row)) for row in results]
    
    def get_correction_trends_by_title(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get correction trends by CFR title."""
        results = self.conn.execute(f"""
            SELECT 
                title,
                correction_count,
                years_active,
                first_year,
                last_year,
                ROUND(avg_lag_days, 1) as avg_lag_days
            FROM correction_trends_by_title
            ORDER BY correction_count DESC
            LIMIT {limit}
        """).fetchall()
        
        columns = ['title', 'correction_count', 'years_active', 
                   'first_year', 'last_year', 'avg_lag_days']
        
        return [dict(zip(columns, row)) for row in results]
    
    def get_time_series_data(self) -> List[Dict[str, Any]]:
        """Get monthly time series data for charting."""
        results = self.conn.execute("""
            SELECT 
                year,
                month,
                correction_count,
                ROUND(avg_lag_days, 1) as avg_lag_days
            FROM correction_time_series
            ORDER BY year, month
        """).fetchall()
        
        columns = ['year', 'month', 'correction_count', 'avg_lag_days']
        
        return [dict(zip(columns, row)) for row in results]
    
    def get_top_agencies_by_rvi(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get agencies with highest Regulatory Volatility Index.
        
        High RVI indicates frequent changes relative to regulatory footprint.
        """
        results = self.conn.execute(f"""
            SELECT 
                slug,
                name,
                short_name,
                total_corrections,
                cfr_reference_count,
                rvi
            FROM agency_metrics
            WHERE total_corrections > 0
            ORDER BY rvi DESC
            LIMIT {limit}
        """).fetchall()
        
        columns = ['slug', 'name', 'short_name', 'total_corrections', 
                   'cfr_reference_count', 'rvi']
        
        return [dict(zip(columns, row)) for row in results]
    
    def get_agency_detail(self, slug: str) -> Dict[str, Any]:
        """Get detailed metrics for a specific agency."""
        result = self.conn.execute("""
            SELECT 
                slug,
                name,
                short_name,
                parent_slug,
                cfr_reference_count,
                child_count,
                total_corrections,
                years_with_corrections,
                first_correction_year,
                last_correction_year,
                ROUND(avg_correction_lag_days, 1) as avg_correction_lag_days,
                rvi
            FROM agency_metrics
            WHERE slug = ?
        """, [slug]).fetchone()
        
        if not result:
            return None
        
        columns = [
            'slug', 'name', 'short_name', 'parent_slug', 
            'cfr_reference_count', 'child_count', 'total_corrections',
            'years_with_corrections', 'first_correction_year', 
            'last_correction_year', 'avg_correction_lag_days', 'rvi'
        ]
        
        return dict(zip(columns, result))
    
    def get_corrections_for_agency(self, slug: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get corrections related to an agency's CFR titles."""
        results = self.conn.execute(f"""
            WITH agency_titles AS (
                SELECT DISTINCT title 
                FROM cfr_references 
                WHERE agency_slug = ?
            )
            SELECT 
                c.ecfr_id,
                c.cfr_reference,
                c.title,
                c.corrective_action,
                c.error_occurred,
                c.error_corrected,
                c.lag_days,
                c.year
            FROM corrections_parsed c
            INNER JOIN agency_titles at ON c.title = at.title
            ORDER BY c.year DESC, c.error_corrected DESC
            LIMIT {limit}
        """, [slug]).fetchall()
        
        columns = ['ecfr_id', 'cfr_reference', 'title', 'corrective_action',
                   'error_occurred', 'error_corrected', 'lag_days', 'year']
        
        return [dict(zip(columns, row)) for row in results]
    
    def calculate_word_counts(self) -> Dict[str, int]:
        """
        Calculate estimated word counts per agency based on CFR references.
        
        Uses a tiered estimation model based on CFR hierarchy:
        - Title-level reference: ~50,000 words (entire title)
        - Chapter-level reference: ~10,000 words
        - Part-level reference: ~2,000 words
        - Section-level reference: ~500 words
        
        This provides more accurate estimates than a flat rate.
        """
        results = self.conn.execute("""
            SELECT 
                agency_slug,
                title,
                chapter,
                part,
                COUNT(*) as ref_count
            FROM cfr_references
            GROUP BY agency_slug, title, chapter, part
        """).fetchall()
        
        word_counts = {}
        
        for slug, title, chapter, part, ref_count in results:
            if slug not in word_counts:
                word_counts[slug] = 0
            
            # Tiered estimation based on specificity
            if part:
                # Part-level: most specific
                word_counts[slug] += ref_count * 2000
            elif chapter:
                # Chapter-level: broader
                word_counts[slug] += ref_count * 10000
            else:
                # Title-level: broadest
                word_counts[slug] += ref_count * 50000
        
        return word_counts
    
    def generate_summary_report(self) -> Dict[str, Any]:
        """Generate a summary report of all analytics."""
        return {
            'overview': {
                'total_agencies': self.conn.execute("SELECT COUNT(*) FROM agencies_parsed").fetchone()[0],
                'total_corrections': self.conn.execute("SELECT COUNT(*) FROM corrections_parsed").fetchone()[0],
                'total_cfr_references': self.conn.execute("SELECT COUNT(*) FROM cfr_references").fetchone()[0],
                'year_range': self.conn.execute("""
                    SELECT MIN(year), MAX(year) FROM corrections_parsed
                """).fetchone(),
            },
            'top_agencies_by_corrections': self.get_agency_metrics(limit=10),
            'top_agencies_by_rvi': self.get_top_agencies_by_rvi(limit=10),
            'yearly_trends': self.get_correction_trends_yearly(),
            'top_titles': self.get_correction_trends_by_title(limit=10),
        }
    
    def export_for_postgres(self, output_dir: Path):
        """
        Export analytics data as JSON files for PostgreSQL import.
        
        Args:
            output_dir: Directory to write JSON export files
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"\n📤 Exporting analytics to {output_dir}")
        
        # Export agencies
        agencies = self.conn.execute("SELECT * FROM export_agencies").fetchdf()
        agencies_file = output_dir / 'agencies.json'
        agencies.to_json(agencies_file, orient='records', indent=2)
        print(f"  ✅ Exported {len(agencies)} agencies")
        
        # Export corrections
        corrections = self.conn.execute("SELECT * FROM export_corrections").fetchdf()
        corrections_file = output_dir / 'corrections.json'
        corrections.to_json(corrections_file, orient='records', indent=2)
        print(f"  ✅ Exported {len(corrections)} corrections")
        
        # Export agency metrics
        metrics = self.conn.execute("SELECT * FROM export_agency_metrics").fetchdf()
        metrics_file = output_dir / 'agency_metrics.json'
        metrics.to_json(metrics_file, orient='records', indent=2)
        print(f"  ✅ Exported {len(metrics)} agency metrics")
        
        # Export time series
        time_series = self.conn.execute("SELECT * FROM export_correction_time_series").fetchdf()
        ts_file = output_dir / 'time_series.json'
        time_series.to_json(ts_file, orient='records', indent=2)
        print(f"  ✅ Exported {len(time_series)} time series records")
        
        print(f"\n✅ Export complete: {output_dir}")


def main():
    """Run analytics and generate reports."""
    print("=" * 60)
    print("eCFR Analytics Engine")
    print("=" * 60)
    
    db_path = Path(__file__).parent / 'ecfr_analytics.duckdb'
    
    if not db_path.exists():
        print(f"❌ Database not found: {db_path}")
        print("Run ingestion.py first to create the database.")
        return
    
    analytics = ECFRAnalytics(str(db_path))
    
    try:
        analytics.connect()
        
        # Generate summary report
        print("\n📊 Generating Summary Report...")
        report = analytics.generate_summary_report()
        
        print(f"\n--- Overview ---")
        print(f"Total Agencies: {report['overview']['total_agencies']}")
        print(f"Total Corrections: {report['overview']['total_corrections']}")
        print(f"Total CFR References: {report['overview']['total_cfr_references']}")
        print(f"Year Range: {report['overview']['year_range'][0]} - {report['overview']['year_range'][1]}")
        
        print(f"\n--- Top 10 Agencies by Corrections ---")
        for agency in report['top_agencies_by_corrections']:
            print(f"  {agency['name']}: {agency['total_corrections']} corrections")
        
        print(f"\n--- Top 10 Agencies by RVI (Regulatory Volatility) ---")
        for agency in report['top_agencies_by_rvi']:
            print(f"  {agency['name']}: RVI {agency['rvi']} ({agency['total_corrections']} corrections / {agency['cfr_reference_count']} refs)")
        
        print(f"\n--- Recent Yearly Trends ---")
        for trend in report['yearly_trends'][-5:]:
            print(f"  {trend['year']}: {trend['correction_count']} corrections (avg lag: {trend['avg_lag_days']} days)")
        
        # Export for PostgreSQL
        export_dir = Path(__file__).parent / 'exports'
        analytics.export_for_postgres(export_dir)
        
        # Save full report
        report_file = export_dir / 'summary_report.json'
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        print(f"\n✅ Full report saved: {report_file}")
        
        print("\n" + "=" * 60)
        print("✅ Analytics complete!")
        print("=" * 60)
        
    finally:
        analytics.close()


if __name__ == '__main__':
    main()

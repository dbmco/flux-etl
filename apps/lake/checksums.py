"""
Checksum utilities for eCFR data integrity tracking.

Provides SHA-256 checksums for agencies and corrections to:
- Detect data changes between ingestion runs
- Verify data integrity during ETL
- Track data lineage
"""

import hashlib
import json
from typing import Any, Dict


def calculate_checksum(data: Dict[str, Any]) -> str:
    """
    Calculate SHA-256 checksum for a data record.
    
    Args:
        data: Dictionary containing the record data
        
    Returns:
        Hex string of SHA-256 hash
    """
    # Sort keys for consistent hashing
    json_str = json.dumps(data, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(json_str.encode('utf-8')).hexdigest()


def calculate_agency_checksum(agency: Dict[str, Any]) -> str:
    """
    Calculate checksum for an agency record.
    
    Includes: name, short_name, slug, cfr_references, children
    Excludes: display_name, sortable_name (derived fields), checksum (self-reference)
    """
    # Create a copy without the checksum field to avoid circular dependency
    agency_copy = {k: v for k, v in agency.items() if k != 'checksum'}
    
    checksum_data = {
        'name': agency_copy.get('name'),
        'short_name': agency_copy.get('short_name'),
        'slug': agency_copy.get('slug'),
        'cfr_references': agency_copy.get('cfr_references', []),
        'children': [
            {k: v for k, v in child.items() if k != 'checksum'}
            for child in agency_copy.get('children', [])
        ]
    }
    return calculate_checksum(checksum_data)


def calculate_correction_checksum(correction: Dict[str, Any]) -> str:
    """
    Calculate checksum for a correction record.
    
    Includes: id, cfr_references, corrective_action, dates, fr_citation, title
    Excludes: checksum (self-reference)
    """
    # Create a copy without the checksum field
    correction_copy = {k: v for k, v in correction.items() if k != 'checksum'}
    
    checksum_data = {
        'id': correction_copy.get('id'),
        'cfr_references': correction_copy.get('cfr_references', []),
        'corrective_action': correction_copy.get('corrective_action'),
        'error_corrected': correction_copy.get('error_corrected'),
        'error_occurred': correction_copy.get('error_occurred'),
        'fr_citation': correction_copy.get('fr_citation'),
        'title': correction_copy.get('title'),
        'year': correction_copy.get('year')
    }
    return calculate_checksum(checksum_data)


def add_checksums_to_agencies(agencies_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add checksums to all agencies in the dataset.
    
    Args:
        agencies_data: Full agencies.json structure
        
    Returns:
        Modified data with checksums added
    """
    for agency in agencies_data.get('agencies', []):
        agency['checksum'] = calculate_agency_checksum(agency)
        
        # Add checksums to children
        for child in agency.get('children', []):
            child['checksum'] = calculate_agency_checksum(child)
    
    return agencies_data


def add_checksums_to_corrections(corrections_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add checksums to all corrections in the dataset.
    
    Args:
        corrections_data: Full corrections.json structure
        
    Returns:
        Modified data with checksums added
    """
    for correction in corrections_data.get('ecfr_corrections', []):
        correction['checksum'] = calculate_correction_checksum(correction)
    
    return corrections_data


if __name__ == '__main__':
    # Test checksum calculation
    import sys
    
    print("Loading data files...")
    
    with open('json/usds/ecfr/agencies.json', 'r') as f:
        agencies = json.load(f)
    
    with open('json/usds/ecfr/corrections.json', 'r') as f:
        corrections = json.load(f)
    
    print(f"Calculating checksums for {len(agencies['agencies'])} agencies...")
    agencies = add_checksums_to_agencies(agencies)
    
    print(f"Calculating checksums for {len(corrections['ecfr_corrections'])} corrections...")
    corrections = add_checksums_to_corrections(corrections)
    
    # Show sample checksums
    print("\n--- Sample Checksums ---")
    print(f"First agency: {agencies['agencies'][0]['name']}")
    print(f"  Checksum: {agencies['agencies'][0]['checksum'][:16]}...")
    
    print(f"\nFirst correction (ID {corrections['ecfr_corrections'][0]['id']}):")
    print(f"  Checksum: {corrections['ecfr_corrections'][0]['checksum'][:16]}...")
    
    # Write back with checksums
    print("\nWriting files with checksums...")
    with open('json/usds/ecfr/agencies_with_checksums.json', 'w') as f:
        json.dump(agencies, f, indent=2)
    
    with open('json/usds/ecfr/corrections_with_checksums.json', 'w') as f:
        json.dump(corrections, f, indent=2)
    
    print("✅ Checksums calculated and saved")

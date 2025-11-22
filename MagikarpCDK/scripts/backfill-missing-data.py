#!/usr/bin/env python3
"""
Scan DynamoDB for missing data and backfill with API key rotation

This script:
1. Uses PartiQL to query DynamoDB for records with missing required fields
2. Generates list of all trading days from 2000-01-01 to 2025-11-01
3. Identifies dates that are missing from DynamoDB
4. Backfills missing data using Lambda function
5. Rotates through 5 FRED API keys
6. Implements rate limiting: 100 requests per key, then 10-minute break

Usage:
    python3 scripts/backfill-missing-data.py --environment dev [--dry-run]
"""

import argparse
import boto3
import json
import time
from datetime import datetime, timedelta
from typing import List, Set

# Configuration
REQUIRED_FIELDS = [
    'interest_rate',
    'vix',
    'dxy',
    'treasury_2y',
    'treasury_10y',
    'yield_curve_spread',
    'ice_bofa_bbb'
]

# Optional fields (monthly data - not available every day)
OPTIONAL_FIELDS = ['gdp_growth', 'cpi', 'cpi_yoy']

API_KEY_COUNT = 5
REQUESTS_PER_KEY = 100
BREAK_DURATION_SECONDS = 10 * 60  # 10 minutes
DELAY_BETWEEN_REQUESTS = 2  # 2 seconds

# US market holidays (NYSE/NASDAQ)
# These are observed holidays - if holiday falls on weekend, observed on Friday/Monday
US_MARKET_HOLIDAYS = {
    # New Year's Day, MLK Day, Presidents Day, Good Friday, Memorial Day, Juneteenth,
    # Independence Day, Labor Day, Thanksgiving, Christmas
    # Generated for 2000-2025
    '2000-01-01', '2000-01-17', '2000-02-21', '2000-04-21', '2000-05-29', '2000-07-04', '2000-09-04', '2000-11-23', '2000-12-25',
    '2001-01-01', '2001-01-15', '2001-02-19', '2001-04-13', '2001-05-28', '2001-07-04', '2001-09-03', '2001-09-11', '2001-09-12', '2001-09-13', '2001-09-14', '2001-11-22', '2001-12-25',
    '2002-01-01', '2002-01-21', '2002-02-18', '2002-03-29', '2002-05-27', '2002-07-04', '2002-09-02', '2002-11-28', '2002-12-25',
    '2003-01-01', '2003-01-20', '2003-02-17', '2003-04-18', '2003-05-26', '2003-07-04', '2003-09-01', '2003-11-27', '2003-12-25',
    '2004-01-01', '2004-01-19', '2004-02-16', '2004-04-09', '2004-05-31', '2004-06-11', '2004-07-05', '2004-09-06', '2004-11-25', '2004-12-24',
    '2005-01-17', '2005-02-21', '2005-03-25', '2005-05-30', '2005-07-04', '2005-09-05', '2005-11-24', '2005-12-26',
    '2006-01-02', '2006-01-16', '2006-02-20', '2006-04-14', '2006-05-29', '2006-07-04', '2006-09-04', '2006-11-23', '2006-12-25',
    '2007-01-01', '2007-01-02', '2007-01-15', '2007-02-19', '2007-04-06', '2007-05-28', '2007-07-04', '2007-09-03', '2007-11-22', '2007-12-25',
    '2008-01-01', '2008-01-21', '2008-02-18', '2008-03-21', '2008-05-26', '2008-07-04', '2008-09-01', '2008-11-27', '2008-12-25',
    '2009-01-01', '2009-01-19', '2009-02-16', '2009-04-10', '2009-05-25', '2009-07-03', '2009-09-07', '2009-11-26', '2009-12-25',
    '2010-01-01', '2010-01-18', '2010-02-15', '2010-04-02', '2010-05-31', '2010-07-05', '2010-09-06', '2010-11-25', '2010-12-24',
    '2011-01-17', '2011-02-21', '2011-04-22', '2011-05-30', '2011-07-04', '2011-09-05', '2011-11-24', '2011-12-26',
    '2012-01-02', '2012-01-16', '2012-02-20', '2012-04-06', '2012-05-28', '2012-07-04', '2012-09-03', '2012-10-29', '2012-10-30', '2012-11-22', '2012-12-25',
    '2013-01-01', '2013-01-21', '2013-02-18', '2013-03-29', '2013-05-27', '2013-07-04', '2013-09-02', '2013-11-28', '2013-12-25',
    '2014-01-01', '2014-01-20', '2014-02-17', '2014-04-18', '2014-05-26', '2014-07-04', '2014-09-01', '2014-11-27', '2014-12-25',
    '2015-01-01', '2015-01-19', '2015-02-16', '2015-04-03', '2015-05-25', '2015-07-03', '2015-09-07', '2015-11-26', '2015-12-25',
    '2016-01-01', '2016-01-18', '2016-02-15', '2016-03-25', '2016-05-30', '2016-07-04', '2016-09-05', '2016-11-24', '2016-12-26',
    '2017-01-02', '2017-01-16', '2017-02-20', '2017-04-14', '2017-05-29', '2017-07-04', '2017-09-04', '2017-11-23', '2017-12-25',
    '2018-01-01', '2018-01-15', '2018-02-19', '2018-03-30', '2018-05-28', '2018-07-04', '2018-09-03', '2018-11-22', '2018-12-05', '2018-12-25',
    '2019-01-01', '2019-01-21', '2019-02-18', '2019-04-19', '2019-05-27', '2019-07-04', '2019-09-02', '2019-11-28', '2019-12-25',
    '2020-01-01', '2020-01-20', '2020-02-17', '2020-04-10', '2020-05-25', '2020-07-03', '2020-09-07', '2020-11-26', '2020-12-25',
    '2021-01-01', '2021-01-18', '2021-02-15', '2021-04-02', '2021-05-31', '2021-06-18', '2021-07-05', '2021-09-06', '2021-11-25', '2021-12-24',
    '2022-01-17', '2022-02-21', '2022-04-15', '2022-05-30', '2022-06-20', '2022-07-04', '2022-09-05', '2022-11-24', '2022-12-26',
    '2023-01-02', '2023-01-16', '2023-02-20', '2023-04-07', '2023-05-29', '2023-06-19', '2023-07-04', '2023-09-04', '2023-11-23', '2023-12-25',
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
}

def is_weekend(date):
    """Check if date is a weekend"""
    return date.weekday() >= 5  # Saturday = 5, Sunday = 6

def is_market_holiday(date_str):
    """Check if date is a US market holiday"""
    return date_str in US_MARKET_HOLIDAYS

def generate_trading_days(start_date_str, end_date_str):
    """Generate list of trading days (excluding weekends and US market holidays)"""
    start = datetime.strptime(start_date_str, '%Y-%m-%d')
    end = datetime.strptime(end_date_str, '%Y-%m-%d')
    
    trading_days = []
    current = start
    
    while current <= end:
        date_str = current.strftime('%Y-%m-%d')
        # Exclude weekends and market holidays
        if not is_weekend(current) and not is_market_holiday(date_str):
            trading_days.append(date_str)
        current += timedelta(days=1)
    
    return trading_days

def scan_existing_dates(dynamodb_client, table_name):
    """Scan DynamoDB to get all existing dates"""
    print(f"Scanning table {table_name} for existing dates...")
    
    existing_dates = set()
    last_evaluated_key = None
    scan_count = 0
    
    while True:
        scan_params = {
            'TableName': table_name,
            'ProjectionExpression': '#d',
            'ExpressionAttributeNames': {'#d': 'date'}
        }
        
        if last_evaluated_key:
            scan_params['ExclusiveStartKey'] = last_evaluated_key
        
        response = dynamodb_client.scan(**scan_params)
        
        for item in response.get('Items', []):
            if 'date' in item:
                existing_dates.add(item['date']['S'])
        
        scan_count += 1
        print(f"  Scanned {len(existing_dates)} dates so far...")
        
        last_evaluated_key = response.get('LastEvaluatedKey')
        if not last_evaluated_key:
            break
    
    print(f"Scan complete. Found {len(existing_dates)} existing dates")
    return existing_dates

def query_incomplete_records(dynamodb_client, table_name, include_optional=False):
    """Query DynamoDB for records with missing required fields"""
    fields_to_check = REQUIRED_FIELDS.copy()
    if include_optional:
        fields_to_check.extend(OPTIONAL_FIELDS)
        print(f"Querying table {table_name} for incomplete records (including optional fields: {', '.join(OPTIONAL_FIELDS)})...")
    else:
        print(f"Querying table {table_name} for incomplete records (required fields only)...")
    
    incomplete_dates = set()
    
    # Scan and check each record for missing fields
    last_evaluated_key = None
    
    while True:
        scan_params = {
            'TableName': table_name
        }
        
        if last_evaluated_key:
            scan_params['ExclusiveStartKey'] = last_evaluated_key
        
        response = dynamodb_client.scan(**scan_params)
        
        for item in response.get('Items', []):
            date = item.get('date', {}).get('S')
            if not date:
                continue
            
            # Check if any required field is missing
            has_missing = False
            for field in fields_to_check:
                if field not in item or not item[field].get('N'):
                    has_missing = True
                    break
            
            if has_missing:
                incomplete_dates.add(date)
        
        print(f"  Found {len(incomplete_dates)} incomplete records so far...")
        
        last_evaluated_key = response.get('LastEvaluatedKey')
        if not last_evaluated_key:
            break
    
    print(f"Query complete. Found {len(incomplete_dates)} incomplete records")
    return incomplete_dates

def invoke_lambda(lambda_client, function_name, date, api_key_index):
    """Invoke Lambda function to backfill a single date"""
    try:
        payload = {
            'date': date,
            'apiKeyIndex': api_key_index
        }
        
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        if response.get('FunctionError'):
            return False, f"Lambda error: {response['FunctionError']}"
        
        result = json.loads(response['Payload'].read())
        
        if result.get('success'):
            return True, None
        else:
            errors = result.get('errors', ['Unknown error'])
            return False, ', '.join(errors)
    
    except Exception as e:
        return False, str(e)

def backfill_dates(lambda_client, function_name, dates_to_backfill, dry_run):
    """Backfill missing dates with API key rotation and rate limiting"""
    print(f"\nStarting backfill process for {len(dates_to_backfill)} dates...")
    
    if dry_run:
        print("DRY RUN MODE - No actual backfill will be performed\n")
        return
    
    # Sort dates chronologically
    sorted_dates = sorted(dates_to_backfill)
    
    current_api_key = 1
    requests_with_current_key = 0
    total_success = 0
    total_failure = 0
    
    for i, date in enumerate(sorted_dates):
        print(f"\n[{i + 1}/{len(sorted_dates)}] Processing {date}")
        print(f"  Using API key {current_api_key} (request {requests_with_current_key + 1}/{REQUESTS_PER_KEY})")
        
        # Invoke Lambda
        success, error = invoke_lambda(lambda_client, function_name, date, current_api_key)
        
        if success:
            print(f"  ✓ Success")
            total_success += 1
        else:
            print(f"  ✗ Failed: {error}")
            total_failure += 1
        
        # Increment request counter
        requests_with_current_key += 1
        
        # Check if we need to rotate API key
        if requests_with_current_key >= REQUESTS_PER_KEY:
            print(f"\n⚠️  Reached {REQUESTS_PER_KEY} requests with API key {current_api_key}")
            
            # Move to next API key
            current_api_key += 1
            
            if current_api_key > API_KEY_COUNT:
                # All keys exhausted, take a break
                print(f"\n⏸️  All {API_KEY_COUNT} API keys exhausted. Taking a {BREAK_DURATION_SECONDS // 60}-minute break...")
                break_end_time = datetime.now() + timedelta(seconds=BREAK_DURATION_SECONDS)
                print(f"   Break will end at: {break_end_time.strftime('%H:%M:%S')}")
                
                time.sleep(BREAK_DURATION_SECONDS)
                
                # Reset to first key
                current_api_key = 1
                print(f"\n▶️  Break complete. Resuming with API key 1")
            else:
                print(f"   Rotating to API key {current_api_key}")
            
            requests_with_current_key = 0
        
        # Add delay between requests
        if i < len(sorted_dates) - 1:
            time.sleep(DELAY_BETWEEN_REQUESTS)
    
    print(f"\n{'=' * 60}")
    print('BACKFILL COMPLETE')
    print(f"{'=' * 60}")
    print(f"Total dates processed: {len(sorted_dates)}")
    print(f"Successful: {total_success}")
    print(f"Failed: {total_failure}")
    print(f"Success rate: {(total_success / len(sorted_dates) * 100):.1f}%")

def save_missing_dates_to_file(dates_to_backfill, incomplete_dates, output_file):
    """Save missing dates to a file for later processing"""
    with open(output_file, 'w') as f:
        f.write("# Missing and Incomplete Dates for Backfill\n")
        f.write(f"# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"# Total dates: {len(dates_to_backfill)}\n")
        f.write("#\n")
        f.write("# Format: YYYY-MM-DD [status]\n")
        f.write("# Status: 'missing' = not in DB, 'incomplete' = missing required fields\n")
        f.write("#\n\n")
        
        for date in sorted(dates_to_backfill):
            status = "incomplete" if date in incomplete_dates else "missing"
            f.write(f"{date} # {status}\n")
    
    print(f"\n✓ Saved {len(dates_to_backfill)} dates to: {output_file}")

def load_dates_from_file(input_file):
    """Load dates from a file for backfilling"""
    dates = []
    with open(input_file, 'r') as f:
        for line in f:
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            # Extract date (first 10 characters: YYYY-MM-DD)
            date = line[:10]
            if len(date) == 10 and date[4] == '-' and date[7] == '-':
                dates.append(date)
    
    return dates

def main():
    parser = argparse.ArgumentParser(description='Scan and backfill missing macro data')
    parser.add_argument('--environment', default='dev', choices=['dev', 'prod'],
                        help='Environment (dev or prod)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Dry run mode - no actual backfill')
    parser.add_argument('--scan-only', action='store_true',
                        help='Only scan and save missing dates to file (no backfill)')
    parser.add_argument('--from-file', type=str,
                        help='Read dates to backfill from file (skips scan)')
    parser.add_argument('--output-file', type=str, default='missing_dates.txt',
                        help='Output file for --scan-only mode (default: missing_dates.txt)')
    parser.add_argument('--include-optional', action='store_true',
                        help='Also check optional fields (cpi, cpi_yoy, gdp_growth) for missing data')
    parser.add_argument('--start-date', default='2000-01-01',
                        help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', default='2025-11-01',
                        help='End date (YYYY-MM-DD)')
    
    args = parser.parse_args()
    
    print('=' * 60)
    if args.scan_only:
        print('SCAN FOR MISSING DATA')
    elif args.from_file:
        print('BACKFILL FROM FILE')
    else:
        print('SCAN AND BACKFILL MISSING DATA')
    print('=' * 60)
    print(f"Environment: {args.environment}")
    if args.scan_only:
        print(f"Mode: Scan only (save to {args.output_file})")
    elif args.from_file:
        print(f"Mode: Backfill from file ({args.from_file})")
    else:
        print(f"Dry run: {args.dry_run}")
    if not args.from_file:
        print(f"Date range: {args.start_date} to {args.end_date}")
    if not args.scan_only:
        print(f"API keys: {API_KEY_COUNT}")
        print(f"Requests per key: {REQUESTS_PER_KEY}")
        print(f"Break duration: {BREAK_DURATION_SECONDS // 60} minutes")
    print('=' * 60)
    
    # Initialize AWS clients
    dynamodb_client = boto3.client('dynamodb')
    lambda_client = boto3.client('lambda')
    
    # Determine table and function names
    table_name = f"{args.environment}-tmagikarp-macro-indicators"
    function_name = f"{args.environment}-magikarp-macro-ingestion"
    
    print(f"\nTable: {table_name}")
    print(f"Function: {function_name}\n")
    
    try:
        # Check if loading from file
        if args.from_file:
            print(f"Loading dates from file: {args.from_file}")
            dates_to_backfill = set(load_dates_from_file(args.from_file))
            incomplete_dates = set()  # We don't know which are incomplete when loading from file
            
            print(f"Loaded {len(dates_to_backfill)} dates from file")
        else:
            # Step 1: Generate all trading days in range
            print("Generating list of trading days...")
            all_trading_days = set(generate_trading_days(args.start_date, args.end_date))
            print(f"Generated {len(all_trading_days)} trading days")
            
            # Step 2: Scan DynamoDB for existing dates
            existing_dates = scan_existing_dates(dynamodb_client, table_name)
            
            # Step 3: Query for incomplete records
            incomplete_dates = query_incomplete_records(dynamodb_client, table_name, args.include_optional)
            
            # Step 4: Find missing dates (not in DynamoDB at all)
            missing_dates = all_trading_days - existing_dates
            
            # Step 5: Combine missing and incomplete dates
            dates_to_backfill = missing_dates | incomplete_dates
        
        print(f"\n{'=' * 60}")
        print("SUMMARY")
        print(f"{'=' * 60}")
        if not args.from_file:
            print(f"Total trading days in range: {len(all_trading_days)}")
            print(f"Existing records: {len(existing_dates)}")
            print(f"Missing dates (not in DB): {len(missing_dates)}")
            print(f"Incomplete records: {len(incomplete_dates)}")
        print(f"Total dates to backfill: {len(dates_to_backfill)}")
        print(f"{'=' * 60}")
        
        if len(dates_to_backfill) == 0:
            print("\n✓ No missing data found. All records are complete!")
            return
        
        # Print first 20 dates to backfill
        print("\nFirst 20 dates to backfill:")
        for date in sorted(list(dates_to_backfill))[:20]:
            if not args.from_file:
                status = "incomplete" if date in incomplete_dates else "missing"
                print(f"  {date} ({status})")
            else:
                print(f"  {date}")
        if len(dates_to_backfill) > 20:
            print(f"  ... and {len(dates_to_backfill) - 20} more")
        
        # Step 6: Save to file or backfill
        if args.scan_only:
            save_missing_dates_to_file(dates_to_backfill, incomplete_dates, args.output_file)
        else:
            backfill_dates(lambda_client, function_name, dates_to_backfill, args.dry_run)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == '__main__':
    main()

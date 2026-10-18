#!/usr/bin/env python3
"""Publish only observed geographic places from GoatCounter, without counts.

The API token stays in GOATCOUNTER_API_TOKEN. Only country/region identifiers,
place names and representative map coordinates enter the public JSON file.
"""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
API = 'https://heqi-zh.goatcounter.com/api/v0/stats/locations'


def normalized(value):
    text = unicodedata.normalize('NFKD', str(value)).casefold()
    return ''.join(char for char in text if char.isalnum() and not unicodedata.combining(char))


def region_index(regions):
    index = {}
    for region in regions:
        for alias in region['aliases']:
            key = (region['country'], normalized(alias))
            if key in index and index[key] is not None and index[key]['region'] != region['region']:
                index[key] = None  # Ambiguous place names must not be guessed.
            elif key not in index:
                index[key] = region
    return index


def public_locations(countries, subdivisions, centers, regions):
    """Whitelist geography fields; never copy raw API rows into public output."""
    index = region_index(regions)
    places = {}
    for country_row in countries:
        country = str(country_row.get('id', '')).split('-')[0].upper()
        if country not in centers or country_row.get('count', 0) <= 0:
            continue
        country_center = centers[country]
        fallback = False
        matched = False
        for row in subdivisions.get(country, []):
            if row.get('count', 0) <= 0:
                continue
            region = index.get((country, normalized(row.get('id', ''))))
            if region is None:
                region = index.get((country, normalized(row.get('name', ''))))
            if region is None:
                fallback = True
                continue
            matched = True
            # Names and coordinates come from the geographic gazetteer, not API metadata.
            places[region['region']] = {
                'country': country, 'region': region['region'],
                'latitude': region['latitude'], 'longitude': region['longitude'],
                'label': f"{region['name']}, {country_center['name']}"
            }
        if fallback or not matched:
            places[country] = {
                'country': country, 'latitude': country_center['latitude'],
                'longitude': country_center['longitude'], 'label': country_center['name']
            }
    return [places[key] for key in sorted(places)]


def fetch_rows(url, token, parameters):
    rows = []
    query = dict(parameters, limit=100, offset=0)
    while True:
        request = urllib.request.Request(url + '?' + urllib.parse.urlencode(query), headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
            'Accept': 'application/json', 'User-Agent': 'Hang-Zhen-homepage-visitor-sync'
        })
        # Space requests below the documented 4/second limit. A transient 404
        # occurred on the hosted API during the initial integration; retry once.
        for attempt in range(2):
            time.sleep(.3 if attempt == 0 else 1)
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    page = json.load(response)
                break
            except urllib.error.HTTPError as error:
                if error.code == 404 and attempt == 0:
                    continue
                # Log only the status, never raw API responses or account metadata.
                sys.exit(f'GoatCounter geographic API returned HTTP {error.code}; previous data kept.')
            except urllib.error.URLError:
                sys.exit('Could not reach GoatCounter; previous geographic data kept.')
        batch = page['stats']
        rows.extend(batch)
        if not page.get('more'):
            return rows
        if not batch:
            sys.exit('GoatCounter returned an empty pagination page; previous geographic data kept.')
        query['offset'] += len(batch)


def main():
    token = os.environ.get('GOATCOUNTER_API_TOKEN', '').strip()
    if not token:
        sys.exit('Set GOATCOUNTER_API_TOKEN to a GoatCounter token with statistics read access.')
    end = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1)
    parameters = {'start': '2026-10-01T00:00:00Z', 'end': end.isoformat().replace('+00:00', 'Z')}
    centers = json.loads((ROOT / 'assets/data/visitor-map-country-centers.json').read_text())
    regions = json.loads((ROOT / 'assets/data/visitor-map-region-centers.json').read_text())
    countries = fetch_rows(API, token, parameters)
    subdivisions = {}
    for row in countries:
        code = str(row.get('id', '')).split('-')[0].upper()
        if code in centers and row.get('count', 0) > 0:
            subdivisions[code] = fetch_rows(API + '/' + urllib.parse.quote(code, safe=''), token, parameters)
    snapshot = {'locations': public_locations(countries, subdivisions, centers, regions)}
    (ROOT / 'assets/data/visitor-locations.json').write_text(json.dumps(snapshot, indent=2) + '\n')
    print('Published geographic places only; no visit counts or visitor metadata.')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Export aggregate GoatCounter country counts for the public visitor globe.

The read-only API token is read from GOATCOUNTER_API_TOKEN, never written to
JSON. Run from the repository root; see docs/visitor-statistics.md for setup.
"""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
API = 'https://heqi-zh.goatcounter.com/api/v0/stats/locations'


def country_locations(rows, centers):
    """Collapse optional region IDs into their country, with representative dots."""
    totals = {}
    for row in rows:
        code = str(row.get('id', '')).split('-')[0].upper()
        count = row.get('count', 0)
        if code not in centers or not isinstance(count, int) or count <= 0:
            continue
        totals[code] = totals.get(code, 0) + count
    locations = []
    for code, count in sorted(totals.items()):
        center = centers[code]
        noun = 'visitor' if count == 1 else 'visitors'
        locations.append({
            'country': code,
            'latitude': center['latitude'], 'longitude': center['longitude'],
            'count': count,
            'label': f"{count} {noun} from {center['name']} (country-level location)"
        })
    return locations


def main():
    token = os.environ.get('GOATCOUNTER_API_TOKEN', '').strip()
    if not token:
        sys.exit('Set GOATCOUNTER_API_TOKEN to a GoatCounter token with read access.')
    now = dt.datetime.now(dt.timezone.utc)
    # Include the current hour. The account was created in October 2026.
    end = now.replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1)
    parameters = {
        'start': '2026-10-01T00:00:00Z',
        'end': end.isoformat().replace('+00:00', 'Z'), 'limit': 100, 'offset': 0
    }
    rows = []
    while True:
        request = urllib.request.Request(API + '?' + urllib.parse.urlencode(parameters), headers={
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json', 'Accept': 'application/json',
            'User-Agent': 'Hang-Zhen-homepage-visitor-sync'
        })
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                page = json.load(response)
        except urllib.error.HTTPError as error:
            detail = ''
            try:
                body = json.load(error)
                detail = str(body.get('error') or body.get('errors') or '')
            except (ValueError, TypeError):
                detail = 'Non-JSON error response'
            detail = detail.replace(token, '[redacted]')[:400]
            if error.code == 404:
                # Check token validity without logging account details.
                probe = urllib.request.Request('https://heqi-zh.goatcounter.com/api/v0/me', headers={
                    'Authorization': 'Bearer ' + token, 'Accept': 'application/json',
                    'Content-Type': 'application/json'
                })
                try:
                    with urllib.request.urlopen(probe, timeout=30) as result:
                        print(f'API authentication check: HTTP {result.status}')
                except urllib.error.HTTPError as probe_error:
                    print(f'API authentication check: HTTP {probe_error.code}')
                except urllib.error.URLError:
                    print('API authentication check: network error')
            sys.exit(f'GoatCounter returned HTTP {error.code}: {detail}')
        except urllib.error.URLError:
            sys.exit('Could not reach GoatCounter; the previous snapshot was kept.')
        batch = page['stats']
        rows.extend(batch)
        if not page.get('more'):
            break
        if not batch:
            sys.exit('GoatCounter pagination returned no records; the previous snapshot was kept.')
        parameters['offset'] += len(batch)
    centers = json.loads((ROOT / 'assets/data/visitor-map-country-centers.json').read_text())
    snapshot = {
        'source': 'goatcounter', 'status': 'ready',
        'updatedAt': now.isoformat().replace('+00:00', 'Z'),
        'locations': country_locations(rows, centers)
    }
    (ROOT / 'assets/data/visitor-locations.json').write_text(json.dumps(snapshot, indent=2) + '\n')
    print(f"Synced {len(snapshot['locations'])} countries from GoatCounter.")


if __name__ == '__main__':
    main()

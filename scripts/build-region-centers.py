#!/usr/bin/env python3
"""Build province/state representative coordinates from Natural Earth.

Usage: python3 scripts/build-region-centers.py /path/to/ne_10m_admin_1_label_points_details.geojson
Source (public domain): https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_label_points_details.geojson
"""
import json
from pathlib import Path
import sys

source = json.loads(Path(sys.argv[1]).read_text())
regions = {}
for feature in source['features']:
    props = feature['properties']
    country = props['iso_a2']
    code = props.get('iso_3166_2')
    if len(country) != 2 or not code or code == '-99':
        continue
    name = props.get('name_en') or props.get('name')
    latitude, longitude = props.get('latitude'), props.get('longitude')
    if not name or not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        continue
    aliases = {name, code}
    for key in ['name', 'name_en', 'name_alt', 'name_local', 'gn_name', 'gns_name', 'woe_name', 'name_zh']:
        value = props.get(key)
        if value:
            aliases.update(part.strip() for part in value.split('|') if part.strip())
    regions[(country, code)] = {
        'country': country, 'region': code, 'name': name,
        'latitude': round(latitude, 3), 'longitude': round(longitude, 3),
        'aliases': sorted(aliases)
    }
output = [regions[key] for key in sorted(regions)]
Path('assets/data/visitor-map-region-centers.json').write_text(
    json.dumps(output, separators=(',', ':'), ensure_ascii=False) + '\n')
print(f'Prepared {len(output)} representative region locations.')

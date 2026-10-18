#!/usr/bin/env python3
"""Prepare local Natural Earth data for the draggable visitor map.

Usage: python3 scripts/build-visitor-map.py /path/to/ne_110m_admin_0_countries.geojson
Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
Natural Earth data is public domain. Keep all countries, including Antarctica.
"""
import json
import sys
from pathlib import Path


def rounded(value):
    if isinstance(value, list):
        return [rounded(item) for item in value]
    return round(value, 3)


source = json.loads(Path(sys.argv[1]).read_text())
for feature in source['features']:
    feature['properties'] = {'name': feature['properties']['ADMIN']}
    feature['geometry']['coordinates'] = rounded(feature['geometry']['coordinates'])
Path('assets/data/visitor-map-countries.json').write_text(
    json.dumps(source, separators=(',', ':')) + '\n')

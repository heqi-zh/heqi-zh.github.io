# Visitor geography

The official GoatCounter tracker sends visits directly to
`https://heqi-zh.goatcounter.com/count`. Its unmodified script is hosted locally:
https://www.goatcounter.com/help/countjs-host
Local previews do not load it. MapMyVisitors is no longer used.

## Geographic collection settings

In GoatCounter, open **Settings → Data collection**. Enable **Location** and
**Region**, clear **For the following countries only**, and save. An empty
country restriction enables region collection for all countries. Without this,
the default restriction is US, RU and CN. This setting affects new visits only;
old country-only records cannot be expanded into provinces/states.

Official source for the setting:
https://github.com/arp242/goatcounter/blob/main/tpl/settings_main.gohtml

## Automatic synchronization

A read-only statistics API token is stored in the repository secret
`GOATCOUNTER_API_TOKEN`. **Sync visitor locations** runs automatically at minute
17 of every hour (UTC, so also minute 17 in Asia/Shanghai). GitHub may delay
scheduled jobs. Manual execution from Actions is optional.

The workflow reads `/api/v0/stats/locations`, then the per-country
`/api/v0/stats/locations/{country}` breakdown. Requests are paginated and spaced
below the API rate limit. It publishes a new snapshot and requests a Pages
rebuild only when the observed geographic places change. Repeat visits in an
already observed place do not create extra points or expose counts.

The browser refreshes the same-origin snapshot every five minutes, or when the
tab becomes visible. Collection in GoatCounter is independent of this display
refresh schedule.

## Public data: geographic fields only

The public snapshot `assets/data/visitor-locations.json` has just one top-level
field, `locations`. Each distinct place contains only:

- `country`: country code;
- `region`: province/state code, when available;
- `latitude`, `longitude`: representative geographic coordinates;
- `label`: geographic name only.

No visit counts, visit dates/times, IP addresses, page paths, referrers, browser
or device data, account details, or API tokens are copied into this file. Raw API
responses are not printed in workflow logs. The snapshot itself has no sync
timestamp or provider metadata. Repository commits still have normal publication
timestamps.

Provincial/state dots use actual region names from GoatCounter and Natural Earth
representative coordinates. Name matches are restricted to the same country;
ambiguous names are not guessed. When only a country is known, or an observed
region cannot be reliably matched to a geographic point, a country-level point
is retained. These are regional representative points, not precise visitor
coordinates or city-level IP locations.

Natural Earth data is public domain:

- Country label points: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson
- Province/state label details: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_label_points_details.geojson

Regenerate the province/state lookup using:

```sh
python3 scripts/build-region-centers.py /path/to/ne_10m_admin_1_label_points_details.geojson
```

The resulting static gazetteer is `assets/data/visitor-map-region-centers.json`.

## Troubleshooting

Open `/?visitor-debug=1#visitor-map` for readable status. The displayed read time
is generated locally in the browser, not a visitor timestamp. “Tracker loaded”
only confirms the script loaded; use the private GoatCounter dashboard to check
recording.

# Visitor statistics

Visits are collected directly by the official GoatCounter tracker at
`https://heqi-zh.goatcounter.com/count`. The unmodified tracker is hosted at
`assets/js/goatcounter-count.js`, as supported by GoatCounter:
https://www.goatcounter.com/help/countjs-host

Local previews do not load the tracker. The former MapMyVisitors integration
and its test records are no longer used.

## Enable globe locations

1. Sign in at https://heqi-zh.goatcounter.com/.
2. Open the username menu → API and create a token with read access to statistics.
3. Open https://github.com/heqi-zh/heqi-zh.github.io/settings/secrets/actions and
   create a repository secret named `GOATCOUNTER_API_TOKEN` with that token.
4. Open Actions → **Sync visitor locations** → **Run workflow**.

The workflow then runs hourly. It fetches the documented `/api/v0/stats/locations`
endpoint, handles pagination, and publishes country-level counts as
`assets/data/visitor-locations.json`. It explicitly requests a Pages rebuild
because commits made with `GITHUB_TOKEN` do not automatically trigger Pages.
The public page fetches this same-origin JSON every five minutes and when the
browser tab becomes visible. The token stays in GitHub Secrets; only aggregate
country counts are published.

Dots represent countries, using Natural Earth's representative label points,
not a visitor's precise city or coordinates. The source label positions are
in `assets/data/visitor-map-country-centers.json` (Natural Earth, public domain):
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson

Until the token is configured and the first sync succeeds, the globe has no
visitor dots. The GoatCounter dashboard still receives visits independently.
The old provider's records are not imported.

For troubleshooting, open `/?visitor-debug=1#visitor-map`. “Tracker loaded” only
confirms the official script loaded; check the GoatCounter dashboard to confirm
that an actual visit was recorded.

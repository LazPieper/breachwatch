# BREACHWATCH — Global Data Breach Tracker

A website that records major breaches of **personally identifiable information (PII)**
worldwide and lets you explore them as an interactive **timeline** or a **world map**.
Click any breach to see what happened, who stole the data, how, what data was exposed,
and the aftermath.

## Run it

No build step, no Node required — it's a static site. You just need a local web
server so the browser can load the JSON data file (opening `index.html` directly
via `file://` will be blocked by browser security).

```bash
cd data-breach-website
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

```
index.html            # page shell + view toggle + detail drawer
css/styles.css        # dark "security ops" theme
js/app.js             # data loading, filters, stats, detail drawer
js/timeline.js        # timeline view
js/map.js             # Leaflet world-map view
data/breaches.json    # the dataset (source of truth)
scripts/sync_hibp.py  # pull new breaches from Have I Been Pwned
```

## The data

`data/breaches.json` is a curated dataset of major real breaches. Each record:

```json
{
  "id": "equifax-2017",
  "name": "Equifax",
  "disclosed": "2017-09-07",       // YYYY, YYYY-MM, or YYYY-MM-DD
  "occurred": "2017-05",
  "country": "United States",
  "city": "Atlanta, GA",
  "lat": 33.749, "lon": -84.388,   // for the map
  "records": 147000000,
  "sector": "Finance / Credit",
  "dataTypes": ["Names", "Social Security numbers", "..."],
  "attacker": "Four members of China's PLA (indicted 2020)",
  "method": "Unpatched Apache Struts vulnerability (CVE-2017-5638)",
  "summary": "What happened…",
  "aftermath": "Settlements, fines, fallout…",
  "sources": ["https://…"]
}
```

**Severity** (and marker color/size) is derived automatically from `records`:
catastrophic ≥ 1B, critical ≥ 100M, high ≥ 10M, moderate < 10M.

To add a breach by hand, append an object to the `breaches` array and reload.

## Keeping it current ("real time")

There is no single feed of *all* global PII breaches, so freshness comes from
two layers — **the web/news agent is the primary, automated one; HIBP is an
optional manual backfill.**

### 1. Primary: the weekly "watch the news" agent (automated)

A scheduled Claude Code agent runs **weekly** and is the main updater. Each run it
web-searches reputable sources (BleepingComputer, The Record, Reuters, official
disclosures, etc.) for newly disclosed major breaches, appends enriched records to
`data/breaches.json` — **with location, attacker, method, and aftermath** — and
**opens a pull request** for review rather than pushing to `main`.

This is the source of the rich detail in the dataset. (Set up via Claude's
scheduling skill; manage it in the app's "Scheduled" section.)

### 2. Optional: Have I Been Pwned backfill (manual)

`scripts/sync_hibp.py` is a manual, opt-in tool — **nothing runs it
automatically.** It pulls the [Have I Been Pwned](https://haveibeenpwned.com)
breach list (free, no key) for deterministic, structured backfill of older
credential breaches. HIBP gives dates, record counts, and exposed data types, but
**no location, attacker, or aftermath**, so imported entries land with
`country: "Unknown"` and `lat/lon: 0` until you enrich them. It also skews toward
email/credential dumps and under-covers healthcare/government/broker breaches.

   ```bash
   python3 scripts/sync_hibp.py --dry-run   # preview
   python3 scripts/sync_hibp.py             # merge
   ```

You can also add a breach entirely by hand — just append an object to the
`breaches` array following the schema above.

## Notes & disclaimer

Record counts and attributions reflect the most widely reported figures at the time
of disclosure and may be revised as investigations conclude. This project is for
research/education and is not affiliated with any listed organization.

Map tiles © OpenStreetMap contributors, © CARTO. Mapping by Leaflet.

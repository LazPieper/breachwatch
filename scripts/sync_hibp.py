#!/usr/bin/env python3
"""
sync_hibp.py — Merge the Have I Been Pwned breach list into data/breaches.json.

HIBP's /breaches endpoint is free and needs no API key, but it does NOT include
geographic location, attacker attribution, or "aftermath" — those are the
curated fields you maintain by hand. This script only ADDS breaches it doesn't
already know about, and never overwrites an existing (curated) entry.

Usage:
    python3 scripts/sync_hibp.py            # merge new breaches in
    python3 scripts/sync_hibp.py --dry-run  # show what would change

Note: imported entries get lat/lon = 0,0 (they won't appear on the map until
you add coordinates). Open the file and fill in location/attacker/aftermath to
promote an imported breach to a full record.
"""
import argparse
import json
import os
import sys
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "breaches.json")
HIBP_URL = "https://haveibeenpwned.com/api/v3/breaches"
UA = "BreachWatch-Sync/1.0 (+local research tool)"


def fetch_hibp():
    req = urllib.request.Request(HIBP_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def slugify(name):
    out = "".join(c.lower() if c.isalnum() else "-" for c in name)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def to_record(hb):
    """Map an HIBP breach object to our schema (best-effort)."""
    bdate = hb.get("BreachDate", "")  # YYYY-MM-DD
    year = bdate[:4] if bdate else "????"
    return {
        "id": f"{slugify(hb.get('Name', 'unknown'))}-{year}",
        "name": hb.get("Title") or hb.get("Name"),
        "disclosed": hb.get("AddedDate", bdate)[:10] or bdate,
        "occurred": bdate,
        "country": "Unknown",
        "city": "",
        "lat": 0,
        "lon": 0,
        "records": int(hb.get("PwnCount", 0) or 0),
        "sector": "Unknown",
        "dataTypes": hb.get("DataClasses", []),
        "attacker": "Unknown / unattributed",
        "method": "See source",
        "summary": strip_html(hb.get("Description", "")),
        "aftermath": "",
        "sources": [f"https://haveibeenpwned.com/PwnedWebsites#{hb.get('Name','')}"],
        "_source": "hibp",
    }


def strip_html(s):
    import re
    return re.sub(r"<[^>]+>", "", s or "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(DATA, encoding="utf-8") as f:
        doc = json.load(f)

    existing_ids = {b["id"] for b in doc["breaches"]}
    existing_names = {b["name"].lower() for b in doc["breaches"]}

    print("Fetching HIBP breach list…")
    try:
        hibp = fetch_hibp()
    except Exception as e:
        print(f"  error: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"  got {len(hibp)} breaches from HIBP")

    added = []
    for hb in hibp:
        rec = to_record(hb)
        if rec["id"] in existing_ids:
            continue
        if rec["name"] and rec["name"].lower() in existing_names:
            continue
        added.append(rec)

    added.sort(key=lambda r: r["records"], reverse=True)
    print(f"  {len(added)} new breaches to import")
    for r in added[:15]:
        print(f"    + {r['name']}  ({r['records']:,} records)")
    if len(added) > 15:
        print(f"    … and {len(added) - 15} more")

    if args.dry_run:
        print("\nDry run — no changes written.")
        return

    doc["breaches"].extend(added)
    doc.setdefault("meta", {})["lastUpdated"] = date.today().isoformat()
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(doc['breaches'])} total breaches to {os.path.relpath(DATA)}")
    print("Tip: imported entries have country='Unknown' and lat/lon=0 — fill those in to show them on the map.")


if __name__ == "__main__":
    main()

/* Map view: Leaflet world map with severity-scaled circle markers. */
window.BreachMap = (function () {
  let map = null;
  let layer = null;
  let initialized = false;
  let lastItems = [];

  function ensureMap() {
    if (initialized) return;
    map = L.map("map", {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 8,
      zoomControl: true,
      attributionControl: true,
    }).setView([25, 5], 2);

    // dedicated pane so land always sits below the breach markers
    map.createPane("land");
    map.getPane("land").style.zIndex = 250;

    layer = L.layerGroup().addTo(map);
    initialized = true;
    loadLand();
  }

  // flat vector world: cream landmasses + hairline coastlines on a navy ocean
  function loadLand() {
    const LAND_URL =
      "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson";
    fetch(LAND_URL)
      .then((r) => r.json())
      .then((geo) => {
        L.geoJSON(geo, {
          pane: "land",
          interactive: false,
          style: {
            fillColor: "#e0d2a4",
            fillOpacity: 1,
            color: "#1b1814",
            weight: 0.5,
            opacity: 0.6,
          },
        }).addTo(map);
        L.control
          .attribution({ prefix: false })
          .addAttribution("Boundaries &copy; Natural Earth")
          .addTo(map);
      })
      .catch(() => {/* navy ocean background still renders intentionally */});
  }

  // radius scales with log of record count
  function radiusFor(records) {
    const r = Math.log10(Math.max(records, 1)); // ~6 to ~10
    return Math.max(7, (r - 4) * 6);
  }

  function render(items, onSelect) {
    ensureMap();
    layer.clearLayers();
    lastItems = items;

    // jitter co-located points (e.g. several Silicon Valley HQs) slightly
    const seen = new Map();
    for (const b of items) {
      const key = b.lat.toFixed(2) + "," + b.lon.toFixed(2);
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      const offset = n * 0.55;
      const lat = b.lat + offset * 0.6;
      const lon = b.lon + offset;

      const marker = L.circleMarker([lat, lon], {
        radius: radiusFor(b.records),
        color: b._sevColor,
        weight: 1.5,
        fillColor: b._sevColor,
        fillOpacity: 0.5,
      });

      marker.bindPopup(
        `<b>${esc(b.name)}</b><br>` +
        `<span class="pp-rec">${b._recordsLabel} records</span> · ${esc(b.country)}<br>` +
        `<span style="color:var(--text-dim);font-size:12px">${b._dateLabel} · ${esc(b.sector)}</span><br>` +
        `<span class="pp-link" data-id="${b.id}">View full details →</span>`,
        { closeButton: true }
      );

      marker.on("popupopen", (e) => {
        const link = e.popup.getElement().querySelector(".pp-link");
        if (link) link.addEventListener("click", () => onSelect(link.dataset.id));
      });

      marker.addTo(layer);
    }

    setTimeout(() => map.invalidateSize(), 50);
  }

  function refresh() {
    if (initialized) setTimeout(() => map.invalidateSize(), 50);
  }

  function focusCountry(country) {
    if (!initialized) return;
    const pts = lastItems.filter((b) => b.country === country && (b.lat || b.lon))
      .map((b) => [b.lat, b.lon]);
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], 5, { animate: true });
    else map.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 6 });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  return { render, refresh, focusCountry };
})();

/* BREACHWATCH main controller */
(function () {
  const SEV_COLORS = {
    catastrophic: getCss("--sev-catastrophic"),
    critical: getCss("--sev-critical"),
    high: getCss("--sev-high"),
    moderate: getCss("--sev-moderate"),
  };

  const state = {
    all: [],
    filtered: [],
    view: "timeline",
    search: "",
    sector: "",
    severity: "",
    sort: "date-desc",
    byId: new Map(),
  };

  const els = {
    stats: document.getElementById("stats"),
    search: document.getElementById("search"),
    sector: document.getElementById("filterSector"),
    severity: document.getElementById("filterSeverity"),
    sort: document.getElementById("sortBy"),
    count: document.getElementById("resultCount"),
    rankList: document.getElementById("rankList"),
    lastUpdated: document.getElementById("lastUpdated"),
    legend: document.getElementById("mapLegend"),
    drawer: document.getElementById("drawer"),
    drawerInner: document.getElementById("drawerInner"),
    scrim: document.getElementById("drawerScrim"),
  };

  init();

  async function init() {
    let data;
    try {
      const res = await fetch("data/breaches.json", { cache: "no-store" });
      data = await res.json();
    } catch (e) {
      document.getElementById("view-timeline").innerHTML =
        '<div class="empty">Could not load breaches.json.<br>Run a local server: <code>python3 -m http.server</code> then open the printed URL.</div>';
      return;
    }

    state.all = data.breaches.map(decorate).sort((a, b) => b._ts - a._ts);
    state.byId = new Map(state.all.map((b) => [b.id, b]));

    if (data.meta && data.meta.lastUpdated) {
      els.lastUpdated.textContent = "updated " + data.meta.lastUpdated;
    }

    populateSectors();
    renderLegend();
    bindEvents();
    apply();
  }

  /* ---- derive presentation fields ---- */
  function decorate(b) {
    const sev = severityOf(b.records);
    const d = parseDate(b.disclosed);
    return Object.assign({}, b, {
      severity: sev,
      _sevColor: SEV_COLORS[sev],
      _ts: d.getTime(),
      _year: d.getFullYear(),
      _dateLabel: fmtDate(b.disclosed),
      _recordsLabel: fmtNum(b.records),
      _search: [b.name, b.attacker, b.country, b.city, b.sector, b.method,
        (b.dataTypes || []).join(" "), b.summary].join(" ").toLowerCase(),
    });
  }

  function severityOf(n) {
    if (n >= 1e9) return "catastrophic";
    if (n >= 1e8) return "critical";
    if (n >= 1e7) return "high";
    return "moderate";
  }

  /* ---- filtering / sorting ---- */
  function apply() {
    let list = state.all.filter((b) => {
      if (state.search && !b._search.includes(state.search)) return false;
      if (state.sector && b.sector !== state.sector) return false;
      if (state.severity && b.severity !== state.severity) return false;
      return true;
    });

    const cmp = {
      "date-desc": (a, b) => b._ts - a._ts,
      "date-asc": (a, b) => a._ts - b._ts,
      "records-desc": (a, b) => b.records - a.records,
      "records-asc": (a, b) => a.records - b.records,
    }[state.sort];
    list.sort(cmp);

    state.filtered = list;
    els.count.textContent = `${list.length} / ${state.all.length} events`;

    renderStats();
    renderRanking(list);
    if (state.view === "timeline") Timeline.render(list, openDetail);
    else BreachMap.render(list, openDetail);
  }

  /* ---- country ranking (map view) ---- */
  function renderRanking(list) {
    const map = new Map();
    for (const b of list) {
      const c = b.country || "Unknown";
      const e = map.get(c) || { count: 0, records: 0 };
      e.count += 1;
      e.records += b.records;
      map.set(c, e);
    }
    const rows = [...map.entries()]
      .map(([country, v]) => ({ country, ...v }))
      .sort((a, b) => b.count - a.count || b.records - a.records);

    if (!rows.length) {
      els.rankList.innerHTML = '<div class="rank-sub" style="padding:4px 7px">No data</div>';
      return;
    }
    const max = rows[0].count;
    els.rankList.innerHTML = rows.map((r, i) => `
      <div class="rank-row" data-country="${esc(r.country)}" title="Zoom to ${esc(r.country)}">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-body">
          <span class="rank-name">${esc(r.country)}</span>
          <span class="rank-bar" style="width:${Math.max(8, (r.count / max) * 100)}%"></span>
          <span class="rank-sub">${fmtNum(r.records)} records</span>
        </span>
        <span class="rank-count">${r.count}</span>
      </div>`).join("");

    els.rankList.querySelectorAll(".rank-row").forEach((el) => {
      el.addEventListener("click", () => {
        if (state.view !== "map") switchView("map");
        BreachMap.focusCountry(el.dataset.country);
      });
    });
  }

  /* ---- stats header ---- */
  function renderStats() {
    const list = state.filtered;
    const totalRecords = list.reduce((s, b) => s + b.records, 0);
    const countries = new Set(list.map((b) => b.country)).size;
    const years = list.map((b) => b._year);
    const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "—";
    const cat = list.filter((b) => b.severity === "catastrophic").length;

    els.stats.innerHTML = [
      stat(list.length, "Tracked breaches", "accent"),
      stat(fmtNum(totalRecords), "Records exposed", "danger"),
      stat(countries, "Countries"),
      stat(cat, "Catastrophic (1B+)", "danger"),
      stat(span, "Years covered"),
    ].join("");
  }
  function stat(val, lbl, cls) {
    return `<div class="stat"><span class="val ${cls || ""}">${val}</span><span class="lbl">${lbl}</span></div>`;
  }

  /* ---- detail drawer ---- */
  function openDetail(id) {
    const b = state.byId.get(id);
    if (!b) return;
    els.drawerInner.innerHTML = detailHTML(b);
    els.drawer.classList.add("open");
    els.drawer.setAttribute("aria-hidden", "false");
    els.scrim.classList.add("open");
    els.drawerInner.querySelector(".dh-close").addEventListener("click", closeDetail);
    els.drawer.scrollTop = 0;
  }
  function closeDetail() {
    els.drawer.classList.remove("open");
    els.drawer.setAttribute("aria-hidden", "true");
    els.scrim.classList.remove("open");
  }

  function detailHTML(b) {
    const chips = (b.dataTypes || []).map((d) => `<span class="d-chip">${esc(d)}</span>`).join("");
    const sources = (b.sources || []).map((s) =>
      `<div><a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a></div>`).join("");
    return `
      <div class="dh" style="--sev:${b._sevColor}">
        <button class="dh-close" aria-label="Close">✕</button>
        <span class="dh-sev">${b.severity} severity</span>
        <h2>${esc(b.name)}</h2>
        <div class="dh-meta">
          <span>📍 ${esc(b.city ? b.city + ", " : "")}${esc(b.country)}</span>
          <span>🏷 ${esc(b.sector)}</span>
        </div>
      </div>

      <div class="d-hero">
        <div class="cell"><div class="big sevcol" style="color:${b._sevColor}">${b._recordsLabel}</div><div class="k">records exposed</div></div>
        <div class="cell"><div class="big">${b._dateLabel}</div><div class="k">disclosed${b.occurred ? " · occurred " + esc(b.occurred) : ""}</div></div>
      </div>

      <div class="d-sec">
        <h4>What happened</h4>
        <p>${esc(b.summary)}</p>
      </div>

      <div class="d-sec">
        <h4>Who & how</h4>
        <div class="d-row"><span class="ic">▸</span><p><strong>Attacker:</strong> <span class="attacker">${esc(b.attacker || "Unknown / unattributed")}</span></p></div>
        <div class="d-row"><span class="ic">▸</span><p><strong>Method:</strong> ${esc(b.method || "Not disclosed")}</p></div>
      </div>

      <div class="d-sec">
        <h4>Data compromised</h4>
        <div class="d-chips">${chips || '<span class="d-chip">Not specified</span>'}</div>
      </div>

      ${b.aftermath ? `<div class="d-sec"><h4>Aftermath</h4><p>${esc(b.aftermath)}</p></div>` : ""}

      ${sources ? `<div class="d-sec d-sources"><h4>Sources</h4>${sources}</div>` : ""}
    `;
  }

  /* ---- legend ---- */
  function renderLegend() {
    els.legend.innerHTML =
      "<h4>Records exposed</h4>" +
      [
        ["catastrophic", "1 billion +"],
        ["critical", "100 million +"],
        ["high", "10 million +"],
        ["moderate", "under 10 million"],
      ].map(([k, lbl]) =>
        `<div class="legend-row"><span class="legend-dot" style="background:${SEV_COLORS[k]}"></span>${lbl}</div>`
      ).join("") +
      '<div class="legend-row" style="margin-top:8px;color:var(--text-faint)">Circle size ∝ record count</div>';
  }

  /* ---- sectors ---- */
  function populateSectors() {
    const sectors = [...new Set(state.all.map((b) => b.sector))].sort();
    els.sector.innerHTML =
      '<option value="">All sectors</option>' +
      sectors.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  }

  /* ---- events ---- */
  function bindEvents() {
    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
    els.search.addEventListener("input", debounce((e) => { state.search = e.target.value.trim().toLowerCase(); apply(); }, 160));
    els.sector.addEventListener("change", (e) => { state.sector = e.target.value; apply(); });
    els.severity.addEventListener("change", (e) => { state.severity = e.target.value; apply(); });
    els.sort.addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
    els.scrim.addEventListener("click", closeDetail);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll(".view-btn").forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    document.getElementById("view-timeline").classList.toggle("active", view === "timeline");
    document.getElementById("view-map").classList.toggle("active", view === "map");
    apply();
    if (view === "map") BreachMap.refresh();
  }

  /* ---- helpers ---- */
  function parseDate(s) {
    // accepts YYYY, YYYY-MM, YYYY-MM-DD
    const parts = String(s).split("-");
    return new Date(+parts[0], parts[1] ? +parts[1] - 1 : 0, parts[2] ? +parts[2] : 1);
  }
  function fmtDate(s) {
    const parts = String(s).split("-");
    const d = parseDate(s);
    const mo = d.toLocaleString("en-US", { month: "short" });
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${mo} ${parts[0]}`;
    return `${mo} ${+parts[2]}, ${parts[0]}`;
  }
  function fmtNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
    return String(n);
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function getCss(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }
})();

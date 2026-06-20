/* Timeline view: groups breaches by year and renders a vertical track. */
window.Timeline = (function () {
  const root = document.getElementById("view-timeline");

  function render(items, onSelect) {
    if (!items.length) {
      root.innerHTML = '<div class="empty">No breaches match your filters.</div>';
      return;
    }

    // group by year of disclosure
    const byYear = new Map();
    for (const b of items) {
      const y = b._year;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(b);
    }
    const years = [...byYear.keys()].sort((a, b) => b - a);

    const html = years.map((y) => {
      const cards = byYear.get(y).map(cardHTML).join("");
      return `<div class="tl-year">${y}</div><div class="tl-track">${cards}</div>`;
    }).join("");

    root.innerHTML = html;

    root.querySelectorAll(".tl-item").forEach((el) => {
      el.addEventListener("click", () => onSelect(el.dataset.id));
    });
  }

  function cardHTML(b) {
    const tags = [
      `<span class="tag sev">${b.severity}</span>`,
      `<span class="tag">${b.sector}</span>`,
      `<span class="tag">${b.country}</span>`,
    ].join("");
    return `
      <div class="tl-item" data-id="${b.id}" style="--sev:${b._sevColor}">
        <div class="tl-card">
          <div class="tl-card-head">
            <h3>${esc(b.name)}</h3>
            <span class="tl-date">${b._dateLabel}</span>
            <span class="tl-records">${b._recordsLabel}</span>
          </div>
          <p>${esc(b.summary)}</p>
          <div class="tl-tags">${tags}</div>
        </div>
      </div>`;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  return { render };
})();

/* ==========================================================================
   Charts — small, dependency-free SVG components for the "premium" visual
   language (glowing rings, radar/spider chart). Pure rendering helpers;
   they take already-computed numbers and never touch Data/Storage
   themselves, so any screen can reuse them with its own real stats.
   ========================================================================== */

// A single glowing progress ring with centered label/sublabel text.
// opts: { percent (0-100), size (px), strokeWidth (px), colorVar (CSS var
// name, e.g. '--cyan'), label (big text), sublabel (small text below) }
function ringSvg(opts) {
  const size = opts.size || 120;
  const stroke = opts.strokeWidth || 10;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, opts.percent || 0));
  const dash = (pct / 100) * circumference;
  const colorVar = opts.colorVar || '--cyan';

  const wrap = fmt(`
    <div class="glow-ring" style="--glow-color:var(${colorVar});width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--bg-3)" stroke-width="${stroke}"/>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(${colorVar})" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${dash} ${circumference}"
          transform="rotate(-90 ${c} ${c})"/>
      </svg>
      <div class="glow-ring-center">
        ${opts.label != null ? `<div style="font-family:var(--font-display);font-weight:800;font-size:${Math.round(size * 0.19)}px;color:var(--text-0);line-height:1;">${opts.label}</div>` : ''}
        ${opts.sublabel ? `<div style="color:var(--text-2);font-size:${Math.max(9, Math.round(size * 0.075))}px;font-weight:600;margin-top:4px;">${opts.sublabel}</div>` : ''}
      </div>
    </div>
  `);
  return wrap;
}

// Radar/spider chart. axes: [{ label, value }] where value is 0-100.
// Renders a glowing filled polygon over N spokes, with axis labels placed
// around the outside — same visual language as the reference screenshot's
// "Relationship / Intellect / Discipline" chart, but generalized to any
// number of axes >= 3.
function renderRadarChart(axes, opts) {
  opts = opts || {};
  const size = opts.size || 240;
  const c = size / 2;
  const maxR = c - (opts.labelPad || 46);
  const rings = opts.rings || 4;
  const colorVar = opts.colorVar || '--cyan';
  const n = axes.length;

  function pointFor(i, valueFrac) {
    const angle = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    return {
      x: c + Math.cos(angle) * maxR * valueFrac,
      y: c + Math.sin(angle) * maxR * valueFrac,
    };
  }

  // Grid rings (concentric N-gons) — faint, purely decorative structure.
  let gridSvg = '';
  for (let ring = 1; ring <= rings; ring++) {
    const frac = ring / rings;
    const pts = axes.map((_, i) => { const p = pointFor(i, frac); return `${p.x},${p.y}`; }).join(' ');
    gridSvg += `<polygon points="${pts}" fill="none" stroke="var(--line)" stroke-width="1"/>`;
  }
  // Spokes
  axes.forEach((_, i) => {
    const p = pointFor(i, 1);
    gridSvg += `<line x1="${c}" y1="${c}" x2="${p.x}" y2="${p.y}" stroke="var(--line)" stroke-width="1"/>`;
  });

  // Data polygon
  const dataPts = axes.map((a, i) => { const p = pointFor(i, Math.max(0, Math.min(100, a.value)) / 100); return `${p.x},${p.y}`; }).join(' ');

  const wrap = fmt(`
    <div class="radar-chart-wrap" style="width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="filter:drop-shadow(0 0 14px color-mix(in srgb, var(${colorVar}) 45%, transparent));">
        ${gridSvg}
        <polygon points="${dataPts}" fill="color-mix(in srgb, var(${colorVar}) 22%, transparent)" stroke="var(${colorVar})" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>
  `);

  axes.forEach((a, i) => {
    const p = pointFor(i, 1.14); // push labels just past the outer ring, but pulled in enough to stay inside the wrapper — the parent glass card clips overflow for its glow effect, so labels running past it get cut off
    const label = fmt(`<div class="radar-axis-label" style="left:${p.x}px;top:${p.y}px;">${escapeHtml(a.label)}</div>`);
    wrap.appendChild(label);
  });

  return wrap;
}

// Compact 7-bar weekly activity chart. counts: array of 7 numbers (oldest
// to newest), labels: array of 7 short day labels to match.
function renderWeeklyBarChart(counts, labels) {
  const max = Math.max(1, ...counts);
  const wrap = fmt(`<div style="display:flex;align-items:flex-end;gap:8px;height:64px;"></div>`);
  counts.forEach((c, i) => {
    const pct = Math.max(4, Math.round((c / max) * 100));
    const col = fmt(`
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end;">
        <div style="width:100%;max-width:22px;height:${pct}%;border-radius:6px;background:${c > 0 ? 'linear-gradient(180deg,var(--cyan),var(--green))' : 'var(--bg-3)'};${c > 0 ? 'box-shadow:0 0 10px rgba(52,224,214,0.35);' : ''}"></div>
        <div style="font-size:9.5px;color:var(--text-3);font-weight:700;">${labels[i]}</div>
      </div>
    `);
    wrap.appendChild(col);
  });
  return wrap;
}

// (session, journal entry, or check-in) — the "chat-history-style" monthly
// overview from the reference screenshots, but built from actual app data
// rather than a separate tracked "streak calendar."
function renderHistoryCalendar(container) {
  let viewDate = new Date();
  viewDate.setDate(1);

  const activeDays = new Set();
  Data.getSessions().forEach((s) => activeDays.add(new Date(s.date).toDateString()));
  Data.getJournalEntries().forEach((e) => activeDays.add(new Date(e.date).toDateString()));
  Data.getCheckIns().forEach((c) => activeDays.add(new Date(c.date).toDateString()));

  function render() {
    container.innerHTML = '';
    const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const head = fmt(`
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3);">
        <button class="icon-btn" id="hc-prev" style="width:30px;height:30px;">\u2039</button>
        <div style="font-weight:700;font-size:13px;color:var(--text-0);">${monthLabel}</div>
        <button class="icon-btn" id="hc-next" style="width:30px;height:30px;">\u203a</button>
      </div>
    `);
    container.appendChild(head);

    const grid = fmt(`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;"></div>`);
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d) => {
      grid.appendChild(fmt(`<div style="text-align:center;font-size:10px;color:var(--text-3);font-weight:700;">${d}</div>`));
    });
    for (let i = 0; i < firstWeekday; i++) grid.appendChild(fmt(`<div></div>`));
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const isFuture = d > today;
      const isToday = d.toDateString() === today.toDateString();
      const active = activeDays.has(d.toDateString());
      const cell = fmt(`
        <div style="aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;
          ${active ? 'background:linear-gradient(135deg,var(--cyan),var(--green));color:#04211e;' : isFuture ? 'color:var(--text-3);' : 'color:var(--text-2);border:1px solid var(--line);'}
          ${isToday && !active ? 'border-color:var(--cyan);color:var(--cyan);' : ''}">${day}</div>
      `);
      grid.appendChild(cell);
    }
    container.appendChild(grid);

    container.querySelector('#hc-prev').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() - 1); render(); });
    container.querySelector('#hc-next').addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() + 1); render(); });
  }
  render();
}

/* ==========================================================================
   Recovery Timeline — a visual record of the journey, built entirely from
   data the app already has (Data.getRecoveryTimelineEvents in storage.js).
   Deliberately includes setbacks alongside milestones, framed as part of
   the story rather than hidden — "progress and learning, not a perfect
   streak," per the feature's own brief.
   ========================================================================== */

const TimelineIcons = {
  start: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/></svg>',
  'first-urge': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 22h20L12 2z"/></svg>',
  milestone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  setback: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
};
const TIMELINE_TINT = {
  start: { bg: 'rgba(52,224,214,0.14)', color: 'var(--cyan)' },
  'first-urge': { bg: 'rgba(232,121,201,0.14)', color: 'var(--accent-magenta)' },
  milestone: { bg: 'rgba(242,197,114,0.14)', color: 'var(--amber)' },
  journal: { bg: 'rgba(139,227,168,0.14)', color: 'var(--green)' },
  setback: { bg: 'rgba(239,139,111,0.14)', color: 'var(--coral)' },
};

function renderRecoveryTimeline() {
  const events = Data.getRecoveryTimelineEvents().slice().reverse(); // newest first
  const wrap = fmt(`
    <div class="activity-screen fade-in">
      <div class="activity-header">
        <div class="title">Recovery Timeline</div>
        <button class="icon-btn" id="timeline-close" aria-label="Close">\u2715</button>
      </div>
      <div class="screen-scroll" style="padding-top:var(--space-3);">
        <p style="color:var(--text-2);font-size:12.5px;line-height:1.5;margin:0 0 var(--space-4);">Your journey so far — progress and learning, not a perfect streak. Difficult moments are part of the story too.</p>
        <div id="timeline-list"></div>
      </div>
    </div>
  `);
  wrap.querySelector('#timeline-close').addEventListener('click', () => App.closeOverlay());

  const list = wrap.querySelector('#timeline-list');
  if (!events.length) {
    list.appendChild(fmt(`<div class="empty-state">Your timeline will fill in as you use the app — nothing to show yet.</div>`));
    return wrap;
  }

  events.forEach((ev, idx) => {
    const tint = TIMELINE_TINT[ev.type] || TIMELINE_TINT.milestone;
    const d = new Date(ev.date);
    const row = fmt(`
      <div style="display:flex;gap:var(--space-3);">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
          <div style="width:36px;height:36px;border-radius:50%;background:${tint.bg};color:${tint.color};display:flex;align-items:center;justify-content:center;">
            <span style="width:18px;height:18px;">${TimelineIcons[ev.type] || TimelineIcons.milestone}</span>
          </div>
          ${idx < events.length - 1 ? `<div style="width:2px;flex:1;background:var(--line);margin:4px 0;"></div>` : ''}
        </div>
        <div class="card-glass" style="flex:1;margin-bottom:var(--space-3);padding:var(--space-3);">
          <div style="font-weight:700;font-size:13.5px;color:var(--text-0);">${escapeHtml(ev.title)}</div>
          <div style="color:var(--text-2);font-size:11px;margin-top:2px;">${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          ${ev.detail ? `<div style="color:var(--text-1);font-size:12px;margin-top:6px;line-height:1.4;">${escapeHtml(ev.detail)}</div>` : ''}
        </div>
      </div>
    `);
    list.appendChild(row);
  });

  return wrap;
}

/* ==========================================================================
   User Dashboard — profile picture (stored locally as a compressed data
   URL, never uploaded anywhere), an editable display name, the existing
   Resistance Level stats, and a capped notification history. Opened from
   the avatar button top-left of Home, and from Settings → Account.
   ========================================================================== */

const DashIcons = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
};

function timeAgo(ts) {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscale + center-crop to a square JPEG data URL so a profile photo
// stays small in localStorage regardless of the original photo's size.
async function compressToSquareDataUrl(file, size) {
  const img = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(size / img.width, size / img.height);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function renderUserDashboard() {
  const wrap = fmt(`
    <div class="activity-screen fade-in">
      <div class="activity-header">
        <div class="title">Your Dashboard</div>
        <button class="icon-btn" id="dash-close" aria-label="Close">✕</button>
      </div>
      <div class="screen-scroll" id="dash-body" style="padding-top:var(--space-3);"></div>
    </div>
  `);
  wrap.querySelector('#dash-close').addEventListener('click', () => App.closeOverlay());
  renderDashboardBody(wrap.querySelector('#dash-body'));
  return wrap;
}

function renderDashboardBody(body) {
  body.innerHTML = '';
  const name = Data.getProfileName();
  const pic = Data.getProfilePic();
  const user = window.Auth && Auth.available() ? Auth.getCurrentUser() : null;
  const initial = ((name || (user && user.email) || '').trim()[0] || '').toUpperCase();
  const rl = Data.getResistanceStats();
  const stats = Data.getStats();
  const achievements = Data.getAchievements();
  const earnedAchievements = achievements.filter((a) => a.done);

  /* ---------------- Profile header ---------------- */
  const header = fmt(`
    <div class="card-glass" style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4);padding:var(--space-4);">
      <div class="glow-halo" style="--glow-color:var(--cyan);"></div>
      <div style="position:relative;z-index:1;flex-shrink:0;">
        <div id="dash-avatar" style="width:60px;height:60px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,var(--cyan),var(--green));display:flex;align-items:center;justify-content:center;color:#04211e;font-weight:800;font-size:22px;">
          ${pic ? `<img src="${pic}" style="width:100%;height:100%;object-fit:cover;" />` : (initial ? escapeHtml(initial) : NavIcons.user)}
        </div>
        <button id="dash-avatar-edit" aria-label="Change photo" style="position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:var(--bg-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text-1);">${DashIcons.camera}</button>
        <input type="file" accept="image/*" id="dash-avatar-input" style="display:none;" />
      </div>
      <div style="position:relative;z-index:1;flex:1;min-width:0;">
        <div id="dash-name-row" style="display:flex;align-items:center;gap:6px;">
          <div class="line1" style="font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name || 'Add your name')}</div>
        </div>
        <div style="color:var(--text-2);font-size:11.5px;margin-top:2px;">
          ${user ? escapeHtml(user.email || 'Signed in') : `Guest \u00b7 <button id="dash-signin-link" style="background:none;border:none;padding:0;color:var(--cyan);font-size:11.5px;font-weight:600;">Sign in</button>`}
        </div>
      </div>
      <button class="btn btn-secondary" id="dash-edit-profile" style="position:relative;z-index:1;padding:8px 14px;font-size:12px;flex-shrink:0;">Edit Profile</button>
    </div>
  `);
  body.appendChild(header);

  if (header.querySelector('#dash-signin-link')) {
    header.querySelector('#dash-signin-link').addEventListener('click', () => App.openAccount(() => App.openUserDashboard()));
  }

  header.querySelector('#dash-avatar-edit').addEventListener('click', () => header.querySelector('#dash-avatar-input').click());
  header.querySelector('#dash-avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressToSquareDataUrl(file, 256);
      Data.setProfilePic(dataUrl);
      renderDashboardBody(body);
      App.toast('Profile photo updated');
    } catch (err) {
      console.error('Profile photo update failed', err);
      App.toast('Could not use that photo');
    }
  });
  header.querySelector('#dash-edit-profile').addEventListener('click', () => {
    const row = header.querySelector('#dash-name-row');
    row.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'auth-input';
    input.style.cssText = 'background:var(--bg-3);border:1px solid var(--line);border-radius:var(--radius-s);padding:6px 10px;font-size:14px;width:100%;';
    input.value = name || '';
    input.maxLength = 40;
    input.placeholder = 'Your name';
    row.appendChild(input);
    input.focus();
    const commit = () => { Data.setProfileName(input.value.trim()); renderDashboardBody(body); };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
  });

  /* ---------------- Resistance Level ---------------- */
  body.appendChild(fmt(`<p class="section-title" style="margin-top:0;">Resistance Level</p>`));
  const levelCard = fmt(`
    <div class="card-glass" style="padding:var(--space-4);">
      <div class="glow-halo" style="--glow-color:var(--accent-violet);"></div>
      <div style="position:relative;z-index:1;display:flex;align-items:center;gap:var(--space-3);">
        ${ringSvg({ percent: Math.round(rl.progressToNext * 100), size: 68, strokeWidth: 6, colorVar: '--cyan', label: rl.level, sublabel: 'LVL' }).outerHTML}
        <div style="flex:1;min-width:0;">
          <div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:var(--text-0);">${escapeHtml(rl.levelName)}</div>
          <div style="color:var(--cyan);font-size:12px;font-weight:600;margin-top:1px;">${rl.points} points</div>
          <div style="color:var(--text-2);font-size:10.5px;margin-top:2px;">${rl.nextLevelName ? `${rl.pointsToNext} to ${escapeHtml(rl.nextLevelName)}` : 'Top level reached'}</div>
        </div>
      </div>
      <button class="btn-ghost btn" id="dash-view-levels" style="position:relative;z-index:1;width:100%;margin-top:var(--space-3);font-size:12px;">View full level system</button>
    </div>
  `);
  body.appendChild(levelCard);
  levelCard.querySelector('#dash-view-levels').addEventListener('click', () => renderLevelSystemOverlay(rl.level));

  /* ---------------- Personal stats ---------------- */
  body.appendChild(fmt(`<p class="section-title">Your stats</p>`));
  body.appendChild(fmt(`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
      <div class="stat"><div class="num">${Data.getSupportUsedCount()}</div><div class="lbl">Support sessions</div></div>
      <div class="stat"><div class="num">${stats.totalSessions}</div><div class="lbl">Activities completed</div></div>
      <div class="stat"><div class="num">${Data.getJournalEntries().length}</div><div class="lbl">Journal entries</div></div>
      <div class="stat"><div class="num">${earnedAchievements.length}/${achievements.length}</div><div class="lbl">Achievements</div></div>
    </div>
  `));

  /* ---------------- Achievements ---------------- */
  body.appendChild(fmt(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:var(--space-4);margin-bottom:var(--space-2);">
      <p class="section-title" style="margin:0;">Achievements</p>
      <button class="btn-ghost btn" id="dash-view-achievements" style="font-size:11.5px;padding:4px 10px;">View All</button>
    </div>
  `));
  const badgeGrid = fmt(`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;"></div>`);
  achievements.slice(0, 8).forEach((a) => {
    badgeGrid.appendChild(fmt(`
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;">
        <div style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;
          ${a.done ? 'background:linear-gradient(135deg,var(--cyan),var(--accent-violet));box-shadow:0 0 14px rgba(52,224,214,0.4);' : 'background:var(--bg-3);border:1px solid var(--line);opacity:0.45;'}">
          ${a.done ? '\ud83c\udfc6' : '\ud83d\udd12'}
        </div>
        <div style="font-size:9px;color:var(--text-2);line-height:1.2;">${escapeHtml(a.title)}</div>
      </div>
    `));
  });
  body.appendChild(badgeGrid);
  body.querySelector('#dash-view-achievements').addEventListener('click', () => renderAchievementsOverlay());

  /* ---------------- Weekly activity ---------------- */
  body.appendChild(fmt(`<p class="section-title">This week</p>`));
  const weekCard = fmt(`<div class="card" style="padding:var(--space-3);"></div>`);
  body.appendChild(weekCard);
  const dayCounts = [];
  const dayLabels = [];
  const allSessions = Data.getSessions();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayLabels.push(d.toLocaleDateString(undefined, { weekday: 'narrow' }));
    dayCounts.push(allSessions.filter((s) => new Date(s.date).toDateString() === d.toDateString()).length);
  }
  weekCard.appendChild(renderWeeklyBarChart(dayCounts, dayLabels));

  /* ---------------- Recent activity ---------------- */
  body.appendChild(fmt(`<p class="section-title">Recent activity</p>`));
  const recentCard = fmt(`<div class="card" style="padding:0;"></div>`);
  body.appendChild(recentCard);
  const recent = allSessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  if (!recent.length) {
    recentCard.appendChild(fmt(`<div style="padding:var(--space-3);color:var(--text-2);font-size:12.5px;text-align:center;">Nothing yet — your activity will show up here.</div>`));
  } else {
    recent.forEach((s, idx) => {
      const a = getActivityById(s.activityId);
      const label = a ? a.name : friendlyDistractionLabel(s.activityId);
      recentCard.appendChild(fmt(`
        <div class="list-row"${idx < recent.length - 1 ? ' style="border-bottom:1px solid var(--line);"' : ''}>
          <div class="label" style="font-size:13px;">${escapeHtml(label)}</div>
          <div style="color:var(--text-3);font-size:10.5px;">${timeAgo(new Date(s.date).getTime())}</div>
        </div>
      `));
    });
  }

  /* ---------------- Account settings ---------------- */
  body.appendChild(fmt(`<p class="section-title">Account</p>`));
  const settingsCard = fmt(`<div class="card" style="padding:0;"></div>`);
  const settingsItems = [
    { label: 'Edit Profile', action: () => header.querySelector('#dash-edit-profile').click() },
    { label: 'Notifications', action: () => { App.closeOverlay(); App.goToTab('settings', { highlightNotif: true }); } },
    { label: 'Privacy & Security', action: () => { App.closeOverlay(); App.goToTab('settings', { highlightAnalytics: true }); } },
    { label: 'App Settings', action: () => { App.closeOverlay(); App.goToTab('settings'); } },
  ];
  settingsItems.forEach((item, idx) => {
    const row = fmt(`
      <div class="list-row card-tap"${idx < settingsItems.length - 1 ? ' style="border-bottom:1px solid var(--line);"' : ''}>
        <div class="label" style="font-size:13.5px;">${escapeHtml(item.label)}</div>
        <span style="color:var(--text-2);">${NavIcons.chevronRight}</span>
      </div>
    `);
    row.addEventListener('click', item.action);
    settingsCard.appendChild(row);
  });
  body.appendChild(settingsCard);

  /* ---------------- Sign out ---------------- */
  if (user) {
    const signOutBtn = fmt(`<button class="btn btn-secondary btn-block" id="dash-signout" style="margin-top:var(--space-4);">Sign out</button>`);
    body.appendChild(signOutBtn);
    signOutBtn.addEventListener('click', async () => {
      await Auth.signOutUser();
      renderDashboardBody(body);
      App.toast('Signed out');
    });
  }
}

// Full level list — reached via "View full level system" on the Dashboard.
function renderLevelSystemOverlay(currentLevel) {
  const wrap = fmt(`
    <div class="popup-backdrop fade-in" id="levels-backdrop">
      <div class="popup-card" style="max-width:340px;">
        <div class="h1" style="font-size:17px;">Resistance Levels</div>
        <div id="levels-list" style="display:flex;flex-direction:column;gap:8px;text-align:left;"></div>
        <button class="btn btn-ghost btn-block" id="levels-close">Close</button>
      </div>
    </div>
  `);
  const list = wrap.querySelector('#levels-list');
  Data.getResistanceTiers().forEach((t) => {
    const isCurrent = t.level === currentLevel;
    list.appendChild(fmt(`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-s);${isCurrent ? 'background:rgba(52,224,214,0.12);border:1px solid rgba(52,224,214,0.3);' : ''}">
        <div style="width:26px;height:26px;border-radius:50%;background:${isCurrent ? 'linear-gradient(135deg,var(--cyan),var(--green))' : 'var(--bg-3)'};color:${isCurrent ? '#04211e' : 'var(--text-2)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;">${t.level}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:var(--text-0);">${escapeHtml(t.name)}</div>
          <div style="font-size:10.5px;color:var(--text-2);">${t.min}+ points</div>
        </div>
      </div>
    `));
  });
  wrap.querySelector('#levels-close').addEventListener('click', () => wrap.remove());
  wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
}

// Full achievements list — reached via "View All" on the Dashboard.
function renderAchievementsOverlay() {
  const achievements = Data.getAchievements();
  const wrap = fmt(`
    <div class="activity-screen fade-in" id="achievements-overlay" style="z-index:600;">
      <div class="activity-header">
        <div class="title">Achievements</div>
        <button class="icon-btn" id="ach-close" aria-label="Close">\u2715</button>
      </div>
      <div class="screen-scroll" id="ach-body" style="padding-top:var(--space-3);"></div>
    </div>
  `);
  const list = wrap.querySelector('#ach-body');
  achievements.forEach((a) => {
    list.appendChild(fmt(`
      <div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:var(--space-3);${a.done ? '' : 'opacity:0.55;'}">
        <div style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;
          ${a.done ? 'background:linear-gradient(135deg,var(--cyan),var(--accent-violet));box-shadow:0 0 14px rgba(52,224,214,0.4);' : 'background:var(--bg-3);border:1px solid var(--line);'}">
          ${a.done ? '\ud83c\udfc6' : '\ud83d\udd12'}
        </div>
        <div style="flex:1;">
          <div style="font-size:13.5px;font-weight:700;color:var(--text-0);">${escapeHtml(a.title)}</div>
          <div style="font-size:11.5px;color:var(--text-2);margin-top:2px;">${escapeHtml(a.desc)}</div>
          ${a.done && a.date ? `<div style="font-size:10px;color:var(--text-3);margin-top:3px;">Earned ${new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
        </div>
      </div>
    `));
  });
  wrap.querySelector('#ach-close').addEventListener('click', () => wrap.remove());
  document.body.appendChild(wrap);
}

// Shared by the Dashboard and the standalone Notifications screen (opened
// from the bell button on Home), so the two never drift out of sync.
function renderNotifHistorySection(body, opts) {
  const history = Data.getNotifHistory();
  body.appendChild(fmt(`<p class="section-title"${opts && opts.first ? ' style="margin-top:0;"' : ''}>Notification History</p>`));
  const notifCard = fmt(`<div class="card" style="padding:0;"></div>`);
  body.appendChild(notifCard);
  if (!history.length) {
    notifCard.appendChild(fmt(`<div style="padding:var(--space-3);color:var(--text-2);font-size:12.5px;text-align:center;">No notifications yet.</div>`));
  } else {
    history.forEach((n, idx) => {
      const row = fmt(`
        <div class="list-row"${idx < history.length - 1 ? ' style="border-bottom:1px solid var(--line);"' : ''}>
          <div style="min-width:0;">
            <div class="label" style="font-size:13.5px;">${escapeHtml(n.title)}</div>
            ${n.body ? `<div class="desc" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(n.body)}</div>` : ''}
          </div>
          <div style="color:var(--text-3);font-size:10.5px;flex-shrink:0;white-space:nowrap;margin-left:10px;">${timeAgo(n.ts)}</div>
        </div>
      `);
      notifCard.appendChild(row);
    });
  }
  if (history.length) {
    const clearBtn = fmt(`<button class="btn btn-ghost btn-block" id="dash-clear-notif" style="margin-top:var(--space-2);border-color:rgba(239,139,111,0.4);color:var(--coral);">Clear notifications</button>`);
    body.appendChild(clearBtn);
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear your notification history?')) {
        Data.clearNotifHistory();
        body.innerHTML = '';
        renderNotifHistorySection(body, opts);
      }
    });
  }
}

// Standalone screen, opened from the bell button next to the avatar on
// Home — same history/clear behavior as the section inside the Dashboard.
function renderNotificationsScreen() {
  const wrap = fmt(`
    <div class="activity-screen fade-in">
      <div class="activity-header">
        <div class="title">Notifications</div>
        <button class="icon-btn" id="notifs-close" aria-label="Close">✕</button>
      </div>
      <div class="screen-scroll" id="notifs-body" style="padding-top:var(--space-3);"></div>
    </div>
  `);
  wrap.querySelector('#notifs-close').addEventListener('click', () => App.closeOverlay());
  const body = wrap.querySelector('#notifs-body');
  renderNotifHistorySection(body, { first: true });
  // The cold-launch/resume sync (getDeliveredNotifications) is fire-and-
  // forget and can still be in flight when the bell is tapped moments
  // later — that race is exactly why a notification that was sitting
  // right there in the tray could show "No notifications yet" here. Force
  // a fresh sync now and re-render once it lands, instead of trusting
  // whatever was already in storage at the moment this screen opened.
  if (window.App && App.syncNotificationHistory) {
    App.syncNotificationHistory().then(() => {
      if (!wrap.isConnected) return;
      body.innerHTML = '';
      renderNotifHistorySection(body, { first: true });
    });
  }
  Data.markNotifViewed(); // clears the unread badge on the bell
  return wrap;
}

/* ==========================================================================
   Flows — the full-screen takeovers: Urge Mode, the activity runner that
   wraps every game/exercise with a consistent header/footer + outcome
   check-in, and first-run onboarding.
   ========================================================================== */

/* ============================== ANALYTICS PROMPT ============================== */
/* Shown once, the first time someone reaches Home (after onboarding, and
   after the login gate so it never competes with that flow). Small popup,
   not a full takeover — Home stays visible, dimmed, behind it. Tapping
   "Turn On" does NOT flip the toggle itself: it navigates to Settings and
   highlights the real control there, so the actual opt-in still happens
   as one deliberate tap on the toggle, not a tap on this popup. */
function renderAnalyticsPrompt(onDismiss) {
  const wrap = fmt(`<div class="popup-backdrop fade-in"></div>`);
  const card = fmt(`
    <div class="popup-card">
      <div class="h1">Help improve UrgeAway?</div>
      <div class="desc">
        UrgeAway can share anonymous usage data — just counts of which features get used, like an activity being completed. It never includes your journal entries, never which apps you lock in Lock In Mode, and it's never tied to your identity. It's entirely optional, and off unless you turn it on.
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-block" id="ap-turn-on">Turn On in Settings</button>
        <button class="btn btn-ghost btn-block" id="ap-not-now">Not now</button>
      </div>
    </div>
  `);
  wrap.appendChild(card);

  wrap.querySelector('#ap-turn-on').addEventListener('click', () => {
    Data.setAnalyticsPromptShown();
    onDismiss({ goToPrivacy: true });
  });
  wrap.querySelector('#ap-not-now').addEventListener('click', () => {
    Data.setAnalyticsPromptShown();
    onDismiss({ goToPrivacy: false });
  });

  return wrap;
}


/* Shown for a moment on every app launch — the swoosh mark draws itself
   from start to end, then fades out. Pure SVG/CSS, no native assets. */
function renderSplashScreen(onDone) {
  const wrap = fmt(`
    <div style="position:fixed;inset:0;z-index:500;background:var(--bg-0);display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 1024 1024" width="150" height="150">
        <path id="splash-path" d="M230 620 C330 340 560 760 800 380"
          fill="none" stroke="url(#splashGrad)" stroke-width="70" stroke-linecap="round"/>
        <defs>
          <linearGradient id="splashGrad" x1="0" y1="0" x2="1024" y2="1024">
            <stop offset="0%" stop-color="#34e0d6"/>
            <stop offset="100%" stop-color="#8be3a8"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  `);

  requestAnimationFrame(() => {
    const path = wrap.querySelector('#splash-path');
    const length = path.getTotalLength();
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);
    path.getBoundingClientRect(); // force reflow so the transition below actually animates
    path.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.22,1,0.36,1)';
    requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
  });

  setTimeout(() => {
    wrap.style.transition = 'opacity 0.4s ease';
    wrap.style.opacity = '0';
    setTimeout(() => {
      wrap.remove();
      if (onDone) onDone();
    }, 400);
  }, 2400);

  return wrap;
}

/* ============================== LOGIN GATE ============================== */
/* Shown first, before onboarding, unless already signed in or already
   skipped once. Skipping is always one tap away — nothing here blocks use
   of the app. */
function renderLoginGate() {
  const wrap = fmt(`<div class="onboard"></div>`);

  const body = fmt(`
    <div class="onboard-body fade-in" style="justify-content:flex-start;padding-top:var(--space-6);">
      <div id="lg-account" style="width:100%;"></div>
    </div>
  `);
  wrap.appendChild(body);

  const footer = fmt(`<div class="onboard-footer"><button class="btn btn-ghost btn-block" id="lg-skip">Skip for now</button></div>`);
  footer.querySelector('#lg-skip').addEventListener('click', finish);
  wrap.appendChild(footer);

  renderAccountBody(body.querySelector('#lg-account'), finish);

  function finish() {
    Data.setLoginPromptShown();
    App.completeLoginGate();
  }

  return wrap;
}

/* ============================== URGE MODE ============================== */
/* Per the "no menu" design: press the button, get something immediately.
   No category choice, no activity choice. If they're still having the urge
   afterward, it loops straight into another one — never back to Home. */
const CHECKIN_MOODS = [
  { v: 'good', label: 'Good', emoji: '\ud83d\ude0a' },
  { v: 'okay', label: 'Okay', emoji: '\ud83d\ude10' },
  { v: 'low', label: 'Low', emoji: '\ud83d\ude14' },
  { v: 'stressed', label: 'Stressed', emoji: '\ud83d\ude23' },
  { v: 'tired', label: 'Tired', emoji: '\ud83d\ude34' },
];

// Standalone daily check-in — not urge-triggered, just "how are you right
// now." Same small popup pattern as the analytics prompt (dimmed backdrop,
// centered card), reused here since it's the same "quick tap-through,
// nothing to type" shape.
function renderQuickCheckIn(onDone) {
  const wrap = fmt(`<div class="popup-backdrop fade-in"></div>`);
  const card = fmt(`
    <div class="popup-card">
      <div class="h1" style="font-size:17px;">Check in with yourself</div>
      <div class="desc">How are you feeling right now?</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        ${CHECKIN_MOODS.map((m) => `<button class="choice-pill" data-v="${m.v}" style="font-size:13px;">${m.emoji} ${m.label}</button>`).join('')}
      </div>
      <button class="btn btn-ghost btn-block" id="ci-skip" style="margin-top:4px;">Not now</button>
    </div>
  `);
  wrap.appendChild(card);
  card.querySelectorAll('.choice-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      Data.addCheckIn(btn.getAttribute('data-v'));
      onDone(true);
    });
  });
  card.querySelector('#ci-skip').addEventListener('click', () => onDone(false));
  return wrap;
}

const TRIGGER_OPTIONS = ['Stress', 'Boredom', 'Loneliness', 'Anger', 'Tiredness', 'Habit / autopilot', 'Something I saw', 'After an argument', 'Alone at home', 'Other'];

// Shared by both runner outcome screens — an optional numeric re-check
// ("where's the intensity now?") so a before/after comparison exists when
// the flow started from a known intensity. Purely additive: if the person
// skips it, intensityAfter just stays unset on the session, same as today.
function renderIntensityRecheck(container, startIntensity, onChange) {
  if (startIntensity == null) return;
  const wrap = fmt(`
    <div style="width:100%;max-width:320px;margin-top:2px;">
      <div style="color:var(--focus-text-2);font-size:11.5px;text-align:center;margin-bottom:6px;">Where's the intensity now? (optional)</div>
      <div id="recheck-pills" style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;"></div>
    </div>
  `);
  container.appendChild(wrap);
  const pillsWrap = wrap.querySelector('#recheck-pills');
  for (let n = 1; n <= 10; n++) {
    const pill = document.createElement('button');
    pill.className = 'choice-pill';
    pill.style.minWidth = '28px';
    pill.style.fontSize = '12px';
    pill.textContent = String(n);
    pill.addEventListener('click', () => {
      pillsWrap.querySelectorAll('.choice-pill').forEach((p) => p.classList.remove('selected'));
      pill.classList.add('selected');
      onChange(n);
    });
    pillsWrap.appendChild(pill);
  }
}

/* ---------------- Setback & Restart (not a failure screen) ----------------
   Reached from an outcome step's "It happened" option. Deliberately short
   — three optional prompts, no required fields, no streak/points penalty
   anywhere in here. Ends with an explicit choice to start a new session or
   just head back, never auto-launches anything. */
function renderSetbackReflection(prefillIntensity, onDone) {
  let trigger = null;
  const wrap = fmt(`
    <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:16px;max-width:320px;margin:0 auto;">
      <div class="line1" style="font-size:17px;text-align:center;">That happened. It doesn't erase the work you've done.</div>
      <div style="color:var(--focus-text-2);font-size:13px;text-align:center;line-height:1.5;">A few optional questions, just for you — nothing here is required.</div>
      <div style="width:100%;">
        <div style="color:var(--focus-text-1);font-size:12.5px;font-weight:600;margin-bottom:6px;">What may have triggered it?</div>
        <div id="sb-triggers" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
      </div>
      <textarea class="journal-input" id="sb-happened" placeholder="What happened? (optional)" style="width:100%;min-height:54px;font-size:13.5px;"></textarea>
      <textarea class="journal-input" id="sb-different" placeholder="What could you do differently next time? (optional)" style="width:100%;min-height:54px;font-size:13.5px;"></textarea>
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;">
        <button class="btn btn-primary btn-block" id="sb-restart">Begin a new session now</button>
        <button class="btn btn-ghost btn-block" id="sb-later">Not right now</button>
      </div>
    </div>
  `);
  const triggerWrap = wrap.querySelector('#sb-triggers');
  TRIGGER_OPTIONS.forEach((t) => {
    const chip = document.createElement('button');
    chip.className = 'choice-pill';
    chip.style.fontSize = '12px';
    chip.textContent = t;
    chip.addEventListener('click', () => {
      trigger = trigger === t ? null : t;
      triggerWrap.querySelectorAll('.choice-pill').forEach((p) => p.classList.remove('selected'));
      if (trigger) chip.classList.add('selected');
    });
    triggerWrap.appendChild(chip);
  });

  function save() {
    Data.addSetback({
      trigger,
      whatHappened: wrap.querySelector('#sb-happened').value.trim(),
      whatDifferent: wrap.querySelector('#sb-different').value.trim(),
    });
  }
  wrap.querySelector('#sb-restart').addEventListener('click', () => {
    save();
    onDone(true);
  });
  wrap.querySelector('#sb-later').addEventListener('click', () => {
    save();
    onDone(false);
  });
  return wrap;
}

function renderUrgeMode() {
  const wrap = fmt(`
    <div class="urge-mode fade-in">
      <button class="urge-mode-close" id="urge-close" aria-label="Close">✕</button>
      <div class="urge-mode-body" id="urge-stage">
        <div class="morph-wrap" id="morph-wrap"></div>
        <div class="line1" id="urge-line1">You don't have to figure everything out right now.</div>
        <div class="line2" style="margin-top:8px;" id="urge-line2">Okay. Let's get your mind somewhere else.</div>
      </div>
    </div>
  `);

  wrap.querySelector('#urge-close').addEventListener('click', () => App.closeOverlay());

  // Signature moment: the chaotic wave settles into a calm breathing circle
  // while the two lines above hand off to each other.
  const morphWrap = wrap.querySelector('#morph-wrap');
  morphWrap.innerHTML = `
    <svg viewBox="0 0 220 220" width="220" height="220">
      <path id="urge-wave" d="M10 110 C 40 60, 70 60, 95 110 S 150 160, 180 110 S 210 60, 210 60"
        fill="none" stroke="#ef8b6f" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
      <circle id="urge-circle" cx="110" cy="110" r="0" fill="url(#urgeGrad)" opacity="0"/>
      <defs>
        <radialGradient id="urgeGrad">
          <stop offset="0%" stop-color="#8be3a8"/>
          <stop offset="100%" stop-color="#34e0d6"/>
        </radialGradient>
      </defs>
    </svg>`;
  const waveEl = wrap.querySelector('#urge-wave');
  const circleEl = wrap.querySelector('#urge-circle');
  wrap.querySelector('#urge-line2').style.opacity = '0';
  requestAnimationFrame(() => {
    waveEl.style.transition = 'opacity 1.1s ease, d 1.1s ease';
    waveEl.style.opacity = '0';
    circleEl.style.transition = 'r 1.2s cubic-bezier(0.22,1,0.36,1), opacity 1.2s ease';
    setTimeout(() => { circleEl.setAttribute('opacity', '0.85'); circleEl.setAttribute('r', '46'); }, 200);
  });
  setTimeout(() => {
    const l1 = wrap.querySelector('#urge-line1');
    const l2 = wrap.querySelector('#urge-line2');
    if (l1) l1.style.transition = 'opacity 0.5s ease';
    if (l1) l1.style.opacity = '0';
    if (l2) { l2.style.transition = 'opacity 0.5s ease'; l2.style.opacity = '1'; }
  }, 1000);

  // No menu, no waiting for a tap on the wave itself — but a single quick
  // step first: a reminder of "why" (if they've saved any) plus an
  // optional intensity check, both in one screen so it stays fast.
  setTimeout(() => {
    showPreDistractionStep();
  }, 1900);

  function showPreDistractionStep() {
    const reasons = Data.getReasons();
    const stage = wrap.querySelector('#urge-stage');
    let intensity = null;
    let trigger = null;
    stage.innerHTML = '';
    const stepWrap = fmt(`
      <div class="fade-in" style="display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;">
        ${reasons.length ? `
          <div style="max-width:300px;">
            <div style="color:var(--focus-text-2);font-size:11.5px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Remember why</div>
            ${pickN(reasons, Math.min(3, reasons.length)).map((r) => `<div style="color:var(--focus-text-0);font-size:15px;font-weight:600;margin-bottom:5px;">${escapeHtml(r)}</div>`).join('')}
          </div>
        ` : ''}
        <div class="line1" style="font-size:16px;">How intense does this feel right now?</div>
        <div id="intensity-pills" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:290px;"></div>
        <div style="width:100%;max-width:300px;">
          <div style="color:var(--focus-text-2);font-size:11.5px;text-align:center;margin-bottom:8px;">What's behind it? (optional)</div>
          <div id="trigger-pills" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;"></div>
        </div>
        <button class="btn btn-primary" id="pre-continue" style="max-width:220px;">Continue</button>
      </div>
    `);
    stage.appendChild(stepWrap);
    const pillsWrap = stepWrap.querySelector('#intensity-pills');
    for (let n = 1; n <= 10; n++) {
      const pill = document.createElement('button');
      pill.className = 'choice-pill';
      pill.style.minWidth = '32px';
      pill.textContent = String(n);
      pill.addEventListener('click', () => {
        intensity = n;
        pillsWrap.querySelectorAll('.choice-pill').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
      });
      pillsWrap.appendChild(pill);
    }
    const triggerPillsWrap = stepWrap.querySelector('#trigger-pills');
    TRIGGER_OPTIONS.forEach((t) => {
      const chip = document.createElement('button');
      chip.className = 'choice-pill';
      chip.style.fontSize = '12px';
      chip.textContent = t;
      chip.addEventListener('click', () => {
        trigger = trigger === t ? null : t;
        triggerPillsWrap.querySelectorAll('.choice-pill').forEach((p) => p.classList.remove('selected'));
        if (trigger) chip.classList.add('selected');
      });
      triggerPillsWrap.appendChild(chip);
    });
    stepWrap.querySelector('#pre-continue').addEventListener('click', () => {
      const lockDurationSec = intensity ? Data.getUrgeLockDurationSec(intensity) : null;
      if (lockDurationSec) {
        showUrgeLockConfirm(intensity, trigger);
      } else {
        App.launchUrgeRescue({ intensity, trigger });
      }
    });

    // Intensity 7-10: confirm before handing off to Urge Lock (Screen
    // Pinning + timed session). Intensity 1-6 never reaches this function.
    function showUrgeLockConfirm(intensity, trigger) {
      stage.innerHTML = '';
      stage.appendChild(UrgeLock.renderConfirm(intensity, trigger, () => {
        // Cancel: fall back to the same fixed rescue sequence used by the
        // default (intensity 1-6) path, rather than Urge Lock never having
        // been offered.
        App.launchUrgeRescue({ intensity, trigger });
      }));
    }
  }

  return wrap;
}

/* ============================== DISTRACTION RUNNER (loop) ============================== */
/* Self-contained: runs a random distraction, shows a 3-option check-in,
   and either finishes or immediately runs another one — per spec, "still
   having the urge" never routes back to Home. */
/* ---------------- Urge Rescue Sequence ----------------
   The fixed, ordered version of the distraction loop used specifically
   from the main "I HAVE AN URGE" flow (intensity 1-6): Breathing, then
   three specific mini-games in a set order, then exactly one "how are you
   feeling" check at the very end — not after every stage, the way the
   general distraction loop works.

   Deliberately no visible timer/countdown anywhere in this screen. The
   6-minute floor is enforced by quietly checking elapsed time once the
   base sequence ends and, if it's come in short, continuing with a couple
   more rounds before ever showing the outcome screen — nothing on screen
   ever announces this is happening. */
function renderUrgeRescueRunner(meta) {
  meta = meta || {};
  const MIN_DURATION_MS = 6 * 60 * 1000;
  const sequenceStartedAt = Date.now();

  // Slot 1 (breathing) is always first and fixed. Slots 2-4 are filled by
  // shuffling 3 distinct games out of this pool each time the flow runs —
  // old games plus the new premium ones, all tuned to run ~90-120s each
  // with progress indicators hidden (see each game's hideProgress opt).
  const GAME_POOL = [
    { id: 'gridmemory', run: (c, done) => runGridMemory(c, done, { rounds: 6, hideProgress: true }) },
    { id: 'movingtarget', run: (c, done) => runMovingTarget(c, done, { totalTaps: 30, hideProgress: true }) },
    { id: 'colortap', run: (c, done) => runColorTap(c, done, { rounds: 20, hideProgress: true }) },
    { id: 'impossiblechoice', run: (c, done) => runImpossibleChoice(c, done, { rounds: 9, hideProgress: true }) },
    { id: 'wordscramble', run: (c, done) => runWordScramble(c, done, { rounds: 8, hideProgress: true }) },
    { id: 'mentalrotation', run: (c, done) => runMentalRotation(c, done, { rounds: 6, hideProgress: true }) },
    { id: 'visualsudoku', run: (c, done) => runVisualSudoku(c, done, { rounds: 2, hideProgress: true }) },
    { id: 'logicdetective', run: (c, done) => runLogicDetective(c, done, { rounds: 4, hideProgress: true }) },
    { id: 'pathfinder', run: (c, done) => runPathFinder(c, done, { rounds: 3, hideProgress: true }) },
  ];
  const TOPUP_POOL = [
    { id: 'gridmemory', run: (c, done) => runGridMemory(c, done, { rounds: 3, hideProgress: true }) },
    { id: 'movingtarget', run: (c, done) => runMovingTarget(c, done, { totalTaps: 16, hideProgress: true }) },
    { id: 'colortap', run: (c, done) => runColorTap(c, done, { rounds: 10, hideProgress: true }) },
    { id: 'impossiblechoice', run: (c, done) => runImpossibleChoice(c, done, { rounds: 4, hideProgress: true }) },
    { id: 'wordscramble', run: (c, done) => runWordScramble(c, done, { rounds: 4, hideProgress: true }) },
    { id: 'mentalrotation', run: (c, done) => runMentalRotation(c, done, { rounds: 3, hideProgress: true }) },
    { id: 'visualsudoku', run: (c, done) => runVisualSudoku(c, done, { rounds: 1, hideProgress: true }) },
    { id: 'logicdetective', run: (c, done) => runLogicDetective(c, done, { rounds: 2, hideProgress: true }) },
    { id: 'pathfinder', run: (c, done) => runPathFinder(c, done, { rounds: 1, hideProgress: true }) },
  ];
  function pickTopUp() { return [pick(TOPUP_POOL), pick(TOPUP_POOL), pick(TOPUP_POOL)]; }

  const baseQueue = [
    { id: 'breathing', run: (c, done) => runBreathing(c, done) },
    ...pickN(GAME_POOL, 3),
  ];
  let queue = baseQueue.slice();
  let qi = 0;

  const wrap = fmt(`
    <div class="activity-screen focus-mode fade-in">
      <div class="activity-header">
        <div class="title">Working through it</div>
        <button class="icon-btn" id="ur-close" aria-label="Close">\u2715</button>
      </div>
      <div class="activity-body" id="ur-body"></div>
    </div>
  `);
  const body = wrap.querySelector('#ur-body');
  let instance = null;

  wrap.querySelector('#ur-close').addEventListener('click', () => {
    if (instance && instance.onExit) instance.onExit();
    App.closeOverlay();
  });

  function runNext() {
    if (qi >= queue.length) {
      if (Date.now() - sequenceStartedAt < MIN_DURATION_MS) {
        queue = queue.concat(pickTopUp());
      } else {
        showOutcome();
        return;
      }
    }
    const step = queue[qi];
    qi += 1;
    instance = step.run(body, runNext) || {};
  }
  runNext();

  function showOutcome() {
    body.innerHTML = '';
    const outcomeWrap = fmt(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:18px;">
        <div class="prompt-text">How are you feeling now?</div>
        <div class="outcome-grid" style="max-width:340px;grid-template-columns:1fr;">
          <button class="outcome-btn" data-v="better">Better</button>
          <button class="outcome-btn" data-v="a_little_better">A little better</button>
          <button class="outcome-btn" data-v="still_having_urge">Still having the urge</button>
        </div>
        <button class="btn-ghost btn" id="ur-reach-out" style="font-size:12.5px;border-color:rgba(52,224,214,0.24);color:var(--focus-cyan);">Reach out to someone instead</button>
        <button class="btn-ghost btn" id="ur-setback" style="font-size:12px;color:var(--focus-text-2);">It happened \u2014 I acted on the urge</button>
      </div>
    `);
    body.appendChild(outcomeWrap);
    let intensityAfter = null;
    renderIntensityRecheck(outcomeWrap, meta.intensity, (v) => { intensityAfter = v; });

    outcomeWrap.querySelector('#ur-reach-out').addEventListener('click', () => App.triggerReachOut());
    outcomeWrap.querySelector('#ur-setback').addEventListener('click', () => {
      body.innerHTML = '';
      body.appendChild(renderSetbackReflection(meta.intensity, (restart) => {
        if (restart) { App.closeOverlay(); App.openUrgeMode(); }
        else { App.closeOverlay(); }
      }));
    });

    outcomeWrap.querySelectorAll('.outcome-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const outcome = b.getAttribute('data-v');
        const durationSec = Math.round((Date.now() - sequenceStartedAt) / 1000);
        Data.addSession({
          activityId: 'urge-rescue-sequence',
          category: 'urge-rescue',
          durationSec,
          outcome: outcome === 'still_having_urge' ? 'still_need_help' : outcome,
          fromUrgeMode: true,
          intensity: meta.intensity || null,
          intensityAfter: intensityAfter != null ? intensityAfter : undefined,
          trigger: meta.trigger || undefined,
        });
        if (window.Analytics) Analytics.logUrgeSessionCompleted();
        if (outcome === 'still_having_urge') {
          App.toast('Okay \u2014 let\u2019s try a bit more.');
          queue = queue.concat(pickTopUp());
          runNext();
        } else {
          App.closeOverlay();
          App.toast('Logged. Nice work showing up for yourself.');
        }
      });
    });
  }

  return wrap;
}


function renderDistractionRunner(meta) {
  meta = meta || {};
  const wrap = fmt(`
    <div class="activity-screen focus-mode fade-in">
      <div class="activity-header">
        <div class="title" id="dr-title">Focus</div>
        <button class="icon-btn" id="dr-close" aria-label="Close">✕</button>
      </div>
      <div class="activity-body" id="dr-body"></div>
    </div>
  `);

  let current = null;
  let instance = null;
  let startedAt = Date.now();

  wrap.querySelector('#dr-close').addEventListener('click', () => {
    if (instance && instance.onExit) instance.onExit();
    App.closeOverlay();
  });

  function runNext() {
    current = pickRandomDistraction();
    startedAt = Date.now();
    const body = wrap.querySelector('#dr-body');
    instance = current.run(body, showOutcome) || {};
  }

  function showOutcome() {
    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    const body = wrap.querySelector('#dr-body');
    body.innerHTML = '';
    const outcomeWrap = fmt(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:18px;">
        <div class="prompt-text">How are you feeling now?</div>
        <div class="outcome-grid" id="dr-outcome-grid" style="max-width:340px;grid-template-columns:1fr;">
          <button class="outcome-btn" data-v="better">Better</button>
          <button class="outcome-btn" data-v="a_little_better">A little better</button>
          <button class="outcome-btn" data-v="still_having_urge">Still having the urge</button>
        </div>
        <button class="btn-ghost btn" id="dr-add-note" style="font-size:12.5px;">+ Add a note about what almost got you (optional)</button>
        <div id="dr-note-wrap" class="hidden" style="width:100%;max-width:320px;"></div>
        <button class="btn-ghost btn" id="dr-reach-out" style="font-size:12.5px;border-color:rgba(52,224,214,0.24);color:var(--focus-cyan);">Reach out to someone instead</button>
        ${meta.fromUrgeMode ? `<button class="btn-ghost btn" id="dr-setback" style="font-size:12px;color:var(--focus-text-2);">It happened \u2014 I acted on the urge</button>` : ''}
      </div>
    `);
    body.appendChild(outcomeWrap);
    let intensityAfter = null;
    renderIntensityRecheck(outcomeWrap, meta.intensity, (v) => { intensityAfter = v; });

    outcomeWrap.querySelector('#dr-reach-out').addEventListener('click', () => App.triggerReachOut());
    const setbackBtn = outcomeWrap.querySelector('#dr-setback');
    if (setbackBtn) {
      setbackBtn.addEventListener('click', () => {
        body.innerHTML = '';
        body.appendChild(renderSetbackReflection(meta.intensity, (restart) => {
          if (restart) { App.closeOverlay(); App.openUrgeMode(); }
          else { App.closeOverlay(); }
        }));
      });
    }

    let noteText = '';
    outcomeWrap.querySelector('#dr-add-note').addEventListener('click', () => {
      const noteWrap = outcomeWrap.querySelector('#dr-note-wrap');
      noteWrap.classList.remove('hidden');
      outcomeWrap.querySelector('#dr-add-note').classList.add('hidden');
      noteWrap.innerHTML = `<textarea class="journal-input" id="dr-note-input" placeholder="What almost got you? (just for your own patterns — totally optional)" style="min-height:70px;"></textarea>`;
      noteWrap.querySelector('#dr-note-input').addEventListener('input', (e) => { noteText = e.target.value; });
    });

    outcomeWrap.querySelectorAll('.outcome-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const outcome = b.getAttribute('data-v');
        Data.addSession({
          activityId: current.id,
          category: 'urge-distraction',
          durationSec,
          outcome: outcome === 'still_having_urge' ? 'still_need_help' : outcome,
          fromUrgeMode: true,
          intensity: meta.intensity || null,
          intensityAfter: intensityAfter != null ? intensityAfter : undefined,
          trigger: meta.trigger || undefined,
          note: noteText || undefined,
        });
        if (outcome === 'still_having_urge') {
          App.toast('Okay — let\u2019s try something else.');
          runNext();
        } else {
          showFinishChoice(outcome);
        }
      });
    });
  }

  function showFinishChoice(outcome) {
    const body = wrap.querySelector('#dr-body');
    body.innerHTML = '';
    const w = fmt(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:18px;">
        <div class="prompt-text">${outcome === 'better' ? 'Glad to hear it.' : 'That\u2019s good — even a little counts.'}</div>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:280px;">
          <button class="btn btn-primary" id="fc-finish">Finish</button>
          <button class="btn btn-ghost" id="fc-more">Keep going anyway</button>
        </div>
      </div>
    `);
    body.appendChild(w);
    w.querySelector('#fc-finish').addEventListener('click', () => App.closeOverlay());
    w.querySelector('#fc-more').addEventListener('click', () => runNext());
  }

  runNext();
  return wrap;
}

/* ============================== ACTIVITY RUNNER ============================== */
function renderActivityRunner(activity, meta) {
  const startedAt = Date.now();
  let instance = null;

  const wrap = fmt(`
    <div class="activity-screen focus-mode fade-in">
      <div class="activity-header">
        <div class="title">${activity.name}</div>
        <button class="icon-btn" id="act-close" aria-label="Close">✕</button>
      </div>
      <div class="activity-body" id="act-body"></div>
      <div class="activity-footer">
        <button class="btn btn-ghost btn-block" id="act-done-early">I'm done for now</button>
      </div>
    </div>
  `);

  const body = wrap.querySelector('#act-body');

  wrap.querySelector('#act-close').addEventListener('click', () => {
    if (instance && instance.onExit) instance.onExit();
    App.closeOverlay();
  });
  wrap.querySelector('#act-done-early').addEventListener('click', () => {
    if (instance && instance.onExit) instance.onExit();
    showOutcome();
  });

  instance = activity.run(body, () => showOutcome()) || {};

  function showOutcome() {
    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    body.innerHTML = '';
    wrap.querySelector('.activity-footer').classList.add('hidden');
    const outcomeWrap = fmt(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:18px;">
        <div class="prompt-text">How are you feeling now?</div>
        <div class="outcome-grid" id="outcome-grid" style="max-width:340px;">
          <button class="outcome-btn" data-v="better">Better</button>
          <button class="outcome-btn" data-v="a_little_better">A little better</button>
          <button class="outcome-btn" data-v="same">Same</button>
          <button class="outcome-btn" data-v="still_need_help">I still need help</button>
        </div>
      </div>
    `);
    body.appendChild(outcomeWrap);
    let intensityAfter = null;
    renderIntensityRecheck(outcomeWrap, meta.intensity, (v) => { intensityAfter = v; });
    if (meta.fromUrgeMode) {
      const setbackLink = fmt(`<button class="btn-ghost btn" id="act-setback" style="font-size:12px;color:var(--focus-text-2);">It happened \u2014 I acted on the urge</button>`);
      outcomeWrap.appendChild(setbackLink);
      setbackLink.addEventListener('click', () => showSetback());
    }
    outcomeWrap.querySelectorAll('.outcome-btn').forEach((b) => {
      b.addEventListener('click', () => {
        Data.addSession({
          activityId: activity.id,
          category: activity.category,
          durationSec,
          outcome: b.getAttribute('data-v'),
          fromUrgeMode: !!meta.fromUrgeMode,
          intensity: meta.intensity || undefined,
          intensityAfter: intensityAfter != null ? intensityAfter : undefined,
          trigger: meta.trigger || undefined,
        });
        const v = b.getAttribute('data-v');
        if (v === 'still_need_help') {
          showStillNeedHelp();
        } else if (meta.thenDistract && (v === 'same' || v === 'a_little_better')) {
          // Breathing helped some but the urge is still there — the
          // rescue flow's next step is a recommended distraction, not
          // just stopping here.
          App.toast('Let\u2019s try shifting focus.');
          App.launchDistractionLoop({ intensity: meta.intensity, trigger: meta.trigger });
        } else {
          App.closeOverlay();
          App.toast('Logged. Nice work showing up for yourself.');
        }
      });
    });
  }

  function showSetback() {
    body.innerHTML = '';
    body.appendChild(renderSetbackReflection(meta.intensity, (restart) => {
      if (restart) { App.closeOverlay(); App.openUrgeMode(); }
      else { App.closeOverlay(); }
    }));
  }

  function showStillNeedHelp() {
    body.innerHTML = '';
    const w = fmt(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:18px;">
        <div class="prompt-text">That's okay. You don't have to push through alone.</div>
        <div style="color:var(--focus-text-2);font-size:13.5px;max-width:280px;">You can try another activity, or look at support options.</div>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:280px;">
          <button class="btn btn-primary" id="sh-another">Try another activity</button>
          <button class="btn btn-secondary" id="sh-support">Get Support</button>
          <button class="btn btn-ghost" id="sh-close">Close</button>
        </div>
      </div>
    `);
    body.appendChild(w);
    w.querySelector('#sh-another').addEventListener('click', () => {
      App.closeOverlay();
      if (meta.thenDistract) {
        // Part of the guided Urge Rescue Flow — the next recommended step
        // is a distraction, not another calm-category activity.
        App.launchDistractionLoop({ intensity: meta.intensity, trigger: meta.trigger });
      } else {
        App.launchActivity(getRandomActivity(activity.category), { fromUrgeMode: meta.fromUrgeMode });
      }
    });
    w.querySelector('#sh-support').addEventListener('click', () => { App.closeOverlay(); App.openSupport(); });
    w.querySelector('#sh-close').addEventListener('click', () => App.closeOverlay());
  }

  return wrap;
}

/* ============================== ONBOARDING ============================== */
// Quick, skippable tour of the app's main features and where things live in
// Settings, shown once on first open. Steps 1-4 are the tutorial; the person
// can tap "Skip" at any point during it to jump straight into the app.
const TUTORIAL_SLIDES = [
  {
    icon: NavIcons.home,
    tint: 'rgba(52,224,214,0.14)', color: 'var(--cyan)',
    title: 'Start with the Urge button',
    body: "When an urge hits, tap the big button on Home. UrgeAway walks you through a short, guided moment to help it pass.",
  },
  {
    icon: NavIcons.distract,
    tint: 'rgba(139,227,168,0.14)', color: 'var(--green)',
    title: 'Activities, any time',
    body: 'Games, breathing exercises, and short challenges to shift your focus — jump in whenever, not just mid-urge.',
  },
  {
    icon: NavIcons.progress,
    tint: 'rgba(242,197,114,0.14)', color: 'var(--amber)',
    title: 'Progress & Journal',
    body: 'Progress tracks your streaks over time. Journal is a private space to reflect on hard moments — or good ones.',
  },
  {
    icon: NavIcons.settings,
    tint: 'rgba(239,139,111,0.14)', color: 'var(--coral)',
    title: 'Make it yours in Settings',
    body: "Add your own reasons, set up someone to reach out to, schedule reminders, and manage your privacy — all grouped by category so it's easy to find.",
  },
];
const TOTAL_ONBOARD_STEPS = 3 + TUTORIAL_SLIDES.length; // welcome + profile info + tutorial slides + choose-activities + control

function renderOnboarding() {
  let step = 0;
  const selected = new Set();
  const activityChoices = ACTIVITIES.map((a) => a.name);
  const profileStep = 1;
  const tutorialStart = profileStep + 1;
  const chooseStep = tutorialStart + TUTORIAL_SLIDES.length;
  const controlStep = chooseStep + 1;
  let gender = '';

  const wrap = fmt(`<div class="onboard"></div>`);
  render();

  function render() {
    wrap.innerHTML = '';
    const dots = fmt(`<div class="onboard-dots"></div>`);
    for (let i = 0; i < TOTAL_ONBOARD_STEPS; i++) dots.appendChild(fmt(`<div class="onboard-dot ${i === step ? 'active' : ''}"></div>`));

    let body;
    if (step === 0) {
      body = fmt(`
        <div class="onboard-body fade-in">
          <div class="morph-wrap" style="width:140px;height:140px;">${waveSVG()}</div>
          <h1 class="h1" style="font-size:26px;">Welcome to UrgeAway</h1>
          <p class="subtitle" style="max-width:280px;">Sometimes you don't need to solve everything. You just need something that helps you get through the moment. Here's a quick look around.</p>
        </div>
      `);
    } else if (step === profileStep) {
      body = fmt(`
        <div class="onboard-body fade-in">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(52,224,214,0.14);display:flex;align-items:center;justify-content:center;color:var(--cyan);">${NavIcons.user}</div>
          <h1 class="h1" style="font-size:22px;">A little about you</h1>
          <p class="subtitle" style="max-width:280px;margin-bottom:var(--space-2);">Totally optional \u2014 you can skip this and add it later from your profile.</p>
          <div style="width:100%;max-width:280px;display:flex;flex-direction:column;gap:10px;">
            <input type="text" id="ob-first" class="auth-input" placeholder="First name" maxlength="40" style="width:100%;" />
            <input type="text" id="ob-last" class="auth-input" placeholder="Last name" maxlength="40" style="width:100%;" />
            <div style="display:flex;gap:8px;justify-content:center;margin-top:4px;">
              <button class="choice-pill" data-g="male">Male</button>
              <button class="choice-pill" data-g="female">Female</button>
            </div>
          </div>
        </div>
      `);
    } else if (step >= tutorialStart && step < chooseStep) {
      const slide = TUTORIAL_SLIDES[step - tutorialStart];
      body = fmt(`
        <div class="onboard-body fade-in">
          <div style="width:64px;height:64px;border-radius:50%;background:${slide.tint};display:flex;align-items:center;justify-content:center;color:${slide.color};">${slide.icon}</div>
          <h1 class="h1" style="font-size:24px;">${slide.title}</h1>
          <p class="subtitle" style="max-width:290px;">${slide.body}</p>
        </div>
      `);
    } else if (step === chooseStep) {
      body = fmt(`
        <div class="onboard-body fade-in">
          <h1 class="h1" style="font-size:24px;">Choose what helps you</h1>
          <p class="subtitle">Pick a few to start with — you can always try the rest later.</p>
          <div class="choice-wrap" id="ob-choices"></div>
        </div>
      `);
    } else {
      body = fmt(`
        <div class="onboard-body fade-in">
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(52,224,214,0.14);display:flex;align-items:center;justify-content:center;color:var(--cyan);">${NavIcons.shield}</div>
          <h1 class="h1" style="font-size:24px;">You're in control</h1>
          <p class="subtitle" style="max-width:290px;">UrgeAway provides optional tools — distraction, grounding, reflection — and doesn't replace professional support. Your data stays on this device.</p>
        </div>
      `);
    }
    wrap.appendChild(dots);
    wrap.appendChild(body);

    if (step === profileStep) {
      body.querySelector('#ob-first').value = Data.getProfileFirstName();
      body.querySelector('#ob-last').value = Data.getProfileLastName();
      body.querySelectorAll('[data-g]').forEach((btn) => {
        if (btn.getAttribute('data-g') === gender) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          gender = gender === btn.getAttribute('data-g') ? '' : btn.getAttribute('data-g');
          body.querySelectorAll('[data-g]').forEach((b) => b.classList.toggle('selected', b.getAttribute('data-g') === gender));
        });
      });
    }

    if (step === chooseStep) {
      const choicesWrap = body.querySelector('#ob-choices');
      activityChoices.forEach((name) => {
        const pill = document.createElement('button');
        pill.className = 'choice-pill' + (selected.has(name) ? ' selected' : '');
        pill.textContent = name;
        pill.addEventListener('click', () => {
          if (selected.has(name)) selected.delete(name); else selected.add(name);
          render();
        });
        choicesWrap.appendChild(pill);
      });
    }

    const footer = fmt(`<div class="onboard-footer"></div>`);
    if (step < controlStep) {
      const skipLabel = step >= tutorialStart && step < chooseStep ? 'Skip tutorial' : 'Skip';
      const skip = fmt(`<button class="btn btn-ghost" style="flex:1;">${skipLabel}</button>`);
      const next = fmt(`<button class="btn btn-primary" style="flex:2;">Continue</button>`);
      skip.addEventListener('click', () => { if (step === profileStep) saveProfileStep(); finish(); });
      next.addEventListener('click', () => { if (step === profileStep) saveProfileStep(); step += 1; render(); });
      footer.appendChild(skip);
      footer.appendChild(next);
    } else {
      const start = fmt(`<button class="btn btn-primary btn-block">Get started</button>`);
      start.addEventListener('click', finish);
      footer.appendChild(start);
    }
    wrap.appendChild(footer);
  }

  // Called on both Skip and Continue from the profile step — whatever was
  // typed before tapping either one is saved, same spirit as the rest of
  // onboarding (nothing here blocks progress either way).
  function saveProfileStep() {
    const first = wrap.querySelector('#ob-first') ? wrap.querySelector('#ob-first').value.trim() : '';
    const last = wrap.querySelector('#ob-last') ? wrap.querySelector('#ob-last').value.trim() : '';
    if (first) Data.setProfileFirstName(first);
    if (last) Data.setProfileLastName(last);
    if (gender) Data.setProfileGender(gender);
    const combined = [first, last].filter(Boolean).join(' ');
    if (combined) Data.setProfileName(combined);
  }

  function finish() {
    Data.setOnboarded(Array.from(selected));
    App.syncProfileToFirestore();
    App.completeOnboarding();
  }

  return wrap;
}

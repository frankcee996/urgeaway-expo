/* ==========================================================================
   Account screen — optional Firebase email sign-in, opened from Settings
   (and from the first-launch Login Gate in flows.js, which mounts
   renderAccountBody into its own wrapper). Signing in is never required to
   use UrgeAway — every core feature already works with zero account — so
   once signed in, this doubles as a light account "dashboard": who you're
   signed in as, and a sign-out control. Email/password only — no Google
   or phone-number sign-in.
   ========================================================================== */

const AuthIcons = {
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2"/><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-3.22 2.55A9.12 9.12 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 4.22-5.94"/><path d="M9.9 9.9a3 3 0 1 0 4.24 4.24"/><path d="M1 1l22 22"/></svg>',
};

// Asked once, right after registering — never blocks anything, "Skip" moves
// on immediately, and it's silently bypassed if a name is already set (e.g.
// someone signs up again on a second device). Also bypassed entirely when
// onboarding hasn't run yet (fresh install signing up via the first-launch
// Login Gate) — onboarding's own profile step asks for first/last name
// right after this, so asking here too would mean typing a name twice.
function maybeAskForUsername(container, onDone) {
  if (Data.getProfileName() || !Data.isOnboarded()) { onDone(); return; }
  container.innerHTML = '';
  const wrap = fmt(`
    <div class="fade-in" style="display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;max-width:290px;margin:0 auto;">
      <div style="width:52px;height:52px;border-radius:50%;background:rgba(52,224,214,0.14);display:flex;align-items:center;justify-content:center;color:var(--cyan);">${NavIcons.user}</div>
      <div class="line1" style="font-size:18px;">What should we call you?</div>
      <div style="color:var(--text-2);font-size:12.5px;text-align:center;">Shown on your dashboard \u2014 never shared.</div>
      <div class="auth-input-wrap">
        <span class="auth-input-icon">${NavIcons.user}</span>
        <input type="text" id="un-input" class="auth-input" placeholder="Your name" maxlength="40" />
      </div>
      <button class="btn btn-primary btn-gradient btn-block" id="un-save">Continue</button>
      <button class="btn btn-ghost btn-block" id="un-skip">Skip for now</button>
    </div>
  `);
  container.appendChild(wrap);
  wrap.querySelector('#un-input').focus();
  wrap.querySelector('#un-save').addEventListener('click', () => {
    const val = wrap.querySelector('#un-input').value.trim();
    if (val) Data.setProfileName(val);
    onDone();
  });
  wrap.querySelector('#un-skip').addEventListener('click', onDone);
}

function renderAccountScreen(onAuthed) {
  const wrap = fmt(`
    <div class="activity-screen fade-in">
      <div class="activity-header">
        <div class="title">Account</div>
        <button class="icon-btn" id="account-close">✕</button>
      </div>
      <div class="screen-scroll" id="account-body"></div>
    </div>
  `);
  wrap.querySelector('#account-close').addEventListener('click', () => App.closeOverlay());
  renderAccountBody(wrap, onAuthed);
  return wrap;
}

function renderAccountBody(wrap, onAuthed) {
  const body = wrap.querySelector('#account-body') || wrap;
  body.innerHTML = '';

  if (!Auth.available()) {
    body.appendChild(fmt(`
      <div class="notice-box">
        Sign-in needs the installed Android app — it's not available in this browser preview.
      </div>
    `));
    return;
  }

  const user = Auth.getCurrentUser();

  if (user) {
    renderDashboard();
    return;
  }

  let mode = 'login'; // 'login' | 'signup'
  let showPassword = false;
  renderForm();

  function renderDashboard() {
    const initial = ((user.displayName || user.email || '?').trim()[0] || '?').toUpperCase();
    body.appendChild(fmt(`
      <div class="card" style="display:flex;align-items:center;gap:14px;">
        <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--green));display:flex;align-items:center;justify-content:center;color:#04211e;font-weight:800;font-size:18px;flex-shrink:0;">${escapeHtml(initial)}</div>
        <div style="min-width:0;">
          <div class="label" style="font-size:15px;">${escapeHtml(user.displayName || 'Your account')}</div>
          <div class="desc" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(user.email || '')}</div>
        </div>
      </div>
      <div class="card" style="margin-top:var(--space-3);color:var(--text-1);font-size:13.5px;line-height:1.55;">
        Signing in doesn't change how UrgeAway works today — everything still lives on this device. This is here for optional features later, like cloud backup, which will always be clearly explained before anything leaves your device.
      </div>
    `));
    const signOutBtn = fmt(`<button class="btn btn-secondary btn-block" style="margin-top:var(--space-4);">Sign out</button>`);
    signOutBtn.addEventListener('click', async () => {
      await Auth.signOutUser();
      renderAccountBody(wrap);
      App.toast('Signed out');
    });
    body.appendChild(signOutBtn);
  }

  function renderForm() {
    body.innerHTML = '';
    const isSignup = mode === 'signup';

    const header = fmt(`
      <div class="auth-header">
        <div class="morph-wrap" style="width:64px;height:64px;">${waveSVG()}</div>
        <h1 class="h1">Urge<span style="color:var(--cyan);">Away</span></h1>
        <p class="subtitle">Don\u2019t fight the moment. Shift it.</p>
      </div>
    `);
    body.appendChild(header);

    const form = fmt(`
      <div>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">${AuthIcons.mail}</span>
          <input type="email" id="ac-email" class="auth-input" placeholder="Email or Username" autocomplete="username" />
        </div>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">${AuthIcons.lock}</span>
          <input type="password" id="ac-password" class="auth-input" placeholder="Password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
          <button type="button" class="auth-eye-btn" id="ac-eye" aria-label="Show password">${AuthIcons.eye}</button>
        </div>
        ${!isSignup ? `<div class="auth-forgot"><button type="button" id="ac-forgot">Forgot Password?</button></div>` : ''}
        <div class="feedback-flash" id="ac-error"></div>
        <button class="btn btn-primary btn-gradient btn-block" id="ac-submit" style="margin-top:var(--space-2);">${isSignup ? 'Sign Up' : 'Log In'}</button>
      </div>
    `);
    body.appendChild(form);

    body.appendChild(fmt(`
      <div class="auth-switch">
        ${isSignup ? 'Already have an account?' : "Don\u2019t have an account?"} <button type="button" id="ac-switch">${isSignup ? 'Log In' : 'Sign Up'}</button>
      </div>
    `));

    // Wire up interactions
    const eyeBtn = form.querySelector('#ac-eye');
    const passwordInput = form.querySelector('#ac-password');
    eyeBtn.addEventListener('click', () => {
      showPassword = !showPassword;
      passwordInput.type = showPassword ? 'text' : 'password';
      eyeBtn.innerHTML = showPassword ? AuthIcons.eyeOff : AuthIcons.eye;
      eyeBtn.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
    });

    function showError(msg) {
      const el = form.querySelector('#ac-error');
      el.textContent = msg;
      el.className = 'feedback-flash bad';
    }

    form.querySelector('#ac-submit').addEventListener('click', async () => {
      const email = form.querySelector('#ac-email').value.trim();
      const password = passwordInput.value;
      if (!email || !password) { showError('Enter an email and password.'); return; }
      const result = isSignup ? await Auth.signUpEmail(email, password) : await Auth.signInEmail(email, password);
      if (result.ok) {
        App.toast(isSignup ? 'Account created' : 'Signed in');
        const finish = () => { if (onAuthed) onAuthed(); else renderAccountBody(wrap); };
        if (isSignup) maybeAskForUsername(body, finish); else finish();
      } else {
        showError(result.message || (isSignup ? 'Could not create account.' : 'Could not sign in.'));
      }
    });

    if (!isSignup) {
      form.querySelector('#ac-forgot').addEventListener('click', async () => {
        const email = form.querySelector('#ac-email').value.trim();
        if (!email) { showError('Enter your email above first.'); return; }
        const result = await Auth.sendPasswordReset(email);
        if (result.ok) App.toast('Password reset email sent');
        else showError(result.message || 'Could not send reset email.');
      });
    }

    body.querySelector('#ac-switch').addEventListener('click', () => {
      mode = isSignup ? 'login' : 'signup';
      showPassword = false;
      renderForm();
    });
  }
}

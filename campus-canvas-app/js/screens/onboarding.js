import { Store, photoStyle } from '../store.js';
import { Router } from '../router.js';
import { toast, busy, preloadPhotos, esc } from '../ui.js';
import { termsHTML, TERMS_LAST_UPDATED } from '../terms-content.js';

let intent = 'submit'; // 'submit' | 'vote'

const HERO_PHOTO = 'assets/hero-frosh.webp';

// What students can do, shown under the landing intro.
const FEATURES = [
  [`<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><rect x="3.5" y="5.5" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 8.5V4.5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2" stroke="currentColor" stroke-width="1.5"/><path d="M5 16l3.5-3.5 2.5 2.5 2-2 3 3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    'Submit photos', 'Share three original photos of your Queen’s experience.'],
  [`<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 20s-7-4.35-9.5-8.5C.9 8 2.6 4.5 6 4.5c2 0 3.4 1.1 4 2.2.6-1.1 2-2.2 4-2.2 3.4 0 5.1 3.5 3.5 7C19 15.65 12 20 12 20z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    'Vote', 'Explore the photos. Choose what resonates.'],
  [`<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'Track submissions', 'Find your photos and their review status in your profile.'],
];

export function landing(root) {
  // Black, white and gold side by side: the message sits on ivory and the
  // buttons on a black band. The photo grows on taller phones to fill the
  // screen above them; its only shading is at the top, behind the logo. On
  // laptops the band spans the whole right-hand column (the <style> below
  // widens the laptop layout's centred column for it).
  // Log in stays on the page once someone is signed in too: there's no
  // log-out, so it's how a shared or test device switches accounts.
  const me = Store.currentParticipant();
  const loginPrompt = me ? `Signed in as ${esc(me.name.trim().split(/\s+/)[0])}. Not you?` : 'Already signed up?';
  root.innerHTML = `
    <div class="screen landing" style="background:#FBF8F2;">
      <style>
        .landing-features { display:grid; grid-template-columns:repeat(3, 1fr); margin-top:24px; border-top:1px solid rgba(27,25,22,.12); }
        .landing-features > div { padding:16px 10px 2px; }
        .landing-features > div:first-child { padding-left:0; }
        .landing-features > div + div { border-left:1px solid rgba(27,25,22,.12); }
        @media (min-width: 900px) {
          .landing > .landing-scroll { background: #FBF8F2 !important; }
          .landing-copy { padding: 0 48px 44px !important; }
          .landing-actions { max-width: none !important; justify-self: stretch !important; padding: 40px 48px 56px !important; }
          .landing-actions > .btn { max-width: 420px; margin-left: auto; margin-right: auto; }
        }
      </style>
      <div class="scroll landing-scroll" style="display:flex; flex-direction:column;">
        <div class="landing-hero" style="position:relative; height:240px; height:max(240px, calc(100svh - 640px)); overflow:hidden; flex:none;">
          <div style="position:absolute; inset:0; ${photoStyle(HERO_PHOTO)}"></div>
          <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(21,19,15,.45) 0%, rgba(21,19,15,0) 22%);"></div>
          <img src="assets/monogram-transparent.png" alt="ArtUP" style="position:absolute; left:26px; top:24px; height:32px; width:auto; display:block; filter:drop-shadow(0 1px 6px rgba(21,19,15,.45));" />
        </div>
        <div class="landing-copy" style="padding:28px 26px 30px; background:#FBF8F2; flex:1;">
          <p style="margin:0 0 14px; font-size:12px; letter-spacing:.26em; text-transform:uppercase; color:#A6842C;">Queen's University · Class of 2027</p>
          <h1 class="h-serif" style="font-size:40px; line-height:1.02; margin-bottom:16px; color:#15130F;">Campus Canvas</h1>
          <p style="margin:0; font-size:16.5px; font-weight:300; line-height:1.7; color:#4A443A;">Three photographs of the places that defined your years here. Kingston artists turn the most-loved images into original works.</p>
          <div class="landing-features">
            ${FEATURES.map(([icon, title, body]) => `
              <div>
                <span style="display:block; width:20px; height:20px; color:#A6842C; margin-bottom:10px;">${icon}</span>
                <p class="h-serif" style="font-size:17.5px; line-height:1.2; color:#15130F; margin-bottom:6px;">${title}</p>
                <p style="margin:0; font-size:13.5px; font-weight:300; line-height:1.45; color:#5B5449;">${body}</p>
              </div>`).join('')}
          </div>
        </div>
        <div class="landing-actions" style="padding:28px 26px 34px; background:#15130F;">
          <button class="btn btn-gold-dark" id="enter-btn">Submit Your 3 Photos</button>
          <button class="btn btn-outline-light" id="vote-only-btn" style="margin-top:12px;">Just here to vote</button>
          <p style="margin:18px 0 0; text-align:center; font-size:14.5px; font-weight:300; color:#CFC7B6;">${loginPrompt} <a href="#/login" style="color:#D9B85C; text-decoration:underline; text-underline-offset:3px;">Log in</a></p>
        </div>
      </div>
    </div>`;

  root.querySelector('#enter-btn').addEventListener('click', () => {
    intent = 'submit';
    if (Store.currentParticipant() && !Store.isApproved()) { Router.go('#/pending'); return; }
    Router.go(Store.currentParticipant() ? (Store.hasAcceptedCurrentTerms() ? '#/submit' : '#/terms-gate') : '#/register');
  });
  root.querySelector('#vote-only-btn').addEventListener('click', () => {
    intent = 'vote';
    // The first cards download while they fill in their name and email.
    preloadPhotos(Store.votingQueue().slice(0, 2));
    Router.go(Store.currentParticipant() ? '#/vote' : '#/register');
  });
}

export function register(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div class="brand"><img src="assets/monogram.png" alt="ArtUP" /><span>Campus Canvas</span></div>
        <span style="font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#A6842C;">Queen's</span>
      </div>
      <div class="scroll" style="padding:34px 24px 0;">
        <p class="eyebrow">Step 1 of 3</p>
        <h2 class="h-serif" style="font-size:33px; line-height:1.08; margin-bottom:12px;">Capture your campus story.</h2>
        <p style="margin:0 0 24px; font-weight:300; font-size:16px; line-height:1.65; color:#5B5449;">Three photographs that define your years here. Your name and email keep your entry — and your votes — together.</p>

        <div style="margin:0 0 26px; border-left:3px solid #A6842C; background:#F2ECE0; border-radius:0 12px 12px 0; padding:14px 16px;">
          <p style="margin:0 0 4px; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#8C6D1F;">Who can take part</p>
          <p style="margin:0; font-size:15px; font-weight:400; line-height:1.55; color:#1B1916;">Queen’s University students, 18 or older. Sign up with your <strong style="font-weight:500;">@queensu.ca</strong> email for instant access. Other addresses are reviewed by the ArtUP team first.</p>
        </div>

        <label style="display:block; margin:0 0 8px; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">Full name</label>
        <input type="text" id="reg-name" placeholder="Your full name" style="margin-bottom:20px;" />

        <label style="display:block; margin:0 0 8px; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">Email</label>
        <input type="email" id="reg-email" placeholder="you@queensu.ca" autocomplete="email" />
        <p id="reg-hint" style="margin:10px 0 0; font-size:14px; font-weight:300; color:#8C8375;">Use your @queensu.ca address if you have one. One entry per address.</p>

        <label for="reg-age" style="display:flex; align-items:flex-start; gap:12px; margin-top:22px; cursor:pointer;">
          <input type="checkbox" id="reg-age" style="width:20px; height:20px; margin-top:2px; flex:none; accent-color:#A6842C;" />
          <span style="font-size:15px; font-weight:400; line-height:1.55; color:#1B1916;">I confirm I’m 18 or older.</span>
        </label>

        <div style="margin-top:28px; border-radius:16px; background:#F2ECE0; padding:18px 20px; display:flex; gap:14px; align-items:flex-start;">
          <span style="width:22px; height:22px; border-radius:11px; background:#A6842C; flex:none; display:block;"></span>
          <p style="margin:0; font-size:14.5px; font-weight:300; line-height:1.6; color:#4A443A;">Instant access, no download. Campus Canvas runs in your browser — add it to your home screen if you like.</p>
        </div>
      </div>
      <div style="padding:18px 24px 28px; border-top:1px solid rgba(27,25,22,.08);">
        <button class="btn btn-gold" id="reg-continue">Continue${intent === 'submit' ? ' to terms' : ''}</button>
        <p style="margin:14px 0 0; text-align:center; font-size:14.5px; font-weight:300; color:#5B5449;">Already have an account? <a href="#/login" style="color:#A6842C; text-decoration:underline; text-underline-offset:3px;">Log in</a></p>
      </div>
    </div>`;

  const nameEl = root.querySelector('#reg-name');
  const emailEl = root.querySelector('#reg-email');
  const ageEl = root.querySelector('#reg-age');
  const existing = Store.currentParticipant();
  if (existing) {
    nameEl.value = existing.name;
    // Someone waiting for approval is here to switch to their Queen's address.
    if (existing.access === 'approved') emailEl.value = existing.email;
  }

  const continueBtn = root.querySelector('#reg-continue');
  continueBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    if (!name) { toast('Add your full name to continue.'); nameEl.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('That email doesn’t look right.'); emailEl.focus(); return; }
    if (!ageEl.checked) { toast('Please confirm you’re 18 or older.'); ageEl.focus(); return; }
    const restore = busy(continueBtn, 'Saving…');
    try {
      await Store.register(name, email, true);
    } catch (err) {
      restore();
      toast(err.message, 3200);
      return;
    }
    afterSignIn();
  });
}

// Where someone goes once they're registered or logged back in.
function afterSignIn() {
  if (!Store.isApproved()) Router.go('#/pending');
  else if (intent === 'vote') Router.go('#/vote');
  else if (Store.myImages().length) Router.go('#/account');
  else Router.go(Store.hasAcceptedCurrentTerms() ? '#/submit' : '#/terms-gate');
}

// Log in with a magic link. Step one asks for the email; step two says the
// link is on its way and takes the code from the same email as a fallback
// for when the link opens on another device.
let loginEmail = '';

export function login(root, { params = {} } = {}) {
  const sent = params.step === 'sent' && loginEmail;
  root.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div class="brand"><img src="assets/monogram.png" alt="ArtUP" /><span>Campus Canvas</span></div>
        <span style="font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#A6842C;">Queen's</span>
      </div>
      <div class="scroll" style="padding:34px 24px 0;">
        <p class="eyebrow">Welcome back</p>
        ${sent ? `
        <h2 class="h-serif" style="font-size:33px; line-height:1.08; margin-bottom:12px;">Check your email</h2>
        <p style="margin:0 0 26px; font-weight:300; font-size:16px; line-height:1.65; color:#5B5449;">We sent a log-in link to <strong style="font-weight:500; color:#1B1916;">${esc(loginEmail)}</strong>. Tap it to log in. If it opens somewhere else, type the code from the same email here instead.</p>
        <label style="display:block; margin:0 0 8px; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">Code from the email</label>
        <input type="text" id="login-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" style="letter-spacing:.2em;" />
        <p style="margin:12px 0 0; font-size:14px; font-weight:300; color:#8C8375;">Nothing yet? Check your spam folder, or <a href="#" id="login-resend" style="color:#A6842C; text-decoration:underline; text-underline-offset:3px;">send it again</a>.</p>` : `
        <h2 class="h-serif" style="font-size:33px; line-height:1.08; margin-bottom:12px;">Log in</h2>
        <p style="margin:0 0 26px; font-weight:300; font-size:16px; line-height:1.65; color:#5B5449;">Enter the email you signed up with and we’ll send you a log-in link. No password needed.</p>
        <label style="display:block; margin:0 0 8px; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">Email</label>
        <input type="email" id="login-email" placeholder="you@queensu.ca" autocomplete="email" value="${esc(loginEmail)}" />`}
      </div>
      <div style="padding:18px 24px 28px; border-top:1px solid rgba(27,25,22,.08);">
        <button class="btn btn-gold" id="login-btn">${sent ? 'Log in' : 'Email me a log-in link'}</button>
        <p style="margin:14px 0 0; text-align:center; font-size:14.5px; font-weight:300; color:#5B5449;">${sent
          ? '<a href="#/login" style="color:#A6842C; text-decoration:underline; text-underline-offset:3px;">Use a different email</a>'
          : 'New here? <a href="#/register" style="color:#A6842C; text-decoration:underline; text-underline-offset:3px;">Sign up</a>'}</p>
      </div>
    </div>`;

  const btn = root.querySelector('#login-btn');
  const send = async (button) => {
    const restore = busy(button, 'Sending…');
    try {
      await Store.sendLoginLink(loginEmail);
    } catch (err) {
      restore();
      toast(/rate limit/i.test(err.message) ? 'Too many emails just now. Please wait a minute and try again.' : err.message, 3600);
      return false;
    }
    restore();
    return true;
  };

  if (!sent) {
    const emailEl = root.querySelector('#login-email');
    const go = async () => {
      const email = emailEl.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('That email doesn’t look right.'); emailEl.focus(); return; }
      loginEmail = email.toLowerCase();
      if (await send(btn)) Router.go('#/login?step=sent');
    };
    btn.addEventListener('click', go);
    emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return;
  }

  const codeEl = root.querySelector('#login-code');
  const verify = async () => {
    const code = codeEl.value.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(code)) { toast('Type the code from the email.'); codeEl.focus(); return; }
    const restore = busy(btn, 'Logging in…');
    try {
      await Store.verifyLoginCode(loginEmail, code);
    } catch (err) {
      restore();
      toast(err.message, 3600);
      return;
    }
    intent = 'vote';
    afterSignIn();
  };
  btn.addEventListener('click', verify);
  codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
  root.querySelector('#login-resend').addEventListener('click', async (e) => {
    e.preventDefault();
    if (await send(e.currentTarget)) toast('Sent. Check your email.');
  });
}

// Back from a magic link (see app.js): send them on, or explain what went wrong.
export function finishLogin(result) {
  if (result === 'ok') { intent = 'vote'; afterSignIn(); return; }
  Router.go('#/login');
  toast(result, 4200);
}

// Non-@queensu.ca sign-ups wait here until an admin approves or rejects them.
export function pending(root) {
  const p = Store.currentParticipant();
  if (!p) { Router.go('#/register'); return; }
  if (p.access === 'approved') { Router.go('#/'); return; }
  const rejected = p.access === 'rejected';
  root.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div class="brand"><img src="assets/monogram.png" alt="ArtUP" /><span>Campus Canvas</span></div>
        <span style="font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#A6842C;">Queen's</span>
      </div>
      <div class="scroll" style="padding:34px 24px 0;">
        <p class="eyebrow">${rejected ? 'Not approved' : 'Almost there'}</p>
        <h2 class="h-serif" style="font-size:33px; line-height:1.08; margin-bottom:12px;">${rejected ? 'We couldn’t approve this email.' : 'Your sign-up is being reviewed.'}</h2>
        <p style="margin:0 0 22px; font-weight:300; font-size:16px; line-height:1.65; color:#5B5449;">${rejected
          ? 'Campus Canvas is for Queen’s University students. If you have a @queensu.ca address, sign up with that one instead.'
          : `Thanks, ${esc(p.name.split(' ')[0])}! Because <strong style="font-weight:500; color:#1B1916;">${esc(p.email)}</strong> isn’t a @queensu.ca address, the ArtUP team checks it before you can submit or vote. Come back and log in with this email once it’s approved.`}</p>
      </div>
      <div style="padding:18px 24px 28px; border-top:1px solid rgba(27,25,22,.08);">
        ${rejected ? '' : '<button class="btn btn-gold" id="pending-check">Check again</button>'}
        <button class="btn btn-outline" id="pending-other" style="margin-top:12px;">Use my @queensu.ca email</button>
      </div>
    </div>`;

  root.querySelector('#pending-check')?.addEventListener('click', async (e) => {
    const restore = busy(e.currentTarget, 'Checking…');
    await Store.refresh().catch(() => {});
    if (Store.isApproved()) { toast('You’re approved. Welcome!'); afterSignIn(); }
    else { restore(); toast('Still waiting for review.'); }
  });
  root.querySelector('#pending-other').addEventListener('click', () => Router.go('#/register'));
}

// Screens a student can be sent on to once they accept the terms.
const AFTER_TERMS = new Set(['submit', 'vote', 'notices', 'feedback']);

export function termsGate(root, { params = {} } = {}) {
  const p = Store.currentParticipant();
  const asked = params.next === 'notice' ? 'notices' : params.next;
  const next = AFTER_TERMS.has(asked) ? asked : (intent === 'vote' ? 'vote' : 'submit');
  const isUpdate = !!(p && p.termsVersion && p.termsVersion !== Store.TERMS_VERSION);
  // Fixed-height screen so the document scrolls inside #terms-scroll and
  // "read to the end" is meaningful.
  root.innerHTML = `
    <div class="screen screen-fixed">
      <div style="padding:14px 24px 16px; border-bottom:1px solid rgba(27,25,22,.10); display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:12.5px; letter-spacing:.20em; text-transform:uppercase; color:#8C8375;">${isUpdate ? 'Updated terms' : { submit: 'Step 2 of 3', vote: 'Before you vote' }[next] || 'Before you continue'}</span>
        <span style="font-size:12.5px; letter-spacing:.14em; text-transform:uppercase; color:#A6842C;">Updated ${TERMS_LAST_UPDATED}</span>
      </div>
      <div class="scroll" id="terms-scroll" style="padding:26px 24px 12px; background:#fff; min-height:0;">
        ${isUpdate ? '<p style="margin:0 0 18px; padding:14px 16px; border-radius:12px; background:#F2ECE0; font-size:14.5px; font-weight:300; line-height:1.6; color:#4A443A;">Our Terms of Use have changed since you last accepted them. Please read and accept the current version to continue.</p>' : ''}
        ${termsHTML()}
      </div>
      <div style="padding:16px 24px 28px; border-top:1px solid rgba(27,25,22,.10); background:#fff; box-shadow:0 -12px 24px rgba(27,25,22,.05);">
        <label for="terms-check" style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px; cursor:pointer;">
          <input type="checkbox" id="terms-check" disabled style="width:20px; height:20px; margin-top:2px; flex:none; accent-color:#A6842C;" />
          <span style="font-size:14.5px; font-weight:300; line-height:1.55; color:#1B1916;">I have read and agree to the ArtUP Terms of Use.</span>
        </label>
        <button class="btn btn-gold" id="accept-btn" disabled>Accept &amp; continue</button>
        <p id="scroll-hint" style="margin:12px 0 0; text-align:center; font-size:13px; font-weight:300; color:#8C8375;">Scroll to the end to enable acceptance.</p>
      </div>
    </div>`;

  const scrollEl = root.querySelector('#terms-scroll');
  const check = root.querySelector('#terms-check');
  const acceptBtn = root.querySelector('#accept-btn');
  const hint = root.querySelector('#scroll-hint');

  // Reaching the end only enables the checkbox; the participant still has to
  // tick it themselves (FR-004: affirmative acceptance).
  function unlock() {
    if (!check.disabled) return;
    check.disabled = false;
    hint.textContent = 'Tick the box to accept.';
  }
  function checkScroll() {
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 24) unlock();
  }
  scrollEl.addEventListener('scroll', checkScroll);
  setTimeout(checkScroll, 50);
  check.addEventListener('change', () => {
    acceptBtn.disabled = !check.checked;
    hint.textContent = check.checked ? 'Thanks — you can continue.' : 'Tick the box to accept.';
  });

  acceptBtn.addEventListener('click', async () => {
    if (acceptBtn.disabled || !check.checked) return;
    const restore = busy(acceptBtn, 'Saving…');
    try {
      await Store.acceptTerms();
    } catch (err) {
      restore();
      toast(err.message, 3200);
      return;
    }
    toast('Terms accepted.');
    Router.go(`#/${next}`);
  });
}

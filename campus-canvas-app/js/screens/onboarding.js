import { Store, photoStyle } from '../store.js';
import { Router } from '../router.js';
import { toast, busy, preloadPhotos } from '../ui.js';
import { termsHTML, TERMS_LAST_UPDATED } from '../terms-content.js';

let intent = 'submit'; // 'submit' | 'vote'

// The ArtUP site's Campus Canvas page, linked from the landing intro.
const CONTEST_INFO_URL = 'https://artup.life/campus-canvas/';
const HERO_PHOTO = 'assets/hero-frosh.jpg';

export function landing(root) {
  // Black, white and gold side by side: the message sits on ivory and the
  // buttons on a black band. The photo grows on taller phones to fill the
  // screen above them; its only shading is at the top, behind the logo. On
  // laptops the band spans the whole right-hand column (the <style> below
  // widens the laptop layout's centred column for it).
  root.innerHTML = `
    <div class="screen landing" style="background:#FBF8F2;">
      <style>
        @media (min-width: 900px) {
          .landing > .landing-scroll { background: #FBF8F2 !important; }
          .landing-copy { padding: 0 48px 44px !important; }
          .landing-actions { max-width: none !important; justify-self: stretch !important; padding: 40px 48px 56px !important; }
          .landing-actions > .btn { max-width: 420px; margin-left: auto; margin-right: auto; }
        }
      </style>
      <div class="scroll landing-scroll" style="display:flex; flex-direction:column;">
        <div class="landing-hero" style="position:relative; height:300px; height:max(300px, calc(100svh - 450px)); overflow:hidden; flex:none;">
          <div style="position:absolute; inset:0; ${photoStyle(HERO_PHOTO)}"></div>
          <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(21,19,15,.45) 0%, rgba(21,19,15,0) 22%);"></div>
          <img src="assets/monogram-transparent.png" alt="ArtUP" style="position:absolute; left:26px; top:24px; height:32px; width:auto; display:block; filter:drop-shadow(0 1px 6px rgba(21,19,15,.45));" />
        </div>
        <div class="landing-copy" style="padding:28px 26px 30px; background:#FBF8F2; flex:1;">
          <p style="margin:0 0 14px; font-size:12px; letter-spacing:.26em; text-transform:uppercase; color:#A6842C;">Queen's University · Class of 2027</p>
          <h1 class="h-serif" style="font-size:40px; line-height:1.02; margin-bottom:16px; color:#15130F;">Campus Canvas</h1>
          <p style="margin:0; font-size:16.5px; font-weight:300; line-height:1.7; color:#4A443A;">Join the contest! Submit 3 photos of the places or spaces that capture a memory of your university experience. Learn more about the terms of the contest <a href="${CONTEST_INFO_URL}" target="_blank" rel="noopener" style="color:#A6842C; text-decoration:underline; text-underline-offset:3px;">here</a>.</p>
        </div>
        <div class="landing-actions" style="padding:28px 26px 34px; background:#15130F;">
          <button class="btn btn-gold-dark" id="enter-btn">Submit Your 3 Photos</button>
          <button class="btn btn-outline-light" id="vote-only-btn" style="margin-top:12px;">Just here to vote</button>
        </div>
      </div>
    </div>`;

  root.querySelector('#enter-btn').addEventListener('click', () => {
    intent = 'submit';
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
        <p style="margin:0 0 30px; font-weight:300; font-size:16px; line-height:1.65; color:#5B5449;">Three photographs that define your years here. Your name and email keep your entry — and your votes — together.</p>

        <label style="display:block; margin:0 0 8px; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">Full name</label>
        <input type="text" id="reg-name" placeholder="Your full name" style="margin-bottom:20px;" />

        <label style="display:block; margin:0 0 8px; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">University email</label>
        <input type="email" id="reg-email" placeholder="you@queensu.ca" />
        <p id="reg-hint" style="margin:10px 0 0; font-size:14px; font-weight:300; color:#8C8375;">Your email is your identity here — one entry per address.</p>

        <div style="margin-top:28px; border-radius:16px; background:#F2ECE0; padding:18px 20px; display:flex; gap:14px; align-items:flex-start;">
          <span style="width:22px; height:22px; border-radius:11px; background:#A6842C; flex:none; display:block;"></span>
          <p style="margin:0; font-size:14.5px; font-weight:300; line-height:1.6; color:#4A443A;">Instant access, no download. Campus Canvas runs in your browser — add it to your home screen if you like.</p>
        </div>
      </div>
      <div style="padding:18px 24px 28px; border-top:1px solid rgba(27,25,22,.08);">
        <button class="btn btn-gold" id="reg-continue">Continue${intent === 'submit' ? ' to terms' : ''}</button>
      </div>
    </div>`;

  const nameEl = root.querySelector('#reg-name');
  const emailEl = root.querySelector('#reg-email');
  const existing = Store.currentParticipant();
  if (existing) { nameEl.value = existing.name; emailEl.value = existing.email; }

  const continueBtn = root.querySelector('#reg-continue');
  continueBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    if (!name) { toast('Add your full name to continue.'); nameEl.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('That email doesn’t look right.'); emailEl.focus(); return; }
    const restore = busy(continueBtn, 'Saving…');
    try {
      await Store.register(name, email);
    } catch (err) {
      restore();
      toast(err.message, 3200);
      return;
    }
    if (intent === 'vote') Router.go('#/vote');
    else Router.go(Store.hasAcceptedCurrentTerms() ? '#/submit' : '#/terms-gate');
  });
}

export function termsGate(root) {
  const p = Store.currentParticipant();
  const isUpdate = !!(p && p.termsVersion && p.termsVersion !== Store.TERMS_VERSION);
  // Fixed-height screen so the document scrolls inside #terms-scroll and
  // "read to the end" is meaningful.
  root.innerHTML = `
    <div class="screen screen-fixed">
      <div style="padding:14px 24px 16px; border-bottom:1px solid rgba(27,25,22,.10); display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:12.5px; letter-spacing:.20em; text-transform:uppercase; color:#8C8375;">${isUpdate ? 'Updated terms' : 'Step 2 of 3'}</span>
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
    Router.go('#/submit');
  });
}

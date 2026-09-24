import { Store, SEED_PHOTOS, photoStyle } from '../store.js';
import { Router } from '../router.js';
import { toast, busy } from '../ui.js';
import { termsHTML, TERMS_LAST_UPDATED } from '../terms-content.js';

let intent = 'submit'; // 'submit' | 'vote'

export function landing(root) {
  root.innerHTML = `
    <div class="screen" style="${photoStyle(SEED_PHOTOS[0])}">
      <div class="scroll" style="display:flex; flex-direction:column; color:#F3EEE3;">
        <div style="position:relative; height:342px; overflow:hidden; flex:none;">
          <div style="position:absolute; inset:0; ${photoStyle(SEED_PHOTOS[0])} opacity:.85;"></div>
          <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(21,19,15,.30) 0%, rgba(21,19,15,.78) 62%, #15130F 100%);"></div>
          <div style="position:absolute; left:26px; top:26px; display:flex; align-items:center; gap:12px;">
            <span style="width:26px; height:1px; background:#A6842C; display:block;"></span>
            <span style="font-family:'Bodoni Moda',serif; font-size:13px; letter-spacing:.30em; text-transform:uppercase;">ArtUP</span>
          </div>
        </div>
        <div style="padding:0 26px; margin-top:-52px; position:relative; background:#15130F; flex:1;">
          <p style="margin:0 0 14px; font-size:10.5px; letter-spacing:.26em; text-transform:uppercase; color:#A6842C;">Queen's University · Class of 2027</p>
          <h1 class="h-serif" style="font-size:40px; line-height:1.02; margin-bottom:16px; color:#F7F2E7;">Campus Canvas</h1>
          <p style="margin:0 0 30px; font-size:15px; font-weight:300; line-height:1.7; color:#CFC7B6;">Three photographs of the places that defined your years here. Kingston artists turn the most-loved images into original works.</p>
          <div style="display:flex; gap:0; border-top:1px solid rgba(243,238,227,.16); margin-bottom:34px;">
            <div style="flex:1; padding:18px 0;">
              <p class="h-serif" style="font-size:24px; color:#A6842C; margin-bottom:5px;">3</p>
              <p style="margin:0; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#9A8F79;">Photos</p>
            </div>
            <div style="flex:1; padding:18px 0; border-left:1px solid rgba(243,238,227,.16); padding-left:18px;">
              <p class="h-serif" style="font-size:24px; color:#A6842C; margin-bottom:5px;">2 min</p>
              <p style="margin:0; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#9A8F79;">To enter</p>
            </div>
            <div style="flex:1; padding:18px 0; border-left:1px solid rgba(243,238,227,.16); padding-left:18px;">
              <p class="h-serif" style="font-size:24px; color:#A6842C; margin-bottom:5px;">$20</p>
              <p style="margin:0; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#9A8F79;">Weekly draw</p>
            </div>
          </div>
        </div>
        <div style="padding:24px 26px 34px; background:#15130F;">
          <button class="btn btn-gold-dark" id="enter-btn">Enter the contest</button>
          <button class="btn btn-outline-light" id="vote-only-btn" style="margin-top:12px;">Just here to vote</button>
          <p style="margin:16px 0 0; text-align:center; font-size:11.5px; font-weight:300; color:#7D7360;">No app to download · Runs in your browser</p>
        </div>
      </div>
    </div>`;

  root.querySelector('#enter-btn').addEventListener('click', () => {
    intent = 'submit';
    Router.go(Store.currentParticipant() ? (Store.hasAcceptedCurrentTerms() ? '#/submit' : '#/terms-gate') : '#/register');
  });
  root.querySelector('#vote-only-btn').addEventListener('click', () => {
    intent = 'vote';
    Router.go(Store.currentParticipant() ? '#/vote' : '#/register');
  });
}

export function register(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div class="brand"><img src="assets/monogram.png" alt="ArtUP" /><span>Campus Canvas</span></div>
        <span style="font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#A6842C;">Queen's</span>
      </div>
      <div class="scroll" style="padding:34px 24px 0;">
        <p class="eyebrow">Step 1 of 3</p>
        <h2 class="h-serif" style="font-size:33px; line-height:1.08; margin-bottom:12px;">Capture your campus story.</h2>
        <p style="margin:0 0 30px; font-weight:300; font-size:14.5px; line-height:1.65; color:#5B5449;">Three photographs that define your years here. Your name and email keep your entry — and your votes — together.</p>

        <label style="display:block; margin:0 0 8px; font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">Full name</label>
        <input type="text" id="reg-name" placeholder="Your full name" style="margin-bottom:20px;" />

        <label style="display:block; margin:0 0 8px; font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:#8C8375;">University email</label>
        <input type="email" id="reg-email" placeholder="you@queensu.ca" />
        <p id="reg-hint" style="margin:10px 0 0; font-size:12.5px; font-weight:300; color:#8C8375;">Your email is your identity here — one entry per address.</p>

        <div style="margin-top:28px; border-radius:16px; background:#F2ECE0; padding:18px 20px; display:flex; gap:14px; align-items:flex-start;">
          <span style="width:22px; height:22px; border-radius:11px; background:#A6842C; flex:none; display:block;"></span>
          <p style="margin:0; font-size:13px; font-weight:300; line-height:1.6; color:#4A443A;">Instant access, no download. Campus Canvas runs in your browser — add it to your home screen if you like.</p>
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
        <span style="font-size:11px; letter-spacing:.20em; text-transform:uppercase; color:#8C8375;">${isUpdate ? 'Updated terms' : 'Step 2 of 3'}</span>
        <span style="font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#A6842C;">Updated ${TERMS_LAST_UPDATED}</span>
      </div>
      <div class="scroll" id="terms-scroll" style="padding:26px 24px 12px; background:#fff; min-height:0;">
        ${isUpdate ? '<p style="margin:0 0 18px; padding:14px 16px; border-radius:12px; background:#F2ECE0; font-size:13px; font-weight:300; line-height:1.6; color:#4A443A;">Our Terms of Use have changed since you last accepted them. Please read and accept the current version to continue.</p>' : ''}
        ${termsHTML()}
      </div>
      <div style="padding:16px 24px 28px; border-top:1px solid rgba(27,25,22,.10); background:#fff; box-shadow:0 -12px 24px rgba(27,25,22,.05);">
        <label for="terms-check" style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px; cursor:pointer;">
          <input type="checkbox" id="terms-check" disabled style="width:20px; height:20px; margin-top:2px; flex:none; accent-color:#A6842C;" />
          <span style="font-size:13px; font-weight:300; line-height:1.55; color:#1B1916;">I have read and agree to the ArtUP Terms of Use.</span>
        </label>
        <button class="btn btn-gold" id="accept-btn" disabled>Accept &amp; continue</button>
        <p id="scroll-hint" style="margin:12px 0 0; text-align:center; font-size:11.5px; font-weight:300; color:#8C8375;">Scroll to the end to enable acceptance.</p>
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

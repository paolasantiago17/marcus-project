import { Store } from '../store.js';
import { esc } from '../ui.js';
import { termsHTML, TERMS_SECTIONS, TERMS_LAST_UPDATED } from '../terms-content.js';

// FR-060/FR-061: the governing terms, always reachable, with the
// participant's acceptance record.
export function terms(root) {
  const p = Store.currentParticipant();
  const accepted = p && p.termsAcceptedAt
    ? new Date(p.termsAcceptedAt).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const current = p && p.termsVersion === Store.TERMS_VERSION;

  const record = !p?.termsVersion
    ? `<p style="margin:0; font-size:14.5px; font-weight:300; line-height:1.6; color:#4A443A;">You haven't accepted these terms yet — you'll be asked before submitting photos.</p>`
    : current
      ? `<p class="eyebrow" style="letter-spacing:.20em; color:#A6842C;">Your acceptance on record</p>
         <p style="margin:0; font-size:14.5px; font-weight:300; line-height:1.6; color:#4A443A;">You accepted the version last updated ${TERMS_LAST_UPDATED}, on ${accepted}, as ${esc(p.email)}.</p>`
      : `<p class="eyebrow" style="letter-spacing:.20em; color:#C4543A;">Updated since you accepted</p>
         <p style="margin:0; font-size:14.5px; font-weight:300; line-height:1.6; color:#4A443A;">You accepted an earlier version on ${accepted}. You'll be asked to accept this version before submitting photos.</p>`;

  root.innerHTML = `
    <div class="screen screen-fixed" style="background:#fff;">
      <div style="padding:14px 24px 16px; border-bottom:1px solid rgba(27,25,22,.10); display:flex; align-items:center; gap:14px;">
        <button data-nav="#/account" style="border:none; background:none; font-size:17px; color:#8C8375; cursor:pointer; padding:0;" aria-label="Back">&larr;</button>
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">Terms of Use</span>
      </div>
      <div class="scroll" id="terms-view" style="padding:24px 24px 34px; min-height:0;">
        <div style="border-radius:16px; background:#F2ECE0; padding:18px 20px; margin-bottom:26px;">${record}</div>

        <p class="eyebrow" style="letter-spacing:.20em;">Contents</p>
        <div style="border-top:1px solid rgba(27,25,22,.10); margin-bottom:28px;">
          ${TERMS_SECTIONS.map((s) => `<button data-jump="${s.id}" style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:11px 0; border:none; border-bottom:1px solid rgba(27,25,22,.07); background:none; text-align:left; font-family:inherit; font-size:15px; font-weight:300; color:#1B1916; cursor:pointer;"><span>${esc(s.text)}</span><span style="color:#8C8375;">&rarr;</span></button>`).join('')}
        </div>

        ${termsHTML()}
      </div>
    </div>`;

  // Scroll within the panel rather than changing the hash, which the router owns.
  const view = root.querySelector('#terms-view');
  root.querySelectorAll('[data-jump]').forEach((btn) => btn.addEventListener('click', () => {
    const target = view.querySelector(`#${btn.dataset.jump}`);
    if (target) view.scrollTo({ top: target.offsetTop - view.offsetTop - 12, behavior: 'smooth' });
  }));
}

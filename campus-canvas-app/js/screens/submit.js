import { Store, photoStyle } from '../store.js';
import { Router } from '../router.js';
import { bottomNav, avatarBtn, toast, wordCount, busy, esc } from '../ui.js';

const MAX_WORDS = 200;

// Draft state for the three slots, kept in-memory only until the final
// "Submit all three" — mirrors the design's "nothing writes until all
// three are valid" behaviour (FR-010, FR-016).
let slots = [null, null, null];
let activeSlot = 0;
// Set for the confirmation screen shown straight after a successful submit.
let justSubmitted = false;

function freshSlot() { return { file: null, url: null, title: '', description: '' }; }
function ensureSlots() { if (!slots.some(Boolean)) slots = [freshSlot(), freshSlot(), freshSlot()]; }
ensureSlots();

function validSlot(s) { return !!(s && s.url && s.title.trim().length > 0 && s.description.trim().length > 0 && wordCount(s.description) <= MAX_WORDS); }

export function submit(root) {
  const already = Store.myImages();
  if (already.length >= 3) { Router.go('#/submitted'); return; }
  ensureSlots();

  const filledCount = slots.filter((s) => s.url).length;
  const allValid = slots.every(validSlot);
  const active = slots[activeSlot] || freshSlot();

  root.innerHTML = `
    <div class="screen">
      <div class="topbar" style="padding-bottom:16px;">
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">Submit</span>
        <div style="display:flex; align-items:center; gap:14px;">
          <span style="font-size:12.5px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;">${filledCount} of 3 added</span>
          ${avatarBtn(Store.currentParticipant(), Store.unreadCount() > 0)}
        </div>
      </div>
      <div style="padding:0 24px 18px; display:flex; gap:8px;">
        ${[0, 1, 2].map((i) => `<span style="flex:1; height:3px; border-radius:2px; background:${slots[i].url ? '#A6842C' : 'rgba(27,25,22,.14)'};"></span>`).join('')}
      </div>
      <div class="scroll" style="padding:0 24px;">
        <p style="margin:0 0 14px; font-size:12.5px; font-weight:300; color:#8C8375;"><span style="color:#C4543A;">*</span> Photo, title and description are all required for each slot.</p>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:26px;">
          ${[0, 1, 2].map((i) => {
            const s = slots[i];
            if (s.url) {
              return `<div class="slot" data-slot="${i}" style="aspect-ratio:.78; border-radius:14px; overflow:hidden; position:relative; cursor:pointer; ${i === activeSlot ? 'outline:2px solid #A6842C; outline-offset:2px;' : ''}">
                <img src="${s.url}" alt="Submitted photo ${i + 1}" style="width:100%; height:100%; object-fit:cover; display:block;" />
                <span style="position:absolute; top:8px; right:8px; width:20px; height:20px; border-radius:10px; background:${validSlot(s) ? '#2E6B5C' : '#C4543A'}; display:block;"></span>
              </div>`;
            }
            return `<div class="slot" data-slot="${i}" style="aspect-ratio:.78; border-radius:14px; border:1px dashed rgba(27,25,22,.28); background:#F4EFE5; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; cursor:pointer; ${i === activeSlot ? 'outline:2px solid #A6842C; outline-offset:2px;' : ''}">
              <span style="width:26px; height:26px; border-radius:13px; border:1px solid #A6842C; display:block;"></span>
              <span style="font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:#8C8375;">Slot ${i + 1}</span>
            </div>`;
          }).join('')}
        </div>

        <p class="eyebrow" style="letter-spacing:.20em;">Add your photograph — slot ${activeSlot + 1} <span style="color:#C4543A;">*</span></p>
        <div style="display:flex; gap:10px; margin-bottom:28px;">
          <button class="btn btn-outline" id="cam-btn" style="height:50px;">Camera</button>
          <button class="btn btn-outline" id="lib-btn" style="height:50px;">Library</button>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment" id="cam-input" style="display:none;" />
        <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" id="lib-input" style="display:none;" />

        <p class="eyebrow" style="letter-spacing:.20em;">Give this photo a title <span style="color:#C4543A;">*</span></p>
        <input type="text" id="title-input" value="${esc(active.title)}" maxlength="80" placeholder="e.g. Sunrise walk to Convocation Hall" style="margin-bottom:24px;" />

        <p class="eyebrow" style="letter-spacing:.20em;">Why this image defines your years here <span style="color:#C4543A;">*</span></p>
        <div style="border-radius:16px; background:#FFFFFF; border:1px solid rgba(27,25,22,.12); padding:16px 18px 12px; margin-bottom:8px;">
          <textarea id="desc-input" rows="4" placeholder="Tell us why this photo matters…" style="border:none; padding:0; margin-bottom:14px;">${esc(active.description)}</textarea>
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(27,25,22,.08); padding-top:10px;">
            <span style="font-size:13px; font-weight:300; color:#8C8375;">Photo ${activeSlot + 1} of 3</span>
            <span id="word-count" style="font-size:13px; font-weight:400; color:#2E6B5C;">${wordCount(active.description)} / ${MAX_WORDS} words</span>
          </div>
        </div>
        <p style="margin:0 0 26px; font-size:13.5px; font-weight:300; color:#8C8375;">JPEG, PNG or HEIC. We check every file before your entry is accepted.</p>
      </div>
      <div style="padding:14px 24px 0;">
        <button class="btn ${allValid ? 'btn-gold' : 'btn-flat'}" id="submit-all" ${allValid ? '' : 'disabled'}>Submit all three</button>
        ${bottomNav('submit')}
      </div>
    </div>`;

  root.querySelectorAll('.slot').forEach((el) => {
    el.addEventListener('click', () => { activeSlot = Number(el.dataset.slot); submit(root); });
  });

  root.querySelector('#cam-btn').addEventListener('click', () => root.querySelector('#cam-input').click());
  root.querySelector('#lib-btn').addEventListener('click', () => root.querySelector('#lib-input').click());

  function handleFile(input) {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const okType = /^image\/(jpeg|png|heic|heif)$/i.test(file.type) || /\.(jpe?g|png|heic|heif)$/i.test(file.name);
      if (!okType) { toast('Unsupported file type — use JPEG, PNG or HEIC.'); return; }
      // The data URL is only the on-screen preview; the File itself is what
      // gets uploaded on submit. Keep any title/description already typed.
      const slotAtUpload = activeSlot;
      const reader = new FileReader();
      reader.onload = () => {
        slots[slotAtUpload] = { ...freshSlot(), ...slots[slotAtUpload], file, url: reader.result };
        submit(root);
      };
      reader.onerror = () => toast('Could not read that file — try again.');
      reader.readAsDataURL(file);
    });
  }
  handleFile(root.querySelector('#cam-input'));
  handleFile(root.querySelector('#lib-input'));

  function refreshValidityUI() {
    const s = slots[activeSlot];
    root.querySelector('#submit-all').disabled = !slots.every(validSlot);
    root.querySelector('#submit-all').className = 'btn ' + (slots.every(validSlot) ? 'btn-gold' : 'btn-flat');
    const badge = root.querySelectorAll('.slot')[activeSlot]?.querySelector('span[style*="border-radius:10px"]');
    if (badge) badge.style.background = validSlot(s) ? '#2E6B5C' : '#C4543A';
  }

  const titleInput = root.querySelector('#title-input');
  titleInput.addEventListener('input', () => {
    const s = slots[activeSlot] || (slots[activeSlot] = freshSlot());
    s.title = titleInput.value;
    refreshValidityUI();
  });

  const descInput = root.querySelector('#desc-input');
  const wc = root.querySelector('#word-count');
  descInput.addEventListener('input', () => {
    const count = wordCount(descInput.value);
    const s = slots[activeSlot] || (slots[activeSlot] = freshSlot());
    s.description = descInput.value;
    wc.textContent = `${count} / ${MAX_WORDS} words`;
    wc.style.color = count > MAX_WORDS ? '#C4543A' : '#2E6B5C';
    refreshValidityUI();
  });

  const submitBtn = root.querySelector('#submit-all');
  submitBtn.addEventListener('click', async () => {
    if (!slots.every(validSlot)) return;
    const restore = busy(submitBtn, 'Uploading photo 1 of 3…');
    // Uploads can take a while on campus data; say how far along it is and
    // warn before the tab is closed part-way through.
    const stay = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', stay);
    try {
      await Store.submitEntry(
        slots.map((s) => ({ file: s.file, title: s.title, description: s.description })),
        (step) => { submitBtn.innerHTML = step <= 3 ? `Uploading photo ${step} of 3…` : 'Saving your entry…'; },
      );
    } catch (err) {
      // NFR-004: a failed upload never reports success; the draft stays put.
      restore();
      toast(`Your photos weren’t submitted: ${err.message} Please try again.`, 6000);
      return;
    } finally {
      window.removeEventListener('beforeunload', stay);
    }
    slots = [freshSlot(), freshSlot(), freshSlot()];
    activeSlot = 0;
    justSubmitted = true;
    Router.go('#/submitted');
  });
}

export function submitted(root) {
  const fresh = justSubmitted;
  justSubmitted = false;
  if (fresh) toast('Entry submitted. Thank you!', 3200);
  const mine = Store.myImages();
  const photos = mine.slice(0, 3);
  root.innerHTML = `
    <div class="screen" style="background:#15130F; color:#F3EEE3;">
      <div class="scroll" style="padding:56px 28px 0; text-align:center;">
        <span style="width:64px; height:64px; border-radius:32px; background:#A6842C; display:inline-flex; align-items:center; justify-content:center; margin-bottom:22px;"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#15130F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <p style="margin:0 0 10px; font-size:12px; letter-spacing:.24em; text-transform:uppercase; color:#A6842C;">${fresh ? 'Submitted' : 'Entry received'}</p>
        <h2 class="h-serif" style="font-size:34px; line-height:1.1; margin-bottom:16px; color:#F7F2E7;">Your three are in.</h2>
        <p style="margin:0 auto 36px; max-width:300px; font-size:16px; font-weight:300; line-height:1.7; color:#CFC7B6;">We’ve received all three photographs and descriptions. An ArtUP curator reviews every submission before it enters voting, and you can follow each photo’s status in your profile.</p>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:36px;">
          ${photos.map((img) => `<div style="width:100%; aspect-ratio:.8; border-radius:12px; ${photoStyle(img.photo)} display:block;"></div>`).join('')}
        </div>
        <div style="border-radius:18px; border:1px solid rgba(243,238,227,.20); padding:22px; text-align:left;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
            <span style="font-size:12px; letter-spacing:.20em; text-transform:uppercase; color:#9A8F79;">Entry earned</span>
            <span class="h-serif" style="font-size:26px; color:#A6842C;">+9 pts</span>
          </div>
          <p style="margin:0; font-size:14.5px; font-weight:300; line-height:1.6; color:#CFC7B6;">Three photos, three descriptions. Points carry into voting — 20 unlocks your first raffle entry.</p>
        </div>
      </div>
      <div style="padding:20px 28px 34px;">
        <button class="btn btn-gold-dark" id="start-voting">Start voting</button>
        <button class="btn btn-outline-light" id="see-status" style="margin-top:12px;">See my submissions</button>
      </div>
    </div>`;
  root.querySelector('#start-voting').addEventListener('click', () => Router.go('#/vote'));
  root.querySelector('#see-status').addEventListener('click', () => Router.go('#/account'));
}

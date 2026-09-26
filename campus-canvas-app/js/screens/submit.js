import { Store, photoStyle } from '../store.js';
import { Router } from '../router.js';
import { bottomNav, avatarBtn, toast, wordCount, busy, esc } from '../ui.js';

const MAX_WORDS = 200;

// Draft state for the three photos, kept in memory only until the final
// "Submit all three": nothing is written until all three are valid
// (FR-010, FR-016).
let slots = [null, null, null];
// Set for the confirmation screen shown straight after a successful submit.
let justSubmitted = false;

function freshSlot() { return { file: null, url: null, title: '', description: '' }; }
function ensureSlots() { if (!slots.some(Boolean)) slots = [freshSlot(), freshSlot(), freshSlot()]; }
ensureSlots();

function validSlot(s) { return !!(s && s.url && s.title.trim().length > 0 && s.description.trim().length > 0 && wordCount(s.description) <= MAX_WORDS); }

// What's still missing on a photo card, or null when it's ready.
function slotProblem(s) {
  if (!s.url) return 'Add a photo';
  if (!s.title.trim()) return 'Add a title';
  if (!s.description.trim()) return 'Add a description';
  if (wordCount(s.description) > MAX_WORDS) return `Description is over ${MAX_WORDS} words`;
  return null;
}

function readPreview(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function okType(file) {
  return /^image\/(jpeg|png|heic|heif)$/i.test(file.type) || /\.(jpe?g|png|heic|heif)$/i.test(file.name);
}

// Each photo gets its own card with its title and description right under
// it, so it's always clear what's being described. Photos can be picked
// several at a time; they fill the empty cards in order.
export function submit(root) {
  const already = Store.myImages();
  if (already.length >= 3) { Router.go('#/submitted'); return; }
  ensureSlots();

  const filledCount = slots.filter((s) => s.url).length;
  const allValid = slots.every(validSlot);
  const emptyCount = 3 - filledCount;
  const label = 'display:block; margin:0 0 6px; font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;';

  root.innerHTML = `
    <div class="screen">
      <div class="topbar" style="padding-bottom:16px;">
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">Submit</span>
        <div style="display:flex; align-items:center; gap:14px;">
          <span id="ready-count" style="font-size:12.5px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;">${slots.filter(validSlot).length} of 3 ready</span>
          ${avatarBtn(Store.currentParticipant(), Store.unreadCount() > 0)}
        </div>
      </div>
      <div class="scroll" style="padding:0 24px;">
        <p style="margin:0 0 16px; font-size:15px; font-weight:300; line-height:1.6; color:#5B5449;">Choose three photos, then give each one a title and a few words on why it matters to you.</p>
        ${emptyCount ? `
        <div style="display:flex; gap:10px; margin-bottom:22px;">
          <button class="btn btn-gold" id="multi-btn" style="height:50px;">Choose ${emptyCount === 3 ? 'photos' : emptyCount === 1 ? '1 more photo' : `${emptyCount} more photos`}</button>
          <button class="btn btn-outline" id="cam-btn" style="height:50px; width:auto; padding:0 20px;">Camera</button>
        </div>` : ''}
        <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" multiple id="multi-input" style="display:none;" />
        <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment" id="cam-input" style="display:none;" />
        <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" id="slot-input" style="display:none;" />

        ${slots.map((s, i) => {
          const problem = slotProblem(s);
          return `
          <div class="card" data-card="${i}" style="padding:16px; margin-bottom:16px; border-radius:18px; border:1px solid ${problem ? 'rgba(27,25,22,.10)' : 'rgba(46,107,92,.45)'};">
            <div style="display:flex; gap:14px; align-items:flex-start; margin-bottom:14px;">
              ${s.url ? `
              <div style="flex:none; width:92px;">
                <img src="${s.url}" alt="Photo ${i + 1}" style="width:92px; height:112px; object-fit:cover; border-radius:12px; display:block;" />
                <div style="display:flex; justify-content:space-between; margin-top:6px;">
                  <a href="#" data-replace="${i}" style="font-size:12px; color:#A6842C; text-decoration:underline;">Replace</a>
                  <a href="#" data-remove="${i}" style="font-size:12px; color:#8C8375; text-decoration:underline;">Remove</a>
                </div>
              </div>` : `
              <button data-add="${i}" style="flex:none; width:92px; height:112px; border-radius:12px; border:1px dashed rgba(27,25,22,.30); background:#F4EFE5; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; cursor:pointer; color:#8C8375; font-family:inherit;">
                <span style="font-size:24px; line-height:1; color:#A6842C;">+</span>
                <span style="font-size:11px; letter-spacing:.12em; text-transform:uppercase;">Add photo</span>
              </button>`}
              <div style="flex:1; min-width:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                  <span class="h-serif" style="font-size:18px;">Photo ${i + 1}</span>
                  <span data-status="${i}" style="font-size:12px; font-weight:400; color:${problem ? '#A6842C' : '#2E6B5C'};">${problem || '&#10003; Ready'}</span>
                </div>
                <label for="title-${i}" style="${label}">Title <span style="color:#C4543A;">*</span></label>
                <input type="text" id="title-${i}" data-title="${i}" value="${esc(s.title)}" maxlength="80" placeholder="e.g. Sunrise walk to Grant Hall" style="height:44px; font-size:15px;" />
              </div>
            </div>
            <label for="desc-${i}" style="${label}">Why this photo matters <span style="color:#C4543A;">*</span></label>
            <textarea id="desc-${i}" data-desc="${i}" rows="3" placeholder="Tell us why this place defines your years here…" style="font-size:15px;">${esc(s.description)}</textarea>
            <p data-words="${i}" style="margin:6px 0 0; text-align:right; font-size:12.5px; color:${wordCount(s.description) > MAX_WORDS ? '#C4543A' : '#8C8375'};">${wordCount(s.description)} / ${MAX_WORDS} words</p>
          </div>`;
        }).join('')}
        <p style="margin:0 0 26px; font-size:13.5px; font-weight:300; color:#8C8375;">JPEG, PNG or HEIC. We check every file before your entry is accepted.</p>
      </div>
      <div style="padding:14px 24px 0;">
        <button class="btn ${allValid ? 'btn-gold' : 'btn-flat'}" id="submit-all" ${allValid ? '' : 'disabled'}>Submit all three</button>
        ${bottomNav('submit')}
      </div>
    </div>`;

  // Photos land in the empty cards in order; a card's own button targets it.
  let targetSlot = null;
  async function addFiles(files) {
    const good = files.filter(okType);
    if (good.length < files.length) toast('Some files were skipped. Use JPEG, PNG or HEIC.', 3200);
    const open = targetSlot !== null ? [targetSlot] : slots.map((s, i) => (s.url ? null : i)).filter((i) => i !== null);
    targetSlot = null;
    if (good.length > open.length) toast(`An entry has three photos, so we added the first ${open.length}.`, 3600);
    try {
      for (const [n, file] of good.slice(0, open.length).entries()) {
        const i = open[n];
        slots[i] = { ...freshSlot(), ...slots[i], file, url: await readPreview(file) };
      }
    } catch (e) {
      toast('Could not read that file. Try again.');
    }
    submit(root);
  }
  const multiInput = root.querySelector('#multi-input');
  const camInput = root.querySelector('#cam-input');
  const slotInput = root.querySelector('#slot-input');
  multiInput.addEventListener('change', () => addFiles([...multiInput.files]));
  camInput.addEventListener('change', () => addFiles([...camInput.files]));
  slotInput.addEventListener('change', () => addFiles([...slotInput.files]));
  root.querySelector('#multi-btn')?.addEventListener('click', () => { targetSlot = null; multiInput.click(); });
  root.querySelector('#cam-btn')?.addEventListener('click', () => { targetSlot = null; camInput.click(); });
  root.querySelectorAll('[data-add], [data-replace]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    targetSlot = Number(el.dataset.add ?? el.dataset.replace);
    slotInput.click();
  }));
  root.querySelectorAll('[data-remove]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    const i = Number(el.dataset.remove);
    slots[i] = { ...slots[i], file: null, url: null };
    submit(root);
  }));

  // Typing updates the card's status in place rather than redrawing, so the
  // keyboard stays open.
  function refresh(i) {
    const s = slots[i];
    const problem = slotProblem(s);
    const status = root.querySelector(`[data-status="${i}"]`);
    status.innerHTML = problem || '&#10003; Ready';
    status.style.color = problem ? '#A6842C' : '#2E6B5C';
    root.querySelector(`[data-card="${i}"]`).style.borderColor = problem ? 'rgba(27,25,22,.10)' : 'rgba(46,107,92,.45)';
    const ok = slots.every(validSlot);
    const btn = root.querySelector('#submit-all');
    btn.disabled = !ok;
    btn.className = 'btn ' + (ok ? 'btn-gold' : 'btn-flat');
    root.querySelector('#ready-count').textContent = `${slots.filter(validSlot).length} of 3 ready`;
  }
  root.querySelectorAll('[data-title]').forEach((el) => el.addEventListener('input', () => {
    const i = Number(el.dataset.title);
    slots[i].title = el.value;
    refresh(i);
  }));
  root.querySelectorAll('[data-desc]').forEach((el) => el.addEventListener('input', () => {
    const i = Number(el.dataset.desc);
    slots[i].description = el.value;
    const count = wordCount(el.value);
    const words = root.querySelector(`[data-words="${i}"]`);
    words.textContent = `${count} / ${MAX_WORDS} words`;
    words.style.color = count > MAX_WORDS ? '#C4543A' : '#8C8375';
    refresh(i);
  }));

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

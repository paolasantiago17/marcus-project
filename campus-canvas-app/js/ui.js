// Small shared UI helpers: toast, icons, bottom nav, avatar button.

// Everything participants or admins type is shared with other people now,
// so it must be escaped before it goes into an innerHTML template.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Only allow web links in notice CTAs (no javascript: URLs).
export function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? esc(url) : '#';
}

export function toast(msg, ms = 2200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

export const icons = {
  submit: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M9 13l2 2 4-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  vote: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.35-9.5-8.5C.9 8 2.6 4.5 6 4.5c2 0 3.4 1.1 4 2.2.6-1.1 2-2.2 4-2.2 3.4 0 5.1 3.5 3.5 7C19 15.65 12 20 12 20z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  notices: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 8a7 7 0 0 1 14 0v5l2 3H3l2-3V8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  feedback: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
};

export function bottomNav(active) {
  const tabs = [
    ['submit', 'Submit', icons.submit],
    ['vote', 'Vote', icons.vote],
    ['notices', 'Notices', icons.notices],
    ['feedback', 'Feedback', icons.feedback],
  ];
  return `<nav class="bottomnav">${tabs.map(([key, label, icon]) => `
    <a href="#/${key}" class="${active === key ? 'active' : ''}">
      ${icon}<span>${label}</span>
    </a>`).join('')}</nav>`;
}

export function avatarBtn(participant, unread) {
  const initials = participant ? participant.name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase() : '?';
  return `<button class="avatar-btn" data-nav="#/account" aria-label="Account">${esc(initials)}${unread ? '<span class="dot"></span>' : ''}</button>`;
}

export function wordCount(text) {
  return (text.trim().match(/\S+/g) || []).length;
}

// Disables a button and swaps its label while an async action runs, so a
// slow network can't produce double submissions. Returns a restore function.
export function busy(button, label) {
  if (!button) return () => {};
  const original = button.innerHTML;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.innerHTML = label;
  return () => { button.disabled = wasDisabled; button.innerHTML = original; };
}

// Starts downloading photos before they're shown, so the next voting card
// appears instantly instead of loading after each vote. Only the most recent
// few are held on to; the browser cache keeps the files themselves.
const warmed = new Map();
export function preloadPhotos(images) {
  for (const img of images) {
    const url = img && img.photo;
    if (!url || url.startsWith('linear-gradient') || warmed.has(url)) continue;
    const el = new Image();
    el.decoding = 'async';
    el.src = url;
    warmed.set(url, el);
    if (warmed.size > 8) warmed.delete(warmed.keys().next().value);
  }
}

export function statusScreen(root, title, body) {
  root.innerHTML = `
    <div class="screen" style="align-items:center; justify-content:center; text-align:center; padding:40px 32px;">
      <img src="assets/monogram.png" alt="ArtUP" style="height:28px; width:auto; margin-bottom:24px;" />
      <h2 class="h-serif" style="font-size:26px; margin-bottom:10px;">${esc(title)}</h2>
      <p style="margin:0; font-size:15.5px; font-weight:300; line-height:1.6; color:#5B5449;">${esc(body)}</p>
    </div>`;
}

// Tells a student how the curators' review of their photos went, the first
// time they open the app after it happens.
export function photoUpdateSheet(images, onSee) {
  if (document.getElementById('photo-update')) return;
  const accepted = images.filter((i) => i.status === 'accepted').length;
  const rejected = images.length - accepted;
  const headline = !rejected ? (accepted === 1 ? 'Your photo is in voting!' : 'Your photos are in voting!')
    : !accepted ? 'An update on your photos' : 'Your photos have been reviewed';
  const el = document.createElement('div');
  el.id = 'photo-update';
  el.className = 'sheet-overlay';
  el.innerHTML = `
    <div class="sheet" style="padding:26px 24px 28px;">
      <p class="eyebrow" style="letter-spacing:.20em; margin-bottom:6px;">Curator review</p>
      <h3 class="h-serif" style="font-size:25px; line-height:1.15; margin-bottom:18px;">${headline}</h3>
      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:${rejected ? 14 : 22}px;">
        ${images.map((img) => `
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="flex:none; width:48px; height:48px; border-radius:10px; background:#EDE6D8 center/cover url('${esc(img.photo)}');"></div>
            <span style="flex:1; min-width:0; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(img.title)}</span>
            <span style="flex:none; font-size:12px; letter-spacing:.10em; text-transform:uppercase; color:${img.status === 'accepted' ? '#2E6B5C' : '#C4543A'};">${img.status === 'accepted' ? 'In voting' : 'Not accepted'}</span>
          </div>`).join('')}
      </div>
      ${rejected ? '<p style="margin:0 0 22px; font-size:14px; font-weight:300; line-height:1.6; color:#5B5449;">Every photo is checked against the contest guidelines, and ones that don’t meet them aren’t added to voting. Questions? Send us a note from the Feedback tab.</p>' : ''}
      <button class="btn btn-gold" id="photo-update-see" style="margin-bottom:12px;">See my submissions</button>
      <button class="btn btn-outline" id="photo-update-close">Close</button>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#photo-update-close').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('#photo-update-see').addEventListener('click', () => { close(); onSee(); });
}

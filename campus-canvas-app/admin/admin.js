import { Store, photoStyle } from '../js/store.js';
import { toast, busy, esc } from '../js/ui.js';

const root = document.getElementById('admin-app');
let signedIn = false;
let adminEmail = '';
let tab = 'review';
let reviewIndex = 0;
let reviewFilter = 'pending';
let editingImageId = null;
let participantQuery = '';
// Photos queued in the "Add photos" tab: [{ id, file, preview, title, description }]
let uploadQueue = [];
let uploadCredit = 'ArtUP';

// Don't redraw over a field someone is typing in when a background refresh
// lands; the next action re-renders with fresh data anyway.
window.addEventListener('cc:change', () => {
  const typing = root.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (signedIn && !typing) render();
});
window.addEventListener('cc:error', (e) => toast(e.detail, 3200));

// Runs an admin action with a busy button and a toast on failure.
async function act(button, label, fn, successMsg) {
  const restore = busy(button, label);
  try {
    await fn();
    if (successMsg) toast(successMsg);
    return true;
  } catch (err) {
    restore();
    toast(err.message, 3600);
    return false;
  }
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCSV(rows) {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function render() {
  if (!signedIn) return renderGate();
  root.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-side">
        <div class="brand"><img src="../assets/monogram.png" alt="ArtUP" /><span>Console</span></div>
        ${navItem('review', 'Review queue', Store.pendingImages().length)}
        ${navItem('upload', 'Add photos', uploadQueue.length)}
        ${navItem('rankings', 'Rankings')}
        ${navItem('participants', 'Participants', Store.pendingParticipants().length, true)}
        ${navItem('notices', 'Notices')}
        ${navItem('feedback', 'Feedback', Store.state.feedback.filter((f) => f.status === 'open').length, true)}
        ${navItem('exports', 'Exports')}
        ${navItem('audit', 'Audit log')}
        <p style="margin:36px 22px 0; font-size:11px; font-weight:300; line-height:1.7; color:#7D7360;">Signed in as<br />${esc(adminEmail)}</p>
        <div style="padding:22px; margin-top:14px; display:flex; gap:18px;">
          <span id="refresh" style="font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#CFC7B6; cursor:pointer; border-bottom:1px solid rgba(207,199,182,.4);">Refresh</span>
          <span id="sign-out" style="font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#CFC7B6; cursor:pointer; border-bottom:1px solid rgba(207,199,182,.4);">Sign out</span>
        </div>
      </aside>
      <div class="admin-main">${tabContent()}</div>
    </div>
  `;
  wireEvents();
}

function navItem(key, label, badge, red) {
  return `<div class="admin-nav-item ${tab === key ? 'active' : ''}" data-tab="${key}">
    <span>${label}</span>${badge ? `<span class="badge${red ? ' red' : ''}">${badge}</span>` : ''}
  </div>`;
}

function tabContent() {
  if (tab === 'review') return reviewTab();
  if (tab === 'upload') return uploadTab();
  if (tab === 'rankings') return rankingsTab();
  if (tab === 'participants') return participantsTab();
  if (tab === 'notices') return noticesTab();
  if (tab === 'feedback') return feedbackTab();
  if (tab === 'exports') return exportsTab();
  if (tab === 'audit') return auditTab();
  return '';
}

function submitterLine(img) {
  const owner = Store.state.participants[img.participantId];
  if (img.source === 'admin') return `Added by curators · credited to ${esc(img.credit)}`;
  return `${esc(owner?.name || img.credit || 'Unknown')}${owner ? ` · ${esc(owner.email)}` : ''}`;
}

const INPUT = 'width:100%; border-radius:10px; border:1px solid rgba(27,25,22,.14); background:#FBF8F2; padding:0 14px;';

function reviewTab() {
  const stats = Store.stats();
  const header = `
    <div class="admin-header">
      <div><p class="eyebrow">Queen's University · 2027 pilot</p><h3>Submission review</h3></div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="chip ${reviewFilter === 'pending' ? 'solid' : ''}" data-review-filter="pending" style="cursor:pointer;">Pending ${stats.pending}</span>
        <span class="chip ${reviewFilter === 'accepted' ? 'solid' : ''}" data-review-filter="accepted" style="cursor:pointer;">Accepted ${stats.accepted}</span>
        <span class="chip ${reviewFilter === 'rejected' ? 'solid' : ''}" data-review-filter="rejected" style="cursor:pointer;">Rejected ${stats.rejected}</span>
      </div>
    </div>`;

  if (reviewFilter !== 'pending') return header + reviewListHTML(reviewFilter);

  const pending = Store.pendingImages();
  if (reviewIndex >= pending.length) reviewIndex = 0;
  const img = pending[reviewIndex];
  if (!img) return `${header}<div style="padding:60px 32px; text-align:center; color:#8C8375;">Nothing waiting for review.</div>`;
  const entryCount = img.participantId ? Store.myImages(img.participantId).length : 0;
  return `${header}
    <div style="display:grid; grid-template-columns:1.15fr 1fr;">
      <div style="padding:28px 32px; border-right:1px solid rgba(27,25,22,.10);">
        <p class="eyebrow">Now reviewing · ${pending.length > 1 ? `${reviewIndex + 1} of ${pending.length}` : '1 of 1'}</p>
        <a href="${esc(img.photo)}" target="_blank" rel="noopener"><div style="width:100%; aspect-ratio:1.24; border-radius:10px; ${photoStyle(img.photo)} margin-bottom:20px;"></div></a>
        <div style="display:flex; gap:10px; margin-bottom:22px;">
          <button id="accept-btn" style="flex:1; height:48px; border-radius:24px; background:#2E6B5C; color:#FFFDF8; border:none; font-size:11.5px; font-weight:500; letter-spacing:.18em; text-transform:uppercase; cursor:pointer;">Accept</button>
          <button id="reject-btn" style="flex:1; height:48px; border-radius:24px; border:1px solid rgba(196,84,58,.45); background:none; color:#C4543A; font-size:11.5px; font-weight:500; letter-spacing:.18em; text-transform:uppercase; cursor:pointer;">Reject</button>
          <button id="skip-btn" title="Next pending" style="width:48px; height:48px; border-radius:24px; border:1px solid rgba(27,25,22,.18); background:none; font-size:16px; color:#8C8375; cursor:pointer;">&rarr;</button>
        </div>
        <p class="eyebrow" style="letter-spacing:.20em;">Internal note (never shown publicly)</p>
        <textarea id="review-note" rows="3" style="${INPUT} padding:12px 14px; font-size:13px; font-weight:300; color:#4A443A;" placeholder="Optional note…">${esc(img.note)}</textarea>
      </div>
      <div style="padding:28px 32px;">
        <p style="margin:0 0 22px; font-size:12.5px; font-weight:300; letter-spacing:.06em; color:#8C8375;">${submitterLine(img)} · submitted ${new Date(img.submittedAt).toLocaleDateString()}</p>
        <p class="eyebrow" style="letter-spacing:.20em;">Title <span style="color:#C4543A;">*</span></p>
        <input id="review-title" type="text" value="${esc(img.title)}" maxlength="80" style="${INPUT} height:44px; font-family:'Bodoni Moda',serif; font-size:18px; margin-bottom:20px;" />
        <p class="eyebrow" style="letter-spacing:.20em;">Description <span style="color:#C4543A;">*</span></p>
        <textarea id="review-desc" rows="4" style="${INPUT} padding:12px 14px; font-size:14px; font-weight:300; line-height:1.65; color:#26231E; margin-bottom:12px;">${esc(img.description)}</textarea>
        <button id="save-details-btn" class="btn btn-outline" style="width:auto; height:36px; padding:0 18px; font-size:11px; margin-bottom:26px;">Save changes</button>
        <div style="border-top:1px solid rgba(27,25,22,.10);">
          ${row('Image ID', esc(img.id.slice(0, 8)))}
          ${img.participantId ? row('Entry completeness', `${entryCount} of 3 images`) : ''}
          ${row('Status', 'Pending review', true)}
        </div>
      </div>
    </div>`;
}

function reviewListHTML(status) {
  const images = Store.allImages().filter((i) => i.status === status);
  const other = status === 'accepted' ? { key: 'rejected', label: 'Reject' } : { key: 'accepted', label: 'Accept' };
  if (!images.length) {
    return `<div style="padding:60px 32px; text-align:center; color:#8C8375;">No ${status} submissions yet.</div>`;
  }
  const pill = 'flex:1; height:32px; border-radius:16px; border:1px solid rgba(27,25,22,.16); display:flex; align-items:center; justify-content:center; font-size:10.5px; letter-spacing:.10em; text-transform:uppercase; color:#4A443A; cursor:pointer;';
  return `
    <div style="padding:20px 32px 32px; display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:16px;">
      ${images.map((img) => {
        if (editingImageId === img.id) {
          return `<div class="card" style="overflow:hidden; padding:14px;">
            <p class="eyebrow" style="letter-spacing:.16em;">Title <span style="color:#C4543A;">*</span></p>
            <input id="edit-title-${img.id}" type="text" value="${esc(img.title)}" maxlength="80" style="${INPUT} height:38px; font-size:13px; margin-bottom:12px;" />
            <p class="eyebrow" style="letter-spacing:.16em;">Description <span style="color:#C4543A;">*</span></p>
            <textarea id="edit-desc-${img.id}" rows="4" style="${INPUT} padding:10px 12px; font-size:12.5px; font-weight:300; margin-bottom:12px;">${esc(img.description)}</textarea>
            <div style="display:flex; gap:8px;">
              <button data-save-edit="${img.id}" style="${pill} background:#1B1916; color:#FBF8F2; border:none;">Save</button>
              <button data-cancel-edit="1" style="${pill} background:none;">Cancel</button>
            </div>
          </div>`;
        }
        return `<div class="card" style="overflow:hidden;">
          <div style="width:100%; aspect-ratio:1.3; ${photoStyle(img.photo)}"></div>
          <div style="padding:14px;">
            <p style="margin:0 0 4px; font-size:14px; font-weight:400;">${esc(img.title)}</p>
            <p style="margin:0 0 12px; font-size:12px; font-weight:300; color:#8C8375;">${img.source === 'admin' ? `Curator upload · ${esc(img.credit)}` : esc(img.credit)} · ${img.reviewedAt ? new Date(img.reviewedAt).toLocaleDateString() : '—'}</p>
            <div style="display:flex; gap:8px;">
              <button data-edit-image="${img.id}" style="${pill} background:none;">Edit</button>
              <button data-review-move="${img.id}:${other.key}" style="${pill} background:none;">${other.label}</button>
              <button data-review-move="${img.id}:pending" style="${pill} background:none;">Reopen</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function row(label, value, last) {
  return `<div style="display:flex; justify-content:space-between; padding:13px 0; ${last ? '' : 'border-bottom:1px solid rgba(27,25,22,.07);'} font-size:13px;"><span style="color:#8C8375;">${label}</span><span style="font-weight:400;">${value}</span></div>`;
}

function uploadTab() {
  const ready = uploadQueue.length > 0 && uploadQueue.every((u) => u.title.trim() && u.description.trim());
  const curatorCount = Store.acceptedImages().filter((i) => i.source === 'admin').length;
  return `
    <div class="admin-header">
      <div><p class="eyebrow">Curated catalogue</p><h3>Add photos</h3></div>
      <span class="chip">${curatorCount} curator photo${curatorCount === 1 ? '' : 's'} live</span>
    </div>
    <div style="padding:26px 32px 32px;">
      <p style="margin:0 0 20px; max-width:620px; font-size:13.5px; font-weight:300; line-height:1.7; color:#4A443A;">Photos added here skip review and go straight into the voting catalogue. Every photo needs a title and a description, just like a student entry.</p>
      <label id="drop-zone" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:1px dashed rgba(27,25,22,.28); background:#F4EFE5; border-radius:14px; padding:30px; cursor:pointer; margin-bottom:22px;">
        <span style="font-family:'Bodoni Moda',serif; font-size:18px;">Choose photos</span>
        <span style="font-size:12px; font-weight:300; color:#8C8375;">JPEG, PNG or WebP · select several at once, or drop them here</span>
        <input id="upload-files" type="file" accept="image/jpeg,image/png,image/webp" multiple style="display:none;" />
      </label>

      ${uploadQueue.length ? `
      <div style="display:grid; grid-template-columns:220px 1fr; gap:14px; align-items:end; margin-bottom:18px; max-width:620px;">
        <div>
          <p class="eyebrow" style="letter-spacing:.18em;">Credit shown to voters</p>
          <input id="upload-credit" type="text" value="${esc(uploadCredit)}" maxlength="60" style="${INPUT} height:40px; font-size:13px;" />
        </div>
        <p style="margin:0 0 10px; font-size:12px; font-weight:300; color:#8C8375;">Appears as “by …” on the vote card.</p>
      </div>
      <div style="display:flex; flex-direction:column; gap:14px; margin-bottom:22px;">
        ${uploadQueue.map((u) => `
          <div class="card" style="display:grid; grid-template-columns:160px 1fr auto; gap:18px; padding:14px; align-items:start;">
            <div style="width:160px; aspect-ratio:1.3; border-radius:8px; ${photoStyle(u.preview)}"></div>
            <div>
              <p class="eyebrow" style="letter-spacing:.16em;">Title <span style="color:#C4543A;">*</span></p>
              <input data-upload-title="${u.id}" type="text" value="${esc(u.title)}" maxlength="80" placeholder="e.g. Grant Hall at dusk" style="${INPUT} height:38px; font-size:13px; margin-bottom:12px;" />
              <p class="eyebrow" style="letter-spacing:.16em;">Description <span style="color:#C4543A;">*</span></p>
              <textarea data-upload-desc="${u.id}" rows="3" placeholder="What makes this place part of the Queen's story?" style="${INPUT} padding:10px 12px; font-size:12.5px; font-weight:300;">${esc(u.description)}</textarea>
            </div>
            <button data-upload-remove="${u.id}" style="border:none; background:none; color:#8C8375; font-size:18px; cursor:pointer;" title="Remove">&times;</button>
          </div>`).join('')}
      </div>
      <button id="upload-submit" class="btn ${ready ? 'btn-gold' : 'btn-flat'}" ${ready ? '' : 'disabled'} style="width:auto; height:44px; padding:0 24px; font-size:11.5px;">Add ${uploadQueue.length} to catalogue</button>
      ` : ''}
    </div>`;
}

function rankingsTab() {
  const stats = Store.stats();
  const rankings = Store.imageRankings();
  const medianLikeRate = rankings.length ? rankings[Math.floor(rankings.length / 2)].rate.toFixed(0) : '0';
  return `
    <div class="admin-header">
      <div><p class="eyebrow">Voting analytics</p><h3>Image rankings</h3></div>
      <div style="display:flex; gap:10px;">
        <button id="export-csv" class="btn btn-gold" style="width:auto; height:40px; padding:0 18px; font-size:11.5px;">Export CSV</button>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(5,1fr); border-bottom:1px solid rgba(27,25,22,.10);">
      ${statCell(stats.registered, 'Registered')}
      ${statCell(stats.completedEntries, 'Completed entries')}
      ${statCell(stats.accepted, 'Accepted images')}
      ${statCell(stats.votesCast, 'Votes cast')}
      ${statCell(medianLikeRate + '%', 'Median like rate', true)}
    </div>
    <div style="padding:8px 32px 32px; overflow-x:auto;">
      <table class="rank-table">
        <thead><tr><th>Rank</th><th>Image</th><th>Title</th><th>Credit</th><th class="num">Likes</th><th class="num">Pass</th><th class="num">Votes</th><th class="num">Like rate</th></tr></thead>
        <tbody>
          ${rankings.length ? rankings.map((r, i) => `<tr>
            <td style="font-family:'Bodoni Moda',serif; font-size:16px; color:#A6842C;">${String(i + 1).padStart(2, '0')}</td>
            <td><div style="width:52px; height:40px; border-radius:5px; ${photoStyle(r.img.photo)}"></div></td>
            <td>${esc(r.img.title)}</td>
            <td style="color:#6E6659;">${esc(r.img.credit)}${r.img.source === 'admin' ? ' <span style="color:#A6842C;">· curator</span>' : ''}</td>
            <td class="num">${r.likes}</td>
            <td class="num" style="color:#8C8375;">${r.passes}</td>
            <td class="num" style="color:#8C8375;">${r.total}</td>
            <td class="num" style="font-weight:500; color:${r.rate >= 60 ? '#2E6B5C' : '#4A443A'};">${r.rate.toFixed(1)}%</td>
          </tr>`).join('') : `<tr><td colspan="8" style="text-align:center; padding:30px; color:#8C8375;">No accepted images yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function statCell(value, label, last) {
  return `<div style="padding:22px 24px; ${last ? '' : 'border-right:1px solid rgba(27,25,22,.08);'}">
    <p class="h-serif" style="font-size:30px; margin-bottom:8px; color:${label.includes('like') ? '#A6842C' : 'inherit'};">${value}</p>
    <p style="margin:0; font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;">${label}</p>
  </div>`;
}

function participantsTab() {
  const list = Object.values(Store.state.participants)
    .filter((p) => !participantQuery || p.name.toLowerCase().includes(participantQuery) || p.email.toLowerCase().includes(participantQuery))
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  const waiting = Store.pendingParticipants();
  const pill = 'height:32px; padding:0 16px; border-radius:16px; border:1px solid rgba(27,25,22,.16); background:none; font-size:10.5px; letter-spacing:.10em; text-transform:uppercase; color:#4A443A; cursor:pointer;';
  return `
    ${waiting.length ? `
    <div class="admin-header">
      <div><p class="eyebrow">Not a @queensu.ca email</p><h3>Waiting for approval</h3></div>
    </div>
    <div style="padding:8px 32px 8px; display:grid; gap:10px;">
      ${waiting.map((p) => `
        <div class="card" style="padding:14px 18px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <div style="flex:1; min-width:200px;">
            <p style="margin:0 0 2px; font-size:14px;">${esc(p.name)}</p>
            <p style="margin:0; font-size:12.5px; font-weight:300; color:#6E6659;">${esc(p.email)} · signed up ${new Date(p.registeredAt).toLocaleDateString()}</p>
          </div>
          <button data-access="${p.id}:approved" style="${pill} background:#1B1916; color:#FBF8F2; border:none;">Approve</button>
          <button data-access="${p.id}:rejected" style="${pill}">Reject</button>
        </div>`).join('')}
    </div>` : ''}
    <div class="admin-header">
      <div><p class="eyebrow">Contest roster</p><h3>Participants</h3></div>
      <input type="text" id="p-search" placeholder="Search name or email…" value="${esc(participantQuery)}" style="width:260px; height:40px; border-radius:20px; border:1px solid rgba(27,25,22,.16); padding:0 16px; font-size:13px;" />
    </div>
    <div style="padding:8px 32px 32px; overflow-x:auto;">
      <table class="rank-table">
        <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Registered</th><th>Terms</th><th>Entry</th><th class="num">Votes cast</th><th class="num">Points</th></tr></thead>
        <tbody>
          ${list.length ? list.map((p) => {
            const mine = Store.myImages(p.id);
            const votes = Store.state.votes.filter((v) => v.participantId === p.id).length;
            return `<tr>
              <td>${esc(p.name)}</td>
              <td style="color:#6E6659;">${esc(p.email)}</td>
              <td>${accessCell(p)}</td>
              <td style="color:#6E6659;">${new Date(p.registeredAt).toLocaleDateString()}</td>
              <td>${p.termsVersion === Store.TERMS_VERSION ? 'Current' : p.termsVersion ? `<span style="color:#A6842C;">Older (${esc(p.termsVersion)})</span>` : '<span style="color:#C4543A;">Not accepted</span>'}</td>
              <td>${mine.length}/3</td>
              <td class="num">${votes}</td>
              <td class="num">${p.points}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="8" style="text-align:center; padding:30px; color:#8C8375;">No participants match.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// @queensu.ca participants are always in; anyone else can be approved or
// rejected from here at any time.
function accessCell(p) {
  const link = (access, label) => `<span data-access="${p.id}:${access}" style="margin-left:8px; font-size:11px; color:#A6842C; cursor:pointer; text-decoration:underline;">${label}</span>`;
  if (/@queensu\.ca$/i.test(p.email)) return '<span style="color:#6E6659;">Queen’s</span>';
  if (p.access === 'approved') return `Approved${link('rejected', 'Reject')}`;
  if (p.access === 'rejected') return `<span style="color:#C4543A;">Rejected</span>${link('approved', 'Approve')}`;
  return `<span style="color:#A6842C;">Pending</span>`;
}

function noticesTab() {
  const list = Store.allNotices();
  const reads = (id) => Store.state.noticeReads.filter((r) => r.noticeId === id).length;
  return `
    <div style="display:grid; grid-template-columns:1.2fr 1fr;">
      <div style="padding:26px 32px; border-right:1px solid rgba(27,25,22,.10);">
        <div class="admin-header" style="padding:0 0 26px; border:none;">
          <div><p class="eyebrow">Program communications</p><h3>Compose a notice</h3></div>
        </div>
        <p class="eyebrow" style="letter-spacing:.18em;">Title <span style="color:#C4543A;">*</span></p>
        <input id="n-title" type="text" style="${INPUT} height:46px; font-size:14px; margin-bottom:18px;" placeholder="Notice title" />
        <p class="eyebrow" style="letter-spacing:.18em;">Message <span style="color:#C4543A;">*</span></p>
        <textarea id="n-body" rows="3" style="${INPUT} padding:12px 14px; font-size:13.5px; font-weight:300; margin-bottom:18px;" placeholder="Notice body"></textarea>
        <div style="display:grid; grid-template-columns:1fr 1fr 1.4fr; gap:14px; margin-bottom:20px;">
          <div><p class="eyebrow" style="letter-spacing:.18em;">Category</p><input id="n-cat" type="text" style="${INPUT} height:46px; font-size:14px;" placeholder="Announcement" /></div>
          <div><p class="eyebrow" style="letter-spacing:.18em;">CTA label</p><input id="n-cta" type="text" style="${INPUT} height:46px; font-size:14px;" placeholder="Visit artup.life" /></div>
          <div><p class="eyebrow" style="letter-spacing:.18em;">Outbound URL</p><input id="n-url" type="url" style="${INPUT} height:46px; font-size:14px;" placeholder="https://artup.life" /></div>
        </div>
        <button id="n-publish" class="btn btn-gold" style="width:auto; height:40px; padding:0 20px; font-size:11px;">Publish</button>

        <p class="eyebrow" style="letter-spacing:.18em; margin-top:30px;">Published</p>
        <div style="border-top:1px solid rgba(27,25,22,.10);">
          ${list.map((n) => `<div style="display:flex; align-items:center; justify-content:space-between; padding:14px 0; border-bottom:1px solid rgba(27,25,22,.07); font-size:13.5px;">
            <span style="${n.status === 'retired' ? 'color:#8C8375;' : ''}">${esc(n.title)}</span>
            <span style="display:flex; gap:14px; align-items:center; color:#8C8375; font-size:12px; font-weight:300;">
              ${reads(n.id)} read${reads(n.id) === 1 ? '' : 's'}
              <span style="color:${n.status === 'live' ? '#2E6B5C' : '#8C8375'};">${n.status === 'live' ? 'Live' : 'Retired'}</span>
              ${n.status === 'live' ? `<button data-retire="${n.id}" style="border:none; background:none; color:#8C8375; cursor:pointer; text-decoration:underline; font-size:12px;">Retire</button>` : ''}
            </span>
          </div>`).join('') || '<p style="padding:20px 0; color:#8C8375; font-size:13px;">Nothing published yet.</p>'}
        </div>
      </div>
      <div style="padding:26px 32px; background:#FBF8F2;">
        <p class="eyebrow">Inbox</p>
        <h3 class="h-serif" style="font-size:26px; margin-bottom:20px;">Feedback preview</h3>
        ${Store.allFeedback().slice(0, 4).map((f) => `<div class="card" style="padding:16px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;"><span>${esc(f.owner?.name || 'Unknown')}</span><span style="color:#8C8375; font-weight:300; font-size:11.5px;">${new Date(f.submittedAt).toLocaleDateString()}</span></div>
          <p style="margin:0; font-size:13px; font-weight:300; color:#4A443A;">${esc(f.message)}</p>
        </div>`).join('') || '<p style="color:#8C8375; font-size:13px;">No feedback yet.</p>'}
        <p style="margin-top:10px;"><span data-tab="feedback" style="font-size:12px; color:#A6842C; cursor:pointer; text-decoration:underline;">Open full inbox &rarr;</span></p>
      </div>
    </div>`;
}

function feedbackTab() {
  const list = Store.allFeedback();
  return `
    <div class="admin-header"><div><p class="eyebrow">Inbox</p><h3>Feedback</h3></div>
      <button id="export-fb" class="chip" style="border:1px solid rgba(27,25,22,.18); background:none; cursor:pointer;">Export</button>
    </div>
    <div style="padding:24px 32px;">
      ${list.length ? list.map((f) => `<div class="card" style="padding:18px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
          <span style="font-size:13px; font-weight:400;">${esc(f.owner?.name || 'Unknown')} <span style="color:#8C8375; font-weight:300;">· ${esc(f.owner?.email || '')} · ${esc(f.category)}</span></span>
          <span style="font-size:11.5px; font-weight:300; color:#8C8375;">${new Date(f.submittedAt).toLocaleString()}</span>
        </div>
        <p style="margin:0 0 12px; font-size:13.5px; font-weight:300; line-height:1.65; color:#4A443A; white-space:pre-wrap;">${esc(f.message)}</p>
        <div style="display:flex; gap:8px; align-items:center;">
          <span style="height:30px; padding:0 12px; border-radius:15px; background:${f.status === 'resolved' ? '#2E6B5C' : '#1B1916'}; color:#FBF8F2; display:flex; align-items:center; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase;">${f.status === 'resolved' ? 'Resolved' : 'Open'}</span>
          ${f.owner?.email ? `<a href="mailto:${esc(f.owner.email)}" style="height:30px; padding:0 12px; border-radius:15px; border:1px solid rgba(27,25,22,.16); display:flex; align-items:center; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#4A443A;">Reply</a>` : ''}
          ${f.status !== 'resolved' ? `<button data-resolve="${f.id}" style="height:30px; padding:0 12px; border-radius:15px; border:1px solid rgba(27,25,22,.16); background:none; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#4A443A; cursor:pointer;">Mark resolved</button>` : ''}
        </div>
      </div>`).join('') : '<p style="color:#8C8375; text-align:center; padding:40px;">No feedback submitted yet.</p>'}
    </div>`;
}

function exportsTab() {
  return `
    <div class="admin-header"><div><p class="eyebrow">Spreadsheet-friendly data</p><h3>Exports</h3></div></div>
    <div style="padding:28px 32px; display:grid; grid-template-columns:repeat(2,1fr); gap:14px;">
      ${exportCard('participants-export', 'Participants', 'Name, email, registration date, terms acceptance, entry completeness.')}
      ${exportCard('images-export', 'Images', 'Image ID, source, credit, title, description, status, photo URL, timestamps, review note.')}
      ${exportCard('votes-export', 'Votes', 'Participant, image, vote value, note, timestamp.')}
      ${exportCard('feedback-export', 'Feedback', 'Participant, category, message, timestamp, status.')}
      ${exportCard('rankings-export', 'Rankings', 'Ranked image performance — likes, passes, like rate.')}
    </div>
    <p style="padding:0 32px 28px; font-size:12px; color:#8C8375;">Exports reflect the live database as of the last refresh. For direct access, use the Supabase dashboard's Table Editor.</p>`;
}

function exportCard(id, label, desc) {
  return `<div class="card" style="padding:20px; display:flex; flex-direction:column; gap:12px;">
    <div><p style="margin:0 0 6px; font-size:15px; font-weight:400;">${label}</p><p style="margin:0; font-size:12.5px; font-weight:300; color:#8C8375;">${desc}</p></div>
    <button id="${id}" class="btn btn-outline" style="width:auto; align-self:flex-start; height:36px; padding:0 16px; font-size:11px;">Download CSV</button>
  </div>`;
}

function auditTab() {
  const log = Store.state.auditLog;
  return `
    <div class="admin-header"><div><p class="eyebrow">Traceability · latest 200</p><h3>Audit log</h3></div></div>
    <div style="padding:8px 32px 32px; overflow-x:auto;">
      <table class="rank-table">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
        <tbody>
          ${log.length ? log.map((a) => `<tr>
            <td style="color:#6E6659; white-space:nowrap;">${new Date(a.at).toLocaleString()}</td>
            <td>${esc(a.actor)}</td>
            <td>${esc(a.action)}</td>
            <td style="color:#6E6659;">${esc(String(a.entity).slice(0, 8))}</td>
            <td style="color:#8C8375;">${esc(JSON.stringify(a.detail))}</td>
          </tr>`).join('') : '<tr><td colspan="5" style="text-align:center; padding:30px; color:#8C8375;">No activity recorded yet.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function queueFiles(files) {
  for (const file of files) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) { toast(`${file.name}: use JPEG, PNG or WebP.`, 3200); continue; }
    uploadQueue.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), title: '', description: '' });
  }
  render();
}

function refreshUploadButton() {
  const btn = root.querySelector('#upload-submit');
  if (!btn) return;
  const ready = uploadQueue.every((u) => u.title.trim() && u.description.trim());
  btn.disabled = !ready;
  btn.className = `btn ${ready ? 'btn-gold' : 'btn-flat'}`;
}

function wireEvents() {
  root.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => { tab = el.dataset.tab; editingImageId = null; render(); }));
  root.querySelector('#sign-out')?.addEventListener('click', async () => {
    await Store.adminSignOut();
    signedIn = false;
    render();
  });
  root.querySelector('#refresh')?.addEventListener('click', (e) => act(e.currentTarget, 'Refreshing…', () => Store.refresh()));

  // ---- review queue ----
  const pendingNow = () => Store.pendingImages()[reviewIndex];
  const titleField = root.querySelector('#review-title');
  const descField = root.querySelector('#review-desc');
  const detailsChanged = (img) => titleField && (titleField.value.trim() !== img.title || descField.value.trim() !== img.description);
  const decide = (status) => async (e) => {
    const img = pendingNow();
    // Read every field up front: the first save re-renders the page.
    const edits = detailsChanged(img) ? { title: titleField.value, description: descField.value } : null;
    const note = root.querySelector('#review-note').value;
    await act(e.currentTarget, 'Saving…', async () => {
      if (edits) await Store.updateImageDetails(img.id, edits);
      await Store.reviewImage(img.id, status, note);
    }, status === 'accepted' ? 'Accepted — now in the voting catalogue.' : 'Rejected.');
  };
  root.querySelector('#accept-btn')?.addEventListener('click', decide('accepted'));
  root.querySelector('#reject-btn')?.addEventListener('click', decide('rejected'));
  root.querySelector('#save-details-btn')?.addEventListener('click', (e) => {
    const img = pendingNow();
    act(e.currentTarget, 'Saving…', () => Store.updateImageDetails(img.id, { title: titleField.value, description: descField.value }), 'Saved.');
  });
  root.querySelector('#skip-btn')?.addEventListener('click', () => {
    reviewIndex = (reviewIndex + 1) % Math.max(1, Store.pendingImages().length);
    render();
  });

  root.querySelectorAll('[data-review-filter]').forEach((el) => el.addEventListener('click', () => {
    reviewFilter = el.dataset.reviewFilter;
    editingImageId = null;
    render();
  }));
  root.querySelectorAll('[data-review-move]').forEach((el) => el.addEventListener('click', (e) => {
    const [imageId, status] = el.dataset.reviewMove.split(':');
    act(e.currentTarget, '…', () => Store.reviewImage(imageId, status));
  }));
  root.querySelectorAll('[data-edit-image]').forEach((el) => el.addEventListener('click', () => {
    editingImageId = el.dataset.editImage;
    render();
  }));
  root.querySelectorAll('[data-cancel-edit]').forEach((el) => el.addEventListener('click', () => {
    editingImageId = null;
    render();
  }));
  root.querySelectorAll('[data-save-edit]').forEach((el) => el.addEventListener('click', async (e) => {
    const id = el.dataset.saveEdit;
    const title = root.querySelector(`#edit-title-${id}`).value;
    const description = root.querySelector(`#edit-desc-${id}`).value;
    // Clear edit mode first so the re-render that follows a save shows the
    // card; on failure the form (and what was typed) stays on screen.
    await act(e.currentTarget, 'Saving…', async () => {
      editingImageId = null;
      try { await Store.updateImageDetails(id, { title, description }); } catch (err) { editingImageId = id; throw err; }
    }, 'Saved.');
  }));

  // ---- add photos ----
  const fileInput = root.querySelector('#upload-files');
  fileInput?.addEventListener('change', () => { queueFiles([...fileInput.files]); });
  const drop = root.querySelector('#drop-zone');
  drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.background = '#EFE7D6'; });
  drop?.addEventListener('dragleave', () => { drop.style.background = '#F4EFE5'; });
  drop?.addEventListener('drop', (e) => { e.preventDefault(); queueFiles([...e.dataTransfer.files]); });
  root.querySelector('#upload-credit')?.addEventListener('input', (e) => { uploadCredit = e.target.value; });
  root.querySelectorAll('[data-upload-title]').forEach((el) => el.addEventListener('input', () => {
    uploadQueue.find((u) => u.id === el.dataset.uploadTitle).title = el.value;
    refreshUploadButton();
  }));
  root.querySelectorAll('[data-upload-desc]').forEach((el) => el.addEventListener('input', () => {
    uploadQueue.find((u) => u.id === el.dataset.uploadDesc).description = el.value;
    refreshUploadButton();
  }));
  root.querySelectorAll('[data-upload-remove]').forEach((el) => el.addEventListener('click', () => {
    const item = uploadQueue.find((u) => u.id === el.dataset.uploadRemove);
    URL.revokeObjectURL(item.preview);
    uploadQueue = uploadQueue.filter((u) => u !== item);
    render();
  }));
  root.querySelector('#upload-submit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const total = uploadQueue.length;
    let done = 0;
    busy(btn, `Uploading 0 of ${total}…`);
    // One at a time, removing each from the queue as it lands, so a failure
    // part-way leaves only the photos that still need adding.
    while (uploadQueue.length) {
      const item = uploadQueue[0];
      try {
        await Store.addCatalogImage({ file: item.file, title: item.title, description: item.description, credit: uploadCredit });
      } catch (err) {
        toast(`“${item.title}” failed: ${err.message}`, 4000);
        render();
        return;
      }
      URL.revokeObjectURL(item.preview);
      uploadQueue.shift();
      done += 1;
      const liveBtn = root.querySelector('#upload-submit');
      if (liveBtn) busy(liveBtn, `Uploading ${done} of ${total}…`);
    }
    toast(`${done} photo${done === 1 ? '' : 's'} added to the voting catalogue.`);
    render();
  });

  // ---- rankings / participants ----
  root.querySelector('#export-csv')?.addEventListener('click', () => downloadCSV('campus-canvas-rankings.csv', Store.exportRankingsCSV()));
  const search = root.querySelector('#p-search');
  search?.addEventListener('input', () => {
    participantQuery = search.value.toLowerCase();
    render();
    const again = root.querySelector('#p-search');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });

  root.querySelectorAll('[data-access]').forEach((el) => el.addEventListener('click', (e) => {
    const [id, access] = el.dataset.access.split(':');
    act(e.currentTarget, '…', () => Store.setParticipantAccess(id, access), access === 'approved' ? 'Participant approved.' : 'Participant rejected.');
  }));

  // ---- notices / feedback ----
  root.querySelector('#n-publish')?.addEventListener('click', (e) => {
    const title = root.querySelector('#n-title').value.trim();
    const body = root.querySelector('#n-body').value.trim();
    const url = root.querySelector('#n-url').value.trim();
    if (!title || !body) { toast('A notice needs a title and a message.'); return; }
    if (url && !/^https?:\/\//i.test(url)) { toast('Outbound URL must start with https://'); return; }
    act(e.currentTarget, 'Publishing…', () => Store.publishNotice({
      title, body, url,
      category: root.querySelector('#n-cat').value.trim(),
      ctaLabel: root.querySelector('#n-cta').value.trim(),
    }), 'Notice published.');
  });
  root.querySelectorAll('[data-retire]').forEach((el) => el.addEventListener('click', (e) => {
    act(e.currentTarget, '…', () => Store.retireNotice(el.dataset.retire), 'Notice retired.');
  }));
  root.querySelectorAll('[data-resolve]').forEach((el) => el.addEventListener('click', (e) => {
    act(e.currentTarget, '…', () => Store.setFeedbackStatus(el.dataset.resolve, 'resolved'));
  }));

  // ---- exports ----
  const feedbackCSV = () => {
    const rows = [['id', 'participant', 'email', 'category', 'message', 'status', 'submittedAt']];
    Store.allFeedback().forEach((f) => rows.push([f.id, f.owner?.name, f.owner?.email, f.category, f.message, f.status, f.submittedAt]));
    return toCSV(rows);
  };
  root.querySelector('#export-fb')?.addEventListener('click', () => downloadCSV('campus-canvas-feedback.csv', feedbackCSV()));
  root.querySelector('#feedback-export')?.addEventListener('click', () => downloadCSV('campus-canvas-feedback.csv', feedbackCSV()));
  root.querySelector('#participants-export')?.addEventListener('click', () => {
    const rows = [['id', 'name', 'email', 'access', 'registeredAt', 'termsVersion', 'termsAcceptedAt', 'points', 'entryComplete']];
    Object.values(Store.state.participants).forEach((p) => rows.push([p.id, p.name, p.email, p.access, p.registeredAt, p.termsVersion, p.termsAcceptedAt, p.points, Store.myImages(p.id).length === 3]));
    downloadCSV('campus-canvas-participants.csv', toCSV(rows));
  });
  root.querySelector('#images-export')?.addEventListener('click', () => {
    const rows = [['id', 'participantId', 'source', 'credit', 'title', 'description', 'status', 'photoUrl', 'submittedAt', 'reviewedAt', 'reviewedBy', 'note']];
    Store.allImages().forEach((i) => rows.push([i.id, i.participantId, i.source, i.credit, i.title, i.description, i.status, i.photo, i.submittedAt, i.reviewedAt, i.reviewedBy, i.note]));
    downloadCSV('campus-canvas-images.csv', toCSV(rows));
  });
  root.querySelector('#votes-export')?.addEventListener('click', () => {
    const rows = [['participantId', 'imageId', 'value', 'note', 'votedAt']];
    Store.state.votes.forEach((v) => rows.push([v.participantId, v.imageId, v.value, v.note, v.votedAt]));
    downloadCSV('campus-canvas-votes.csv', toCSV(rows));
  });
  root.querySelector('#rankings-export')?.addEventListener('click', () => downloadCSV('campus-canvas-rankings.csv', Store.exportRankingsCSV()));
}

function renderGate(message = '') {
  root.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center;">
      <form id="admin-login" style="width:360px; background:#fff; border-radius:16px; box-shadow:0 30px 70px rgba(27,25,22,.14); padding:36px 32px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:26px;">
          <img src="../assets/monogram.png" alt="ArtUP" style="height:24px;" />
          <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.22em; text-transform:uppercase;">Console</span>
        </div>
        <h2 class="h-serif" style="font-size:24px; margin-bottom:8px;">Admin sign-in</h2>
        <p style="margin:0 0 22px; font-size:12.5px; font-weight:300; color:#8C8375;">For ArtUP curators. Accounts are created by the project owner.</p>
        ${message ? `<p style="margin:0 0 16px; font-size:12.5px; color:#C4543A;">${esc(message)}</p>` : ''}
        <input id="admin-email" type="email" autocomplete="username" required placeholder="you@artup.life" style="${INPUT} height:46px; font-size:14px; margin-bottom:12px;" />
        <input id="admin-password" type="password" autocomplete="current-password" required placeholder="Password" style="${INPUT} height:46px; font-size:14px; margin-bottom:14px;" />
        <button id="admin-enter" type="submit" class="btn btn-gold" style="height:46px;">Sign in</button>
      </form>
    </div>`;
  root.querySelector('#admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = root.querySelector('#admin-enter');
    const restore = busy(btn, 'Signing in…');
    try {
      await Store.adminSignIn(root.querySelector('#admin-email').value.trim(), root.querySelector('#admin-password').value);
    } catch (err) {
      restore();
      renderGate(err.message);
      return;
    }
    signedIn = true;
    adminEmail = await Store.adminEmail();
    render();
  });
}

function renderMessage(title, body) {
  root.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; padding:40px;">
      <div><h2 class="h-serif" style="font-size:24px; margin-bottom:10px;">${esc(title)}</h2>
      <p style="margin:0; font-size:13.5px; color:#5B5449;">${esc(body)}</p></div>
    </div>`;
}

renderMessage('Console', 'Loading…');
Store.init('admin')
  .then(async () => {
    signedIn = await Store.isAdminSession();
    if (signedIn) adminEmail = await Store.adminEmail();
    render();
  })
  .catch((err) => renderMessage('The console can’t reach the database', err.message));

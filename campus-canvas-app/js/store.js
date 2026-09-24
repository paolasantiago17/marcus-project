// Campus Canvas — data layer backed by Supabase.
//
// Screens read synchronously from an in-memory cache (`state`) that init()
// and refresh() fill from the database. Writes go through Postgres functions
// (see campus-canvas-backend/schema.sql) that enforce the contest rules
// server-side; the cache is updated from what the server returns. Votes and
// notice reads update the cache optimistically so the UI responds instantly
// (UX-003) and roll back if the server rejects them.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { TERMS_VERSION } from './terms-content.js';

const TIER_THRESHOLDS = [
  { at: 20, name: 'Contributor', perk: '1 raffle entry' },
  { at: 50, name: 'Curator', perk: '3 entries · early collection access' },
  { at: 100, name: 'Patron', perk: '5 entries · named in the collection notes' },
];
const BUCKET = 'photos';
const MAX_UPLOAD_EDGE = 2000;

// Static campus photography (Pexels, free license) for decorative spots —
// the landing hero and notice headers. Catalogue images live in storage.
export const SEED_PHOTOS = Array.from({ length: 18 }, (_, i) =>
  `assets/university/campus-${String(i + 1).padStart(2, '0')}.jpg`
);

// `photo` is an image URL/path or, as a last-resort fallback, a CSS gradient.
export function photoStyle(photo) {
  if (!photo) return 'background:#2a241c;';
  if (photo.startsWith('linear-gradient')) return `background:${photo};`;
  return `background-image:url('${photo}'); background-size:cover; background-position:center;`;
}

let sb = null;
let mode = 'student';
let state = emptyState();

function emptyState() {
  return {
    participants: {}, images: {}, votes: [], notices: [], noticeReads: [],
    feedback: [], auditLog: [], currentParticipantId: null,
  };
}

function changed() {
  window.dispatchEvent(new CustomEvent('cc:change'));
}

function reportError(err) {
  window.dispatchEvent(new CustomEvent('cc:error', { detail: err.message || String(err) }));
}

// ---- row mappers (snake_case rows -> the camelCase shape screens use) ----

const toParticipant = (r) => ({
  id: r.id, name: r.name, email: r.email, registeredAt: r.registered_at,
  termsVersion: r.terms_version, termsAcceptedAt: r.terms_accepted_at, points: r.points,
});
const toImage = (r) => ({
  id: r.id, participantId: r.participant_id, source: r.source, credit: r.credit,
  storagePath: r.storage_path, photo: r.photo_url, title: r.title, description: r.description,
  status: r.status, submittedAt: r.submitted_at, reviewedAt: r.reviewed_at,
  reviewedBy: null, note: '',
});
const toVote = (r) => ({
  participantId: r.participant_id, imageId: r.image_id, value: r.value, note: r.note, votedAt: r.voted_at,
});
const toNotice = (r) => ({
  id: r.id, title: r.title, body: r.body, category: r.category, ctaLabel: r.cta_label,
  url: r.url, status: r.status, publishedAt: r.published_at,
});
const toRead = (r) => ({ participantId: r.participant_id, noticeId: r.notice_id, readAt: r.read_at });
const toFeedback = (r) => ({
  id: r.id, participantId: r.participant_id, category: r.category, message: r.message,
  status: r.status, submittedAt: r.submitted_at,
});
const toAudit = (r) => ({ id: r.id, actor: r.actor, action: r.action, entity: r.entity, detail: r.detail, at: r.at });

const byId = (rows, map) => Object.fromEntries(rows.map((r) => [r.id, map(r)]));

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

async function rpc(name, args = {}) {
  return q(sb.rpc(name, args));
}

function setParticipant(row) {
  if (!row) { state.currentParticipantId = null; return null; }
  const p = toParticipant(row);
  state.participants[p.id] = p;
  state.currentParticipantId = p.id;
  return p;
}

// Downscale big phone photos before upload (NFR-003: campus cellular).
// Formats the browser can't decode (e.g. HEIC on Chrome) go up untouched.
async function prepareUpload(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(bitmap.width, bitmap.height));
    // Only light JPEGs go up untouched; heavier ones are re-saved even when
    // they're already small enough, so voting cards stay quick to load.
    if (scale === 1 && file.size < 1_000_000 && /jpe?g/i.test(file.type)) return { blob: file, ext: 'jpg', type: 'image/jpeg' };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    if (blob) return { blob, ext: 'jpg', type: 'image/jpeg' };
  } catch (e) { /* undecodable here — upload original */ }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  return { blob: file, ext, type: file.type || 'image/jpeg' };
}

async function uploadPhoto(folder, file) {
  const { blob, ext, type } = await prepareUpload(file);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  await q(sb.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false }));
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, url };
}

// ---- loading ----

async function loadStudent() {
  const { data: { user } } = await sb.auth.getUser();
  const [participant, images, votes, notices, reads] = await Promise.all([
    q(sb.from('participants').select('*').eq('auth_uid', user.id).maybeSingle()),
    q(sb.from('images').select('*')),
    q(sb.from('votes').select('*')),
    q(sb.from('notices').select('*').eq('status', 'live')),
    q(sb.from('notice_reads').select('*')),
  ]);
  const next = emptyState();
  next.images = byId(images, toImage);
  next.votes = votes.map(toVote);
  next.notices = notices.map(toNotice);
  next.noticeReads = reads.map(toRead);
  state = next;
  setParticipant(participant);
}

async function loadAdmin() {
  const [participants, images, reviews, votes, notices, reads, feedback, audit] = await Promise.all([
    q(sb.from('participants').select('*')),
    q(sb.from('images').select('*')),
    q(sb.from('image_reviews').select('*')),
    q(sb.from('votes').select('*')),
    q(sb.from('notices').select('*')),
    q(sb.from('notice_reads').select('*')),
    q(sb.from('feedback').select('*')),
    q(sb.from('audit_log').select('*').order('at', { ascending: false }).limit(200)),
  ]);
  const next = emptyState();
  next.participants = byId(participants, toParticipant);
  next.images = byId(images, toImage);
  for (const r of reviews) {
    const img = next.images[r.image_id];
    if (img) { img.note = r.note; img.reviewedBy = r.reviewed_by; }
  }
  next.votes = votes.map(toVote);
  next.notices = notices.map(toNotice);
  next.noticeReads = reads.map(toRead);
  next.feedback = feedback.map(toFeedback);
  next.auditLog = audit.map(toAudit);
  state = next;
}

export const Store = {
  TERMS_VERSION,
  TIER_THRESHOLDS,

  get state() { return state; },
  get configured() { return !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY); },

  // mode: 'student' (anonymous session per browser) or 'admin' (email login).
  // Separate storage keys keep an admin login from replacing a student
  // session on the same domain.
  async init(nextMode) {
    mode = nextMode;
    if (!this.configured) throw new Error('Campus Canvas is not connected to its database yet.');
    sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storageKey: `cc-${mode}-auth`, persistSession: true, autoRefreshToken: true },
    });
    if (mode === 'student') {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) throw new Error(`Could not start a session: ${error.message}`);
      }
      await loadStudent();
    } else if (await this.isAdminSession()) {
      await loadAdmin();
    }
    // FR-035: pick up newly accepted images when someone returns to the tab.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.refresh().catch(reportError);
    });
  },

  async refresh() {
    if (mode === 'student') await loadStudent();
    else if (await this.isAdminSession()) await loadAdmin();
    changed();
  },

  // ---- admin auth (AR-001, SR-003) ----
  async isAdminSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return false;
    const row = await q(sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle());
    return !!row;
  },

  async adminSignIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!(await this.isAdminSession())) {
      await sb.auth.signOut();
      throw new Error('That account does not have admin access.');
    }
    await loadAdmin();
  },

  async adminSignOut() {
    await sb.auth.signOut();
    state = emptyState();
  },

  async adminEmail() {
    const { data: { session } } = await sb.auth.getSession();
    return session?.user?.email || '';
  },

  // ---- participants (FR-001, FR-002, FR-006) ----
  currentParticipant() {
    return state.currentParticipantId ? state.participants[state.currentParticipantId] : null;
  },

  async register(name, email) {
    await rpc('register_participant', { p_name: name, p_email: email });
    // An existing email may bring votes, images and reads with it.
    await loadStudent();
    changed();
    return this.currentParticipant();
  },

  async acceptTerms() {
    setParticipant(await rpc('accept_terms', { p_version: TERMS_VERSION }));
    changed();
  },

  hasAcceptedCurrentTerms() {
    const p = this.currentParticipant();
    return !!(p && p.termsVersion === TERMS_VERSION);
  },

  async deleteMyData() {
    const paths = await rpc('delete_my_data');
    if (paths?.length) await sb.storage.from(BUCKET).remove(paths);
    await loadStudent();
    changed();
  },

  // ---- submission (FR-010..FR-016) ----
  myImages(participantId = state.currentParticipantId) {
    return Object.values(state.images)
      .filter((img) => img.participantId === participantId)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  },

  // entries: [{ file, title, description }] x3. Resolves only once the
  // database has all three rows (FR-016); uploads are cleaned up on failure.
  async submitEntry(entries) {
    const { data: { user } } = await sb.auth.getUser();
    const uploaded = [];
    try {
      for (const e of entries) uploaded.push(await uploadPhoto(`submissions/${user.id}`, e.file));
      const items = entries.map((e, i) => ({
        storage_path: uploaded[i].path, photo_url: uploaded[i].url,
        title: e.title.trim(), description: e.description.trim(),
      }));
      await rpc('submit_entry', { p_items: items, p_terms_version: TERMS_VERSION });
    } catch (err) {
      if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
      throw err;
    }
    await loadStudent();
    changed();
  },

  // ---- review (FR-020..FR-023, AR-003) ----
  allImages() {
    return Object.values(state.images).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  pendingImages() {
    return this.allImages().filter((i) => i.status === 'pending');
  },

  async reviewImage(imageId, status, note) {
    await rpc('admin_review_image', { p_image: imageId, p_status: status, p_note: note ?? null });
    await loadAdmin();
    changed();
  },

  async updateImageDetails(imageId, { title, description }) {
    await rpc('admin_update_image', { p_image: imageId, p_title: title, p_description: description });
    await loadAdmin();
    changed();
  },

  // Curator-sourced photo straight into the voting catalogue.
  async addCatalogImage({ file, title, description, credit }) {
    const { path, url } = await uploadPhoto('catalog/admin', file);
    try {
      await rpc('admin_add_catalog_image', {
        p_storage_path: path, p_photo_url: url, p_title: title, p_description: description, p_credit: credit,
      });
    } catch (err) {
      await sb.storage.from(BUCKET).remove([path]);
      throw err;
    }
    await loadAdmin();
    changed();
  },

  // ---- voting (FR-030..FR-037) ----
  acceptedImages() {
    return this.allImages().filter((i) => i.status === 'accepted');
  },

  votedImageIds(participantId = state.currentParticipantId) {
    return new Set(state.votes.filter((v) => v.participantId === participantId).map((v) => v.imageId));
  },

  votingQueue(participantId = state.currentParticipantId) {
    const voted = this.votedImageIds(participantId);
    return this.acceptedImages().filter((img) => !voted.has(img.id) && img.participantId !== participantId);
  },

  // Optimistic: the card advances and points move immediately; the server's
  // total wins once it answers, and a rejected vote is rolled back.
  castVote(imageId, value, note) {
    const p = this.currentParticipant();
    if (!p) throw new Error('Not registered');
    if (state.votes.some((v) => v.participantId === p.id && v.imageId === imageId)) return;
    const vote = { participantId: p.id, imageId, value, note: note || '', votedAt: new Date().toISOString() };
    const before = p.points;
    state.votes.push(vote);
    p.points += value === 'note' ? 3 : 1;
    rpc('cast_vote', { p_image: imageId, p_value: value, p_note: note || '' })
      .then((points) => {
        if (p.points !== points) { p.points = points; changed(); }
      })
      .catch((err) => {
        state.votes = state.votes.filter((v) => v !== vote);
        p.points = before;
        reportError(err);
        changed();
      });
  },

  async resetMyVotes() {
    const points = await rpc('reset_my_votes');
    const p = this.currentParticipant();
    state.votes = state.votes.filter((v) => v.participantId !== p.id);
    p.points = points;
    changed();
  },

  async setTestPoints(target) {
    const p = this.currentParticipant();
    p.points = await rpc('set_test_points', { p_target: target });
    changed();
  },

  tierFor(points) {
    const tiers = TIER_THRESHOLDS;
    const top = tiers[tiers.length - 1];
    const next = tiers.find((t) => points < t.at) || top;
    const prevEarned = tiers.filter((t) => points >= t.at).pop() || null;
    const floor = prevEarned ? prevEarned.at : 0;
    const pct = Math.max(0, Math.min(100, ((points - floor) / (next.at - floor)) * 100));
    return { tiers, next, prevEarned, pct, atTop: points >= top.at };
  },

  imageRankings() {
    return this.acceptedImages().map((img) => {
      const vs = state.votes.filter((v) => v.imageId === img.id);
      const likes = vs.filter((v) => v.value === 'like' || v.value === 'note').length;
      const passes = vs.filter((v) => v.value === 'pass').length;
      const total = vs.length;
      const rate = total ? (likes / total) * 100 : 0;
      return { img, likes, passes, total, rate };
    }).sort((a, b) => b.likes - a.likes || b.rate - a.rate);
  },

  // ---- notices (FR-040..FR-044, AR-005) ----
  allNotices() {
    return [...state.notices].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  },

  liveNotices() {
    return this.allNotices().filter((n) => n.status === 'live');
  },

  readNoticeIds(participantId = state.currentParticipantId) {
    return new Set(state.noticeReads.filter((r) => r.participantId === participantId).map((r) => r.noticeId));
  },

  unreadCount(participantId = state.currentParticipantId) {
    if (!participantId) return 0;
    const read = this.readNoticeIds(participantId);
    return this.liveNotices().filter((n) => !read.has(n.id)).length;
  },

  markNoticeRead(noticeId) {
    const p = this.currentParticipant();
    if (!p || this.readNoticeIds(p.id).has(noticeId)) return;
    state.noticeReads.push({ participantId: p.id, noticeId, readAt: new Date().toISOString() });
    rpc('mark_notice_read', { p_notice: noticeId }).catch(reportError);
  },

  async publishNotice({ title, body, category, ctaLabel, url }) {
    await rpc('admin_publish_notice', {
      p_title: title, p_body: body, p_category: category || 'Announcement', p_cta_label: ctaLabel || '', p_url: url || '',
    });
    await loadAdmin();
    changed();
  },

  async retireNotice(noticeId) {
    await rpc('admin_retire_notice', { p_notice: noticeId });
    await loadAdmin();
    changed();
  },

  // ---- feedback (FR-050..FR-053, AR-006) ----
  async submitFeedback(category, message) {
    await rpc('submit_feedback', { p_category: category, p_message: message });
  },

  allFeedback() {
    return [...state.feedback].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((f) => ({ ...f, owner: state.participants[f.participantId] }));
  },

  async setFeedbackStatus(id, status) {
    await rpc('admin_set_feedback_status', { p_feedback: id, p_status: status });
    await loadAdmin();
    changed();
  },

  // ---- analytics (AR-004, 5.3) ----
  stats() {
    const parts = Object.values(state.participants);
    const imgs = Object.values(state.images);
    return {
      registered: parts.length,
      completedEntries: parts.filter((p) => this.myImages(p.id).length === 3).length,
      accepted: imgs.filter((i) => i.status === 'accepted').length,
      pending: imgs.filter((i) => i.status === 'pending').length,
      rejected: imgs.filter((i) => i.status === 'rejected').length,
      votesCast: state.votes.length,
    };
  },

  exportRankingsCSV() {
    const rows = [['rank', 'imageId', 'title', 'credit', 'source', 'likes', 'passes', 'total', 'likeRate']];
    this.imageRankings().forEach((r, i) => {
      rows.push([i + 1, r.img.id, r.img.title, r.img.credit, r.img.source, r.likes, r.passes, r.total, r.rate.toFixed(1)]);
    });
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  },
};

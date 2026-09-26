// End-to-end check of the database rules, run as a real anonymous student and
// as the admin. Cleans up everything it creates.   node smoke-test.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync(new URL('./keys.env', import.meta.url), 'utf8')
  .split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));

const opts = { auth: { persistSession: false } };
const student = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, opts);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, opts);
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`); if (!cond) failures++; };
const rejects = async (name, promise) => { const { error } = await promise; ok(name, !!error, error?.message); };

// 1x1 JPEG
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const email = `smoke-${Date.now()}@queensu.ca`;
const outsideEmail = `smoke-${Date.now()}@example.com`;
const cleanupPaths = [];
let uid = null;
let returningUid = null;

try {
  const anon = await student.auth.signInAnonymously();
  ok('anonymous sign-in', !anon.error, anon.error?.message);
  uid = anon.data.user.id;

  const visible = await student.from('images').select('status');
  ok('student sees only accepted images', visible.data.every((i) => i.status === 'accepted'), `${visible.data.length} visible`);
  await rejects('vote before registering is refused', student.rpc('cast_vote', { p_image: crypto.randomUUID(), p_value: 'like' }));
  await rejects('direct table insert is refused', student.from('images').insert({ title: 'x', photo_url: 'x' }));

  await rejects('sign-up without confirming 18+ is refused', student.rpc('register_participant', { p_name: 'Smoke Test', p_email: email, p_age_confirmed: false }));
  const outside = await student.rpc('register_participant', { p_name: 'Smoke Outside', p_email: outsideEmail, p_age_confirmed: true });
  ok('non-queensu sign-up waits for approval', outside.data?.access === 'pending', outside.error?.message ?? outside.data?.access);
  await rejects('pending participant cannot vote', student.rpc('cast_vote', { p_image: crypto.randomUUID(), p_value: 'like' }));

  const reg = await student.rpc('register_participant', { p_name: 'Smoke Test', p_email: email, p_age_confirmed: true });
  ok('register participant', !reg.error && reg.data.access === 'approved', reg.error?.message);
  await rejects('anonymous session cannot claim an account', student.rpc('claim_participant'));
  // Stand-in for the magic link: a confirmed email user in a second browser.
  const returning = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, opts);
  const pw = crypto.randomUUID();
  const made = await service.auth.admin.createUser({ email: email.toUpperCase(), password: pw, email_confirm: true });
  returningUid = made.data?.user?.id;
  await returning.auth.signInWithPassword({ email, password: pw });
  const back = await returning.rpc('claim_participant');
  ok('verified email logs back in to its account', !back.error && back.data.id === reg.data.id, back.error?.message);
  // Hand the account back to the first session for the rest of the checks.
  await student.rpc('register_participant', { p_name: 'Smoke Test', p_email: email, p_age_confirmed: true });

  const items = [];
  for (let i = 0; i < 3; i++) {
    const path = `submissions/${uid}/smoke-${i}.jpg`;
    const up = await student.storage.from('photos').upload(path, jpeg, { contentType: 'image/jpeg' });
    ok(`student upload ${i + 1}`, !up.error, up.error?.message);
    cleanupPaths.push(path);
    items.push({ storage_path: path, photo_url: student.storage.from('photos').getPublicUrl(path).data.publicUrl, title: `Smoke ${i}`, description: 'Automated check.' });
  }
  const badPath = await student.storage.from('photos').upload(`submissions/${crypto.randomUUID()}/x.jpg`, jpeg, { contentType: 'image/jpeg' });
  ok('upload into another user\'s folder is refused', !!badPath.error, badPath.error?.message);

  await rejects('submission before accepting terms is refused', student.rpc('submit_entry', { p_items: items, p_terms_version: '1.0' }));
  await student.rpc('accept_terms', { p_version: '1.0' });
  await rejects('two-photo entry is refused', student.rpc('submit_entry', { p_items: items.slice(0, 2), p_terms_version: '1.0' }));
  await rejects('missing title is refused', student.rpc('submit_entry', { p_items: [{ ...items[0], title: ' ' }, items[1], items[2]], p_terms_version: '1.0' }));
  const sub = await student.rpc('submit_entry', { p_items: items, p_terms_version: '1.0' });
  ok('three-photo entry accepted', !sub.error && sub.data.length === 3, sub.error?.message);
  await rejects('second entry is refused', student.rpc('submit_entry', { p_items: items, p_terms_version: '1.0' }));

  const me = await student.from('participants').select('points').single();
  ok('entry earns 9 points', me.data.points === 9, `points=${me.data.points}`);
  const mine = await student.from('images').select('id, status').eq('participant_id', sub.data[0].participant_id);
  ok('own pending images are visible to their owner', mine.data.length === 3 && mine.data.every((i) => i.status === 'pending'));

  const target = visible.data.length ? (await student.from('images').select('id').eq('status', 'accepted').limit(1)).data[0].id : null;
  const v1 = await student.rpc('cast_vote', { p_image: target, p_value: 'like' });
  const v2 = await student.rpc('cast_vote', { p_image: target, p_value: 'like' });
  ok('vote counts once', v1.data === 10 && v2.data === 10, `after=${v1.data}, repeat=${v2.data}`);
  await rejects('voting on a pending image is refused', student.rpc('cast_vote', { p_image: sub.data[0].id, p_value: 'like' }));
  await rejects('empty note is refused', student.rpc('cast_vote', { p_image: target, p_value: 'note', p_note: '' }));
  const notes = await student.from('image_reviews').select('*');
  ok('review notes hidden from students', !notes.error && notes.data.length === 0);
  await rejects('student cannot call admin functions', student.rpc('admin_review_image', { p_image: sub.data[0].id, p_status: 'accepted' }));

  const signIn = await admin.auth.signInWithPassword({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  ok('admin sign-in', !signIn.error, signIn.error?.message);
  const allImgs = await admin.from('images').select('status');
  ok('admin sees pending images too', allImgs.data.some((i) => i.status === 'pending'), `${allImgs.data.length} total`);
  const outsideRow = (await admin.from('participants').select('id').eq('email', outsideEmail).single()).data;
  const approve = await admin.rpc('admin_set_participant_access', { p_participant: outsideRow.id, p_access: 'approved' });
  ok('admin approves a non-queensu participant', approve.data?.access === 'approved', approve.error?.message);
  await rejects('student cannot approve participants', student.rpc('admin_set_participant_access', { p_participant: outsideRow.id, p_access: 'approved' }));
  const rev = await admin.rpc('admin_review_image', { p_image: sub.data[0].id, p_status: 'accepted', p_note: 'smoke' });
  ok('admin accepts a submission', !rev.error, rev.error?.message);
  const nowVisible = await student.from('images').select('id').eq('id', sub.data[0].id);
  ok('accepted submission appears in catalogue', nowVisible.data.length === 1);
  await rejects('student cannot vote on own accepted photo', student.rpc('cast_vote', { p_image: sub.data[0].id, p_value: 'like' }));

  await rejects('an accepted photo cannot be replaced', student.rpc('replace_rejected_image', { p_image: sub.data[0].id, p_storage_path: items[0].storage_path, p_photo_url: items[0].photo_url, p_title: 'x', p_description: 'y' }));
  await admin.rpc('admin_review_image', { p_image: sub.data[1].id, p_status: 'rejected', p_note: 'smoke' });
  const newPath = `submissions/${uid}/smoke-replacement.jpg`;
  await student.storage.from('photos').upload(newPath, jpeg, { contentType: 'image/jpeg' });
  cleanupPaths.push(newPath);
  const swap = await student.rpc('replace_rejected_image', { p_image: sub.data[1].id, p_storage_path: newPath, p_photo_url: student.storage.from('photos').getPublicUrl(newPath).data.publicUrl, p_title: 'Replacement', p_description: 'A better one.' });
  const swapped = (await student.from('images').select('status, title').eq('id', sub.data[1].id).single()).data;
  ok('rejected photo can be replaced and goes back to review', !swap.error && swapped.status === 'pending' && swapped.title === 'Replacement', swap.error?.message);

  const catPath = `catalog/admin/smoke-${Date.now()}.jpg`;
  const catUp = await admin.storage.from('photos').upload(catPath, jpeg, { contentType: 'image/jpeg' });
  ok('admin catalogue upload', !catUp.error, catUp.error?.message);
  cleanupPaths.push(catPath);
  await rejects('catalogue photo without description is refused', admin.rpc('admin_add_catalog_image', { p_storage_path: catPath, p_photo_url: 'x', p_title: 'T', p_description: '', p_credit: '' }));
  const cat = await admin.rpc('admin_add_catalog_image', { p_storage_path: catPath, p_photo_url: admin.storage.from('photos').getPublicUrl(catPath).data.publicUrl, p_title: 'Smoke catalogue', p_description: 'Automated check.', p_credit: '' });
  ok('admin adds photo straight to catalogue', !cat.error && cat.data.status === 'accepted' && cat.data.credit === 'ArtUP', cat.error?.message);
  if (cat.data) await service.from('images').delete().eq('id', cat.data.id);

  const fetched = await fetch(nowVisible.data.length ? items[0].photo_url : '');
  ok('photos are publicly served', fetched.ok, `HTTP ${fetched.status}`);

  const del = await student.rpc('delete_my_data');
  ok('delete my data', !del.error, del.error?.message);
  const removed = await student.storage.from('photos').remove(del.data || []);
  ok('student can delete their own photo files', removed.data?.length === 3, `${removed.data?.length ?? 0} of 3 removed`);
} finally {
  await service.from('participants').delete().in('email', [email, outsideEmail]);
  if (uid) await service.auth.admin.deleteUser(uid);
  if (returningUid) await service.auth.admin.deleteUser(returningUid);
  if (cleanupPaths.length) await service.storage.from('photos').remove(cleanupPaths);
  await service.from('audit_log').delete().or(`actor.eq.${email},actor.eq.${outsideEmail},detail->>title.eq.Smoke catalogue,detail->>note.eq.smoke`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

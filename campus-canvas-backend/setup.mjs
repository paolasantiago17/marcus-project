// One-time (re-runnable) Supabase setup for Campus Canvas.
//   node setup.mjs            apply schema (if a DB password is set), create admin, write config
//   node setup.mjs --demo     …and also upload sample photos and seed demo images/notices
//   node setup.mjs --schema   apply schema only
//
// Reads secrets from ./keys.env — this folder is never deployed. The only thing
// written into the web app is js/config.js, which holds the project URL and
// the publishable (public) key.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'campus-canvas-app');

function loadEnv() {
  const path = join(here, 'keys.env');
  if (!existsSync(path)) throw new Error('Missing campus-canvas-backend/keys.env.');
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Fill these in campus-canvas-backend/keys.env: ${missing.join(', ')}`);
  // Optional: with a database password the script can apply schema.sql
  // itself; without one, run schema.sql in the dashboard's SQL editor first.
  if (env.SUPABASE_DB_URL && env.SUPABASE_DB_PASSWORD) {
    const db = new URL(env.SUPABASE_DB_URL);
    db.password = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
    env.SUPABASE_DB_URL = db.toString();
  } else {
    env.SUPABASE_DB_URL = '';
  }
  return env;
}

const env = loadEnv();
const schemaOnly = process.argv.includes('--schema');
const withDemo = process.argv.includes('--demo');

async function applySchema() {
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(readFileSync(join(here, 'schema.sql'), 'utf8'));
    await client.query("notify pgrst, 'reload schema'");
  } finally {
    await client.end();
  }
  console.log('✓ schema applied');
}

const SEED_PEOPLE = [
  ['Maya Prentice', 'seed-maya@queensu.ca'],
  ['Devon Hsu', 'seed-devon@queensu.ca'],
  ['Priya Raman', 'seed-priya@queensu.ca'],
  ['Alex Boudreau', 'seed-alex@queensu.ca'],
  ['Jules Martin', 'seed-jules@queensu.ca'],
  ['Sofia Nardone', 'seed-sofia@queensu.ca'],
  ['Owen Bright', 'seed-owen@queensu.ca'],
  ['Rhea Kapoor', 'seed-rhea@queensu.ca'],
];

const SEED_IMAGES = [
  ['Sunrise walk to Convocation Hall', 'Early mornings hit different on campus. The quiet, the light, the walk before anyone else is out.'],
  ['Last light, Botterell steps', 'Everyone stops here on the way down. Four years and I never once walked past without looking up.'],
  ['The lawn in September', 'First week back, before anything got hard. This is the version of the year I remember.'],
  ['Stauffer, 2am', 'Not glamorous. But it is where the degree actually happened.'],
  ['Ferry light on the lake', 'The last ferry of the night, and the only quiet ten minutes of the week.'],
  ['Snow on Union Street', 'Nobody tells you campus is this beautiful the one week it snows before exams.'],
  ['Grant Hall clock tower', 'You can hear those bells from almost anywhere on campus. I still stop when they ring.'],
  ['Lake Ontario dock at dusk', 'Watched more sunsets from this dock than I did lectures, honestly.'],
  ['Frosted windows, Frontenac', 'My res room window in January. Cold, but somehow the coziest place I lived.'],
  ['Autumn on University Avenue', 'The ten-minute walk that made every deadline feel a little more bearable.'],
  ['Study session, JDUC lawn', 'Every warm day, this lawn fills up with blankets and half-finished readings.'],
  ['Winter Carnival lights', 'The one week campus turns into something out of a postcard.'],
  ['Limestone walls in morning fog', 'These walls have seen a hundred years of students walk past exactly like this.'],
  ['Move-in day chaos', 'Total chaos, way too many boxes, and the start of everything.'],
  ['Homecoming bonfire', 'Loudest ten minutes of the whole fall. Worth every second.'],
  ['Late-night library grind', 'The 2am kind of tired that only exists in that building during finals.'],
  ['Rowing team at dawn', 'Nobody else is awake yet. Just us and the water.'],
  ['Cafeteria conversations', 'Some of my best ideas happened over a bad cafeteria coffee.'],
  ['First snow on campus', 'The campus goes quiet and white overnight. Never gets old.'],
  ['Graduation gowns drying', 'Drying gowns on every doorknob in the house. We made it.'],
  ['Coffee shop corner window', 'This window seat got me through more assignments than I can count.'],
  ['Rugby pitch under floodlights', 'Friday nights under the lights, whole res house showing up to cheer.'],
  ['Reading week silence', 'The one week campus is somehow both empty and unbearably tense.'],
  ['Spring blossoms by the chapel', 'Ten days a year the chapel walk looks like this. Try to catch it every year.'],
  ['Last day of exams, relief', 'Walked out of that exam and just stood in the sun for a while.'],
];

const SEED_NOTICES = [
  ['Contest winners announced', 'The ten highest-ranked images are in. See which campus views made the 2027 shortlist.', 'Announcement', 'View results', ''],
  ['Pre-sales open December 1', 'Early access for the campus community before the collection goes public.', 'Pre-sale', 'Visit artup.life', 'https://artup.life'],
  ['First artist previews are up', 'Three Kingston artists have started work from student images. See the early studies.', 'Collection', '', ''],
];

async function uploadCatalogPhotos(admin) {
  const dir = join(appDir, 'assets', 'university');
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  const urls = [];
  for (const file of files) {
    const path = `catalog/seed/${file}`;
    const { error } = await admin.storage.from('photos').upload(path, readFileSync(join(dir, file)), {
      contentType: 'image/jpeg', upsert: true,
    });
    if (error) throw new Error(`Upload ${file}: ${error.message}`);
    urls.push({ path, url: admin.storage.from('photos').getPublicUrl(path).data.publicUrl });
  }
  console.log(`✓ uploaded ${urls.length} catalogue photos`);
  return urls;
}

async function seedData(admin, photos) {
  const existing = await admin.from('participants').select('id', { count: 'exact', head: true }).eq('is_seed', true);
  if (existing.error) throw new Error(`Database not ready (${existing.error.message}) — has schema.sql been applied?`);
  if (existing.count > 0) {
    const seededImages = await admin.from('images').select('id', { count: 'exact', head: true }).not('participant_id', 'is', null);
    if (seededImages.count > 0) {
      console.log('• demo data already present — skipped (delete is_seed participants to reseed)');
      return;
    }
    await admin.from('participants').delete().eq('is_seed', true); // leftover from an interrupted run
  }
  const now = new Date().toISOString();
  const people = await admin.from('participants')
    .insert(SEED_PEOPLE.map(([name, email]) => ({ name, email, terms_version: '1.0', terms_accepted_at: now, is_seed: true })))
    .select('id, name');
  if (people.error) throw new Error(`Seed participants: ${people.error.message}`);
  const ids = SEED_PEOPLE.map(([name]) => people.data.find((p) => p.name === name));

  const rows = SEED_IMAGES.map(([title, description], i) => {
    const owner = ids[i % ids.length];
    const photo = photos[i % photos.length];
    return {
      participant_id: owner.id, source: 'participant', credit: owner.name,
      storage_path: photo.path, photo_url: photo.url, title, description,
      status: 'accepted', reviewed_at: now,
    };
  });
  // One entry still waiting on a curator, so the review queue has work in it.
  rows.push({
    participant_id: ids[0].id, source: 'participant', credit: ids[0].name,
    storage_path: photos[4].path, photo_url: photos[4].url, title: 'Stained glass, the chapel',
    description: 'Every December this window catches the last light of the year before exams end.',
    // Bulk inserts send every key for every row, so defaults must be explicit.
    status: 'pending', reviewed_at: null,
  });
  const images = await admin.from('images').insert(rows);
  if (images.error) throw new Error(`Seed images: ${images.error.message}`);

  const notices = await admin.from('notices').insert(SEED_NOTICES.map(([title, body, category, cta_label, url]) => ({ title, body, category, cta_label, url })));
  if (notices.error) throw new Error(`Seed notices: ${notices.error.message}`);
  console.log('✓ demo data seeded');
}

async function ensureAdmin(admin) {
  let userId;
  const created = await admin.auth.admin.createUser({
    email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, email_confirm: true,
  });
  if (created.error) {
    // Already exists — find it and reset the password to what's in .env.
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const existing = data.users.find((u) => u.email?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
    if (!existing) throw created.error;
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password: env.ADMIN_PASSWORD });
  } else {
    userId = created.data.user.id;
  }
  const row = await admin.from('admins').upsert({ user_id: userId, email: env.ADMIN_EMAIL.toLowerCase() });
  if (row.error) throw new Error(`Admin row: ${row.error.message}`);
  console.log(`✓ admin ready: ${env.ADMIN_EMAIL}`);
}

function writeClientConfig() {
  const body = `// Public Supabase settings for the browser. The publishable key is meant to
// be public; access is enforced by row-level security in the database.
export const SUPABASE_URL = ${JSON.stringify(env.SUPABASE_URL)};
export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY)};
`;
  writeFileSync(join(appDir, 'js', 'config.js'), body);
  console.log('✓ wrote campus-canvas-app/js/config.js');
}

if (env.SUPABASE_DB_URL) await applySchema();
else console.log('• no database password in keys.env — assuming schema.sql was run in the SQL editor');
if (!schemaOnly) {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  if (withDemo) {
    const photos = await uploadCatalogPhotos(admin);
    await seedData(admin, photos);
  }
  await ensureAdmin(admin);
  writeClientConfig();
}
console.log('Done.');

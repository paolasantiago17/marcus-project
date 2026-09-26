import { Store } from './store.js';
import { Router } from './router.js';
import { landing, register, termsGate } from './screens/onboarding.js';
import { submit, submitted } from './screens/submit.js';
import { vote } from './screens/vote.js';
import { notices, noticeDetail } from './screens/notices.js';
import { feedback } from './screens/feedback.js';
import { account } from './screens/account.js';
import { terms } from './screens/terms.js';
import { toast, statusScreen } from './ui.js';

const NEEDS_PARTICIPANT = new Set(['submit', 'submitted', 'vote', 'notices', 'notice', 'feedback', 'account', 'terms']);
const NEEDS_TERMS = new Set(['submit']);

Router.register('home', landing);
Router.register('register', register);
Router.register('terms-gate', termsGate);
Router.register('submit', submit);
Router.register('submitted', submitted);
Router.register('vote', vote);
Router.register('notices', notices);
Router.register('notice', noticeDetail);
Router.register('feedback', feedback);
Router.register('account', account);
Router.register('terms', terms);

Router.setGuard((name) => {
  if (NEEDS_PARTICIPANT.has(name) && !Store.currentParticipant()) return '#/register';
  if (NEEDS_TERMS.has(name) && !Store.hasAcceptedCurrentTerms()) return '#/terms-gate';
  return null;
});

const root = document.getElementById('app');
const LIVE_ROUTES = new Set(['vote', 'notices', 'account']);

window.addEventListener('cc:error', (e) => toast(e.detail, 3200));
// Re-render screens that only display data when fresh data arrives; screens
// with forms in progress are left alone so typing isn't wiped.
window.addEventListener('cc:change', () => {
  if (Router.root && LIVE_ROUTES.has(Router.parse(Router.current()).name)) Router.handle();
});

// Supabase sometimes rejects a login token for a few seconds after issuing it
// ("JWT issued at future") when its servers' clocks disagree, so that error
// is retried quietly before the error screen is shown.
function start(attempt = 1) {
  Store.init('student')
    .then(() => Router.mount(root))
    .catch((err) => {
      if (attempt < 5 && /issued at future/i.test(err.message)) {
        setTimeout(() => start(attempt + 1), 1500 * attempt);
        return;
      }
      statusScreen(root, 'We can’t load Campus Canvas right now', `${err.message} Please try again in a moment.`);
    });
}

statusScreen(root, 'Campus Canvas', 'Loading…');
start();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

import { Store } from './store.js';
import { Router } from './router.js';
import { landing, register, termsGate, login, pending, finishLogin } from './screens/onboarding.js';
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
Router.register('login', login);
Router.register('pending', pending);
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
  // Non-@queensu.ca sign-ups can't take part until an admin approves them.
  if ((NEEDS_PARTICIPANT.has(name) || name === 'terms-gate') && Store.currentParticipant() && !Store.isApproved()) return '#/pending';
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

// A magic link lands on ?login=1 with the session (or an error such as an
// expired link) in the #fragment. Supabase reads the fragment during init;
// it's noted here first because the router uses the fragment too.
const fromLoginLink = new URLSearchParams(location.search).has('login');
const linkError = /error_description=([^&]*)/.exec(location.hash);

function afterLoginLink() {
  const result = Store.takeLoginResult();
  if (linkError) {
    const message = decodeURIComponent(linkError[1].replace(/\+/g, ' '));
    finishLogin(/expired|invalid/i.test(message) ? 'That log-in link has expired or was already used. Send a new one.' : message);
  } else if (result) {
    finishLogin(result);
  }
}

// Supabase sometimes rejects a login token for a few seconds after issuing it
// ("JWT issued at future") when its servers' clocks disagree, so that error
// is retried quietly before the error screen is shown.
function start(attempt = 1) {
  Store.init('student')
    .then(() => {
      if (fromLoginLink || linkError) history.replaceState(null, '', location.pathname);
      Router.mount(root);
      if (fromLoginLink || linkError) afterLoginLink();
    })
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

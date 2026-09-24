// Minimal hash router. Routes are registered as {name -> renderFn}.
// renderFn(container, params) does its own DOM work and event wiring.

const routes = {};
let notFound = (c) => { c.innerHTML = '<p style="padding:40px">Not found.</p>'; };
let guard = null; // (routeName) => redirectHash|null

export const Router = {
  root: null,

  register(name, fn) { routes[name] = fn; },
  setNotFound(fn) { notFound = fn; },
  setGuard(fn) { guard = fn; },

  mount(rootEl) {
    this.root = rootEl;
    window.addEventListener('hashchange', () => this.handle());
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-nav]');
      if (el) {
        e.preventDefault();
        this.go(el.getAttribute('data-nav'));
      }
    });
    this.handle();
  },

  current() {
    return (location.hash || '#/').slice(1) || '/';
  },

  go(hash) {
    if (location.hash === hash) this.handle();
    else location.hash = hash;
  },

  parse(path) {
    const [base, query] = path.split('?');
    const parts = base.split('/').filter(Boolean);
    const params = {};
    if (query) query.split('&').forEach((kv) => {
      const [k, v] = kv.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { name: parts[0] || 'home', parts, params };
  },

  handle() {
    const path = this.current();
    const { name, parts, params } = this.parse(path);
    if (guard) {
      const redirect = guard(name, parts, params);
      if (redirect) { this.go(redirect); return; }
    }
    const fn = routes[name] || notFound;
    window.scrollTo(0, 0);
    fn(this.root, { parts, params });
  },
};

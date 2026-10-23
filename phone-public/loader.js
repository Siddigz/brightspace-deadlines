// Signs in with a GitHub token, fetches app.json from a private repo, and runs the page it holds.

const KEY = 'signin';
const APP = 'app-cache';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const form = document.getElementById('signin');
const msg = document.getElementById('msg');

function ask(text = '') {
  msg.textContent = text;
  form.hidden = false;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const repo = form.repo.value.trim().replace(/\.git$/, '').replace(/\/+$/, '').split('/').slice(-2).join('/');
  write(KEY, { repo, token: form.token.value.trim() });
  location.reload();
});

async function fetchApp({ repo, token }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/app.json`, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github.raw+json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw Object.assign(new Error(`GitHub said ${res.status}`), { status: res.status });
  return res.json();
}

// Turn the app's files into modules: each relative import points at the blob URL of its target.
function link(files, entry) {
  const urls = {};
  const resolve = (from, spec) => new URL(spec, `https://x/${from}`).pathname.slice(1);
  const make = (path) => {
    if (!urls[path]) {
      const src = files[path].replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, pre, q, spec) => {
        const target = resolve(path, spec);
        return target in files ? pre + q + make(target) + q : m;
      });
      urls[path] = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    }
    return urls[path];
  };
  return make(entry);
}

function run(app, cfg) {
  document.title = app.title;
  form.remove();
  const style = document.createElement('style');
  style.textContent = app.css;
  document.head.append(style);
  document.body.insertAdjacentHTML('afterbegin', app.body);
  globalThis.signedIn = {
    ...cfg,
    forget() {
      localStorage.removeItem(KEY);
      localStorage.removeItem(APP);
      location.reload();
    },
  };
  return import(link(app.files, app.entry));
}

const cfg = read(KEY);
if (!cfg?.repo || !cfg.token) {
  ask();
} else {
  let app = null;
  try {
    app = await fetchApp(cfg);
    write(APP, app);
  } catch (e) {
    if (e.status === 401 || e.status === 404) {
      localStorage.removeItem(KEY);
      ask(e.message);
    } else {
      app = read(APP); // offline: last copy
      if (!app) ask(e.message);
    }
  }
  if (app) await run(app, cfg);
}

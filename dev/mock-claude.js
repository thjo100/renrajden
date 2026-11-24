// In-memory mock of window.claude (db + user) for local testing only. Never published.
// Configure before load with window.__MOCK = { admin: true|false, seed: [...], signedOut: false }
(() => {
  const cfg = window.__MOCK || {};
  const docs = new Map();
  for (const d of (cfg.seed || [])) { const { id, ...rest } = d; docs.set(id, JSON.parse(JSON.stringify(rest))); }
  const listeners = new Set();
  const snapshotFor = (q) => {
    let arr = [...docs.entries()].map(([id, data]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(data)), metadata: { fromCache: false, hasPendingWrites: false } }));
    if (q.order) { const [f, dir] = q.order; arr.sort((a, b) => { const x = a.data()[f], y = b.data()[f]; return (x < y ? -1 : x > y ? 1 : 0) * (dir === "desc" ? -1 : 1); }); }
    if (q.lim) arr = arr.slice(0, q.lim);
    return { docs: arr, size: arr.length, empty: !arr.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] };
  };
  const notify = () => setTimeout(() => listeners.forEach(l => l.next(snapshotFor(l.q))), 30);
  const canWrite = () => !!cfg.admin;
  const reject = () => Promise.reject({ code: "invalid_argument", message: "not allowed" });
  const docRef = (id) => ({
    id, path: "news/" + id,
    get: async () => docs.has(id) ? { id, exists: true, data: () => docs.get(id), metadata: {} } : { id, exists: false, data: () => undefined, metadata: {} },
    set: async (data) => { if (!canWrite()) return reject(); await new Promise(r => setTimeout(r, 250)); docs.set(id, JSON.parse(JSON.stringify(data))); notify(); },
    update: async (data) => { if (!canWrite()) return reject(); if (!docs.has(id)) return reject(); docs.set(id, { ...docs.get(id), ...data }); notify(); },
    delete: async () => { if (!canWrite()) return reject(); await new Promise(r => setTimeout(r, 200)); docs.delete(id); notify(); },
  });
  const query = (q) => ({
    orderBy: (f, dir = "asc") => query({ ...q, order: [f, dir] }),
    limit: (n) => query({ ...q, lim: n }),
    where: () => query(q),
    get: async () => snapshotFor(q),
    onSnapshot: (next, error) => { const l = { q, next, error }; listeners.add(l); setTimeout(() => next(snapshotFor(q)), 120); return () => listeners.delete(l); },
    doc: (id) => docRef(id || ("n" + Math.random().toString(36).slice(2, 10))),
    add: async (data) => { const r = docRef("n" + Math.random().toString(36).slice(2, 10)); await r.set(data); return r; },
  });
  const db = Object.freeze({ collection: () => query({}), doc: (p) => docRef(p.split("/").pop()) });
  const avatar = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#C8102E"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#fff" font-family="sans-serif">TA</text></svg>');
  const me = { id: cfg.signedOut ? null : "u_test", name: cfg.signedOut ? "" : "Test Admin", avatarUrl: avatar, color: "#C8102E", email: null, isOwner: !!cfg.admin, canEdit: !!cfg.admin };
  const user = Object.freeze({
    me: async () => ({ ...me }), id: async () => me.id, isOwner: async () => me.isOwner, canEdit: async () => me.canEdit,
    can: async () => null, name: async () => me.name,
    profiles: async (ids) => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: i === "u_test" ? "Test Admin" : "", avatarUrl: avatar, color: "#C8102E", email: null, isMe: i === me.id, guest: false, roles: null }])),
  });
  window.claude = Object.freeze({ use: (name) => new Promise(r => setTimeout(() => r(cfg.signedOut ? null : name === "db" ? db : name === "user" ? user : null), 80)) });
})();

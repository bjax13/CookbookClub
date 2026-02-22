export function createDefaultState() {
  return {
    version: 1,
    clubs: [],
    users: [],
    memberships: [],
    meetups: [],
    recipes: [],
    favorites: [],
    personalCollections: [],
    collectionItems: [],
    cookbookAccessGrants: [],
    notifications: [],
    counters: {}
  };
}

export function nextId(state, key) {
  const current = state.counters[key] || 0;
  const next = current + 1;
  state.counters[key] = next;
  return `${key}_${next}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function dedupeBy(list, selector) {
  const seen = new Set();
  return list.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

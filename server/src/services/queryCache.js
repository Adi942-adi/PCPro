const toBoolean = (value, fallback = true) => {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getCacheEnabled = () => toBoolean(process.env.QUERY_CACHE_ENABLED, true);
const getDefaultTtlMs = () => Math.max(1000, toNumber(process.env.QUERY_CACHE_TTL_MS, 20000));
const getMaxEntries = () => Math.max(100, toNumber(process.env.QUERY_CACHE_MAX_ENTRIES, 1500));

const cacheStore = new Map();

const isPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value);
};

const stableSerialize = (value) => {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const chunks = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    return `{${chunks.join(",")}}`;
  }

  return JSON.stringify(String(value));
};

const cleanupExpired = () => {
  const now = Date.now();
  for (const [key, entry] of cacheStore.entries()) {
    if (entry.expiresAt <= now) {
      cacheStore.delete(key);
    }
  }
};

const enforceEntryLimit = () => {
  const maxEntries = getMaxEntries();
  if (cacheStore.size <= maxEntries) {
    return;
  }

  const entries = [...cacheStore.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const toDelete = Math.max(0, entries.length - maxEntries);
  for (let index = 0; index < toDelete; index += 1) {
    cacheStore.delete(entries[index][0]);
  }
};

export const buildQueryCacheKey = (prefix, data = {}) => {
  return `${String(prefix || "cache")}::${stableSerialize(data)}`;
};

export const getOrSetQueryCache = async ({ key, ttlMs, resolver }) => {
  const resolvedTtlMs = Number.isFinite(Number(ttlMs)) ? Number(ttlMs) : getDefaultTtlMs();
  if (!getCacheEnabled() || !key || typeof resolver !== "function" || resolvedTtlMs <= 0) {
    return {
      hit: false,
      value: await resolver()
    };
  }

  const now = Date.now();
  const existing = cacheStore.get(key);
  if (existing && existing.expiresAt > now) {
    return {
      hit: true,
      value: existing.value
    };
  }

  const value = await resolver();
  cacheStore.set(key, {
    value,
    createdAt: now,
    expiresAt: now + resolvedTtlMs
  });

  cleanupExpired();
  enforceEntryLimit();

  return {
    hit: false,
    value
  };
};

export const clearQueryCacheByPrefix = (prefix = "") => {
  const normalized = String(prefix || "");
  if (!normalized) {
    cacheStore.clear();
    return 0;
  }

  let removed = 0;
  for (const key of cacheStore.keys()) {
    if (key.startsWith(normalized)) {
      cacheStore.delete(key);
      removed += 1;
    }
  }

  return removed;
};

export const getQueryCacheStats = () => {
  cleanupExpired();
  return {
    enabled: getCacheEnabled(),
    size: cacheStore.size,
    defaultTtlMs: getDefaultTtlMs(),
    maxEntries: getMaxEntries()
  };
};

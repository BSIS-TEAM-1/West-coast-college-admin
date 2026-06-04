class ApiCache {
  constructor() {
    this.store = new Map();
    this.maxEntries = Number(process.env.API_CACHE_MAX_ENTRIES || 500);
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.payload;
  }

  set(key, payload, ttlMs) {
    if (!key || !payload || ttlMs <= 0) return;

    this.store.set(key, {
      payload,
      expiresAt: Date.now() + ttlMs
    });

    this.prune();
  }

  invalidatePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.includes(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear() {
    this.store.clear();
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }

    if (this.store.size <= this.maxEntries) return;

    const overflow = this.store.size - this.maxEntries;
    const keys = Array.from(this.store.keys()).slice(0, overflow);
    keys.forEach((key) => this.store.delete(key));
  }
}

const apiCache = new ApiCache();

function buildCacheKey(req) {
  const role = req.accountType || 'public';
  const actor = req.adminId || req.username || req.ip || 'anonymous';
  return `${role}:${actor}:${req.method}:${req.originalUrl || req.url}`;
}

function cacheMiddleware({ ttlMs = 30_000 } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET' || ttlMs <= 0) return next();

    const key = buildCacheKey(req);
    const cached = apiCache.get(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(cached.statusCode).json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        apiCache.set(key, { statusCode: res.statusCode, body }, ttlMs);
        res.setHeader('X-Cache', 'MISS');
      }

      return originalJson(body);
    };

    next();
  };
}

module.exports = {
  apiCache,
  cacheMiddleware
};

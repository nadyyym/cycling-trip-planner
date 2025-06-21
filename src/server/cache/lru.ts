/**
 * LRU Cache implementation for segment exploration caching
 * Reduces Strava API calls by caching results based on bounding box
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
}

interface CacheOptions {
  maxSize: number;
  ttlMs: number;
}

/**
 * Simple LRU Cache with TTL support
 * Used to cache Strava segment exploration results by bounding box hash
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private totalGets = 0;
  private totalHits = 0;
  private totalMisses = 0;
  private totalSets = 0;
  private totalEvictions = 0;
  private totalExpired = 0;

  constructor(options: CacheOptions) {
    this.maxSize = options.maxSize;
    this.ttlMs = options.ttlMs;

    console.log(`[CACHE_INIT]`, {
      maxSize: options.maxSize,
      ttlMs: options.ttlMs,
      ttlMinutes: Math.round(options.ttlMs / 60000),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Generate a cache key from bounding box coordinates
   * Rounds coordinates to 4 decimal places for consistent hashing
   */
  static boundsToKey(bounds: {
    sw: [number, number];
    ne: [number, number];
  }): string {
    const { sw, ne } = bounds;
    const swRounded = [
      Math.round(sw[0] * 10000) / 10000,
      Math.round(sw[1] * 10000) / 10000,
    ];
    const neRounded = [
      Math.round(ne[0] * 10000) / 10000,
      Math.round(ne[1] * 10000) / 10000,
    ];
    return `${swRounded[0]},${swRounded[1]},${neRounded[0]},${neRounded[1]}`;
  }

  /**
   * Get value from cache if it exists and hasn't expired
   */
  get(key: string): T | undefined {
    this.totalGets++;
    const entry = this.cache.get(key);

    if (!entry) {
      this.totalMisses++;
      console.log(`[CACHE_MISS]`, {
        key,
        reason: "not_found",
        totalGets: this.totalGets,
        hitRate: this.getHitRate(),
        cacheSize: this.cache.size,
        timestamp: new Date().toISOString(),
      });
      return undefined;
    }

    // Check if entry has expired
    const now = Date.now();
    const age = now - entry.timestamp;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      this.totalMisses++;
      this.totalExpired++;

      console.log(`[CACHE_EXPIRED]`, {
        key,
        age: `${Math.round(age / 1000)}s`,
        ttl: `${Math.round(this.ttlMs / 1000)}s`,
        accessCount: entry.accessCount,
        totalExpired: this.totalExpired,
        cacheSize: this.cache.size,
        timestamp: new Date().toISOString(),
      });

      return undefined;
    }

    // Cache hit - update access count for LRU tracking
    entry.accessCount++;
    this.totalHits++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    console.log(`[CACHE_HIT]`, {
      key,
      age: `${Math.round(age / 1000)}s`,
      accessCount: entry.accessCount,
      totalHits: this.totalHits,
      hitRate: this.getHitRate(),
      cacheSize: this.cache.size,
      timestamp: new Date().toISOString(),
    });

    return entry.value;
  }

  /**
   * Set value in cache
   * Evicts oldest entries if cache is full
   */
  set(key: string, value: T): void {
    const now = Date.now();
    this.totalSets++;
    let wasUpdate = false;
    let evictedKey: string | undefined;

    // If key already exists, update it
    if (this.cache.has(key)) {
      wasUpdate = true;
      const oldEntry = this.cache.get(key);
      this.cache.set(key, {
        value,
        timestamp: now,
        accessCount: (oldEntry?.accessCount ?? 0) + 1,
      });
    } else {
      // If cache is full, remove least recently used entry
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          const evictedEntry = this.cache.get(firstKey);
          this.cache.delete(firstKey);
          this.totalEvictions++;
          evictedKey = firstKey;

          console.log(`[CACHE_EVICTION]`, {
            evictedKey: firstKey,
            evictedAge: evictedEntry
              ? `${Math.round((now - evictedEntry.timestamp) / 1000)}s`
              : "unknown",
            evictedAccessCount: evictedEntry?.accessCount ?? 0,
            totalEvictions: this.totalEvictions,
            cacheSize: this.cache.size,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Add new entry
      this.cache.set(key, {
        value,
        timestamp: now,
        accessCount: 1,
      });
    }

    console.log(`[CACHE_SET]`, {
      key,
      operation: wasUpdate ? "update" : "insert",
      evictedKey,
      totalSets: this.totalSets,
      cacheSize: this.cache.size,
      maxSize: this.maxSize,
      utilizationRate: `${((this.cache.size / this.maxSize) * 100).toFixed(1)}%`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if key exists in cache and hasn't expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check expiration
    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.totalExpired++;

      console.log(`[CACHE_HAS_EXPIRED]`, {
        key,
        age: `${Math.round((now - entry.timestamp) / 1000)}s`,
        ttl: `${Math.round(this.ttlMs / 1000)}s`,
        totalExpired: this.totalExpired,
        timestamp: new Date().toISOString(),
      });

      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const clearedCount = this.cache.size;
    this.cache.clear();

    // Reset stats
    this.totalGets = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
    this.totalSets = 0;
    this.totalEvictions = 0;
    this.totalExpired = 0;

    console.log(`[CACHE_CLEAR]`, {
      clearedCount,
      statsReset: true,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get cache hit rate as percentage
   */
  private getHitRate(): string {
    if (this.totalGets === 0) return "0.0%";
    return `${((this.totalHits / this.totalGets) * 100).toFixed(1)}%`;
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
    totalGets: number;
    totalHits: number;
    totalMisses: number;
    totalSets: number;
    totalEvictions: number;
    totalExpired: number;
    hitRate: string;
    utilizationRate: string;
    entries: Array<{ key: string; age: number; accessCount: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      accessCount: entry.accessCount,
    }));

    const stats = {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      totalGets: this.totalGets,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      totalSets: this.totalSets,
      totalEvictions: this.totalEvictions,
      totalExpired: this.totalExpired,
      hitRate: this.getHitRate(),
      utilizationRate: `${((this.cache.size / this.maxSize) * 100).toFixed(1)}%`,
      entries,
    };

    console.log(`[CACHE_STATS]`, {
      ...stats,
      entries: entries.length, // Don't log full entries array, just count
      timestamp: new Date().toISOString(),
    });

    return stats;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const cleanupStart = Date.now();
    const now = Date.now();
    const keysToDelete: string[] = [];
    const sizeBefore = this.cache.size;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.totalExpired++;
    }

    const cleanupDuration = Date.now() - cleanupStart;
    const sizeAfter = this.cache.size;

    if (keysToDelete.length > 0) {
      console.log(`[CACHE_CLEANUP]`, {
        expiredKeys: keysToDelete.length,
        sizeBefore,
        sizeAfter,
        totalExpired: this.totalExpired,
        cleanupDuration: `${cleanupDuration}ms`,
        expiredKeysSample: keysToDelete.slice(0, 3), // Show first 3 expired keys
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// Global cache instance for segment exploration
// 200 entries max, 5 minute TTL as specified in the requirements
export const segmentExploreCache = new LRUCache<unknown>({
  maxSize: 200,
  ttlMs: 5 * 60 * 1000, // 5 minutes
});

/**
 * Periodically clean up expired cache entries and log cache performance
 * Runs every 2 minutes to remove expired entries
 */
setInterval(
  () => {
    console.log(`[CACHE_PERIODIC_CLEANUP_START]`, {
      timestamp: new Date().toISOString(),
    });

    segmentExploreCache.cleanup();

    // Log periodic stats for monitoring
    const stats = segmentExploreCache.getStats();

    console.log(`[CACHE_PERIODIC_STATS]`, {
      ...stats,
      entries: stats.entries.length, // Don't log full entries, just count
      averageAge:
        stats.entries.length > 0
          ? `${Math.round(stats.entries.reduce((sum, e) => sum + e.age, 0) / stats.entries.length / 1000)}s`
          : "0s",
      timestamp: new Date().toISOString(),
    });
  },
  2 * 60 * 1000,
);

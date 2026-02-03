/**
 * Volume Caching Layer
 *
 * Stores computed MPR volumes keyed by centerline hash to enable instant reload
 * of previously computed volumes. Uses LRU (Least Recently Used) eviction strategy
 * to manage memory limits.
 *
 * The cache tracks memory usage based on Int16Array buffer sizes and evicts
 * least recently accessed entries when memory limits are reached.
 */

import type { CurvedMPRVolume } from './curved-mpr'
import type { ControlPoint } from './centerline'

/**
 * Cache entry metadata
 */
interface CacheEntry {
  /** Unique hash key for this entry */
  key: string
  /** Cached MPR volume */
  volume: CurvedMPRVolume
  /** Memory size in bytes */
  memorySize: number
  /** Timestamp of last access (for LRU) */
  lastAccessed: number
  /** Timestamp of creation */
  created: number
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of entries in cache */
  entryCount: number
  /** Total memory used in bytes */
  memoryUsed: number
  /** Maximum memory allowed in bytes */
  memoryLimit: number
  /** Memory usage as percentage (0-100) */
  memoryUsagePercent: number
  /** Number of cache hits */
  hits: number
  /** Number of cache misses */
  misses: number
  /** Hit rate as percentage (0-100) */
  hitRate: number
  /** Number of evictions performed */
  evictions: number
}

/**
 * Configuration for volume cache
 */
export interface VolumeCacheConfig {
  /** Maximum memory limit in bytes. Default: 512MB */
  maxMemoryBytes?: number
  /** Maximum number of entries (additional limit). Default: 50 */
  maxEntries?: number
  /** Enable debug logging. Default: false */
  debug?: boolean
}

/**
 * Volume cache with LRU eviction
 *
 * Manages computed MPR volumes with automatic eviction based on memory limits.
 * Uses centerline hash as key for O(1) lookup performance.
 */
export class VolumeCache {
  private cache: Map<string, CacheEntry> = new Map()
  private memoryUsed = 0
  private hits = 0
  private misses = 0
  private evictions = 0
  private readonly maxMemoryBytes: number
  private readonly maxEntries: number
  private readonly debug: boolean

  constructor(config: VolumeCacheConfig = {}) {
    // Default to 512MB memory limit
    this.maxMemoryBytes = config.maxMemoryBytes ?? 512 * 1024 * 1024
    this.maxEntries = config.maxEntries ?? 50
    this.debug = config.debug ?? false

    this.log(
      `Cache initialized with ${this.formatBytes(this.maxMemoryBytes)} limit`,
    )
  }

  /**
   * Gets a cached volume by centerline hash
   *
   * @param key - Centerline hash key
   * @returns Cached volume or null if not found
   */
  get(key: string): CurvedMPRVolume | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      this.log(`Cache miss: ${key}`)
      return null
    }

    // Update last accessed timestamp (for LRU)
    entry.lastAccessed = Date.now()
    this.hits++
    this.log(`Cache hit: ${key}`)

    return entry.volume
  }

  /**
   * Stores a volume in the cache
   *
   * @param key - Centerline hash key
   * @param volume - MPR volume to cache
   */
  set(key: string, volume: CurvedMPRVolume): void {
    // Calculate memory size (mainly the Int16Array data)
    const memorySize = this.calculateVolumeSize(volume)

    // Check if we need to evict entries to make space
    this.evictIfNeeded(memorySize)

    // Remove existing entry if present (to update it)
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!
      this.memoryUsed -= existing.memorySize
    }

    // Create new entry
    const entry: CacheEntry = {
      key,
      volume,
      memorySize,
      lastAccessed: Date.now(),
      created: Date.now(),
    }

    // Add to cache
    this.cache.set(key, entry)
    this.memoryUsed += memorySize

    this.log(
      `Cached volume: ${key} (${this.formatBytes(memorySize)}, total: ${this.formatBytes(this.memoryUsed)})`,
    )
  }

  /**
   * Checks if a volume is in the cache
   *
   * @param key - Centerline hash key
   * @returns True if cached
   */
  has(key: string): boolean {
    return this.cache.has(key)
  }

  /**
   * Removes a specific entry from the cache
   *
   * @param key - Centerline hash key
   * @returns True if entry was removed
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    this.cache.delete(key)
    this.memoryUsed -= entry.memorySize
    this.log(`Deleted cache entry: ${key}`)

    return true
  }

  /**
   * Clears all entries from the cache
   */
  clear(): void {
    const count = this.cache.size
    this.cache.clear()
    this.memoryUsed = 0
    this.log(`Cleared cache (${count} entries)`)
  }

  /**
   * Gets cache statistics
   *
   * @returns Current cache stats
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0

    return {
      entryCount: this.cache.size,
      memoryUsed: this.memoryUsed,
      memoryLimit: this.maxMemoryBytes,
      memoryUsagePercent: (this.memoryUsed / this.maxMemoryBytes) * 100,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      evictions: this.evictions,
    }
  }

  /**
   * Evicts entries if needed to make space for new entry
   *
   * Uses LRU (Least Recently Used) strategy - evicts oldest accessed entries first
   *
   * @param requiredSpace - Memory space needed in bytes
   */
  private evictIfNeeded(requiredSpace: number): void {
    // Check if we would exceed memory limit
    const wouldExceedMemory =
      this.memoryUsed + requiredSpace > this.maxMemoryBytes

    // Check if we would exceed entry limit
    const wouldExceedEntries = this.cache.size >= this.maxEntries

    if (!wouldExceedMemory && !wouldExceedEntries) {
      return
    }

    // Convert cache to array and sort by lastAccessed (LRU)
    const entries = Array.from(this.cache.values()).sort(
      (a, b) => a.lastAccessed - b.lastAccessed,
    )

    // Evict entries until we have enough space and are under entry limit
    for (const entry of entries) {
      if (
        this.memoryUsed + requiredSpace <= this.maxMemoryBytes &&
        this.cache.size < this.maxEntries
      ) {
        break
      }

      this.cache.delete(entry.key)
      this.memoryUsed -= entry.memorySize
      this.evictions++

      this.log(
        `Evicted LRU entry: ${entry.key} (${this.formatBytes(entry.memorySize)}, age: ${Math.round((Date.now() - entry.created) / 1000)}s)`,
      )
    }
  }

  /**
   * Calculates the memory size of a volume
   *
   * @param volume - MPR volume
   * @returns Memory size in bytes
   */
  private calculateVolumeSize(volume: CurvedMPRVolume): number {
    // Main memory usage is the Int16Array data buffer
    const dataSize = volume.data.byteLength

    // Add overhead for object structure (rough estimate)
    const overheadSize = 1024 // 1KB for object metadata

    // Add centerline points overhead (rough estimate)
    const centerlineSize = volume.centerlinePoints.length * 64 // ~64 bytes per point

    return dataSize + overheadSize + centerlineSize
  }

  /**
   * Formats bytes into human-readable string
   *
   * @param bytes - Number of bytes
   * @returns Formatted string (e.g., "1.5 MB")
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
  }

  /**
   * Logs a debug message if debug mode is enabled
   *
   * @param message - Message to log
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[VolumeCache] ${message}`)
    }
  }
}

// ============================================================================
// Hash Generation Utilities
// ============================================================================

/**
 * Generates a hash key from centerline control points
 *
 * Creates a deterministic string representation of the centerline that can be
 * used as a cache key. Two centerlines with identical control points will
 * produce the same hash.
 *
 * @param controlPoints - Array of control points defining the centerline
 * @param vessel - Vessel identifier (e.g., 'LAD', 'LCX', 'RCA')
 * @param studyId - Study identifier
 * @returns Hash string for cache key
 */
export function generateCenterlineHash(
  controlPoints: Array<ControlPoint>,
  vessel?: string,
  studyId?: string,
): string {
  // Round coordinates to 2 decimal places for consistent hashing
  // (slight floating point differences shouldn't produce different hashes)
  const roundedPoints = controlPoints.map((p) => ({
    x: Math.round(p.x * 100) / 100,
    y: Math.round(p.y * 100) / 100,
    z: Math.round(p.z * 100) / 100,
  }))

  // Create string representation
  const pointsStr = roundedPoints.map((p) => `${p.x},${p.y},${p.z}`).join('|')

  // Include vessel and study ID for additional uniqueness
  const parts = [pointsStr]
  if (vessel) parts.push(vessel)
  if (studyId) parts.push(studyId)

  const combined = parts.join(':')

  // Use simple hash function (FNV-1a)
  return hashString(combined)
}

/**
 * FNV-1a hash function for strings
 *
 * Fast, simple hash function with good distribution properties.
 *
 * @param str - String to hash
 * @returns Hash as hex string
 */
function hashString(str: string): string {
  let hash = 2166136261 // FNV offset basis (32-bit)

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619) // FNV prime (32-bit)
  }

  // Convert to unsigned 32-bit integer and return as hex
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Generates a short, human-readable identifier from a hash
 *
 * @param hash - Full hash string
 * @returns Short identifier (first 8 characters)
 */
export function shortHash(hash: string): string {
  return hash.slice(0, 8)
}

// ============================================================================
// Global Cache Instance
// ============================================================================

/**
 * Default global volume cache instance
 *
 * Can be imported and used across the application for simple use cases.
 * For more control, create custom VolumeCache instances with specific configs.
 */
export const globalVolumeCache = new VolumeCache({
  maxMemoryBytes: 512 * 1024 * 1024, // 512MB
  maxEntries: 50,
  debug: false,
})

/**
 * Helper function to get cached volume or compute if not cached
 *
 * @param key - Cache key (centerline hash)
 * @param computeFn - Function to compute volume if not cached
 * @returns Cached or newly computed volume
 */
export async function getCachedOrCompute(
  key: string,
  computeFn: () => Promise<CurvedMPRVolume> | CurvedMPRVolume,
): Promise<CurvedMPRVolume> {
  // Try to get from cache
  const cached = globalVolumeCache.get(key)
  if (cached) {
    return cached
  }

  // Compute new volume
  const volume = await computeFn()

  // Store in cache
  globalVolumeCache.set(key, volume)

  return volume
}

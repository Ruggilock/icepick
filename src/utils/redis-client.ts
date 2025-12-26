import Redis from 'ioredis';
import { logger } from './logger.ts';

class RedisClient {
  private client: Redis | null = null;
  private enabled: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn('REDIS_URL not configured - Redis cache disabled');
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError(err) {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected');
        this.enabled = true;
      });

      this.client.on('error', (err) => {
        logger.error('Redis error', { error: err.message });
        this.enabled = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.enabled = false;
      });

    } catch (error: any) {
      logger.error('Failed to initialize Redis', { error: error.message });
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isEnabled()) return null;

    try {
      const value = await this.client!.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error: any) {
      logger.debug('Redis GET error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache with TTL (in seconds)
   */
  async set(key: string, value: any, ttl: number = 60): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const serialized = JSON.stringify(value);
      await this.client!.setex(key, ttl, serialized);
      return true;
    } catch (error: any) {
      logger.debug('Redis SET error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      await this.client!.del(key);
      return true;
    } catch (error: any) {
      logger.debug('Redis DEL error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error: any) {
      logger.debug('Redis EXISTS error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get multiple keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.isEnabled()) return [];

    try {
      return await this.client!.keys(pattern);
    } catch (error: any) {
      logger.debug('Redis KEYS error', { pattern, error: error.message });
      return [];
    }
  }

  /**
   * Clear all keys matching pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    if (!this.isEnabled()) return 0;

    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client!.del(...keys);
    } catch (error: any) {
      logger.debug('Redis CLEAR PATTERN error', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Disconnect Redis client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.enabled = false;
      logger.info('Redis disconnected');
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    connected: boolean;
    keysCount: number;
    memoryUsed?: string;
  }> {
    if (!this.isEnabled()) {
      return { connected: false, keysCount: 0 };
    }

    try {
      const dbSize = await this.client!.dbsize();
      const info = await this.client!.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1] : undefined;

      return {
        connected: true,
        keysCount: dbSize,
        memoryUsed,
      };
    } catch (error: any) {
      logger.debug('Redis STATS error', { error: error.message });
      return { connected: false, keysCount: 0 };
    }
  }
}

// Singleton instance
export const redisClient = new RedisClient();

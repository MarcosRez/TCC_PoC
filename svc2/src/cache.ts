const Redis = require("ioredis");
import { cfg, useRedis } from "./config.js";
export let redis: typeof Redis | null = null;

export async function initCache() {
  if (useRedis(cfg.scenario)) {
    redis = new Redis(cfg.redisUrl);
    redis.on("error", (e: any) => console.error(`[${cfg.serviceName}] Redis error`, e));
  }
}
export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) as T : null;
}
export async function setCache<T>(key: string, val: T, ttlSec = 5) {
  if (!redis) return;
  await redis.set(key, JSON.stringify(val), "EX", ttlSec);
}

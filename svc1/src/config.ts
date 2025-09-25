export type Scenario = "s1"|"s2"|"s3"|"s4"|"s5"|"s6";

export const cfg = {
  serviceName: process.env.SERVICE_NAME || "svc1",
  port: Number(process.env.PORT || 4001),
  scenario: (process.env.SCENARIO || "s1") as Scenario,
  pg: {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || "tcc",
    password: process.env.PG_PASSWORD || "tcc",
    database: process.env.PG_DATABASE || "appdb",
  },
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://tcc:tcc@localhost:27017",
    db: process.env.MONGO_DB || "appdb",
  },
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  externalLatencyMs: Number(process.env.EXTERNAL_LAT_MS || 80),
  externalFailRatio: Number(process.env.FAIL_RATIO || 0.02)
};

export const usePg = (s: Scenario) => ["s1","s3","s5","s6"].includes(s);
export const useMongo = (s: Scenario) => ["s2","s4","s5","s6"].includes(s);
export const useRedis = (s: Scenario) => ["s3","s4","s6"].includes(s);

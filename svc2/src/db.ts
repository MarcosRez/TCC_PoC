import { cfg, useMongo, usePg } from "./config.js";
import { MongoClient, Db } from "mongodb";
import { Client as PgClient } from "pg";

export type PgOrMongo = { pg?: PgClient; mongo?: Db };
let pg: PgClient | undefined; let mongo: Db | undefined;

export async function initDB(): Promise<PgOrMongo> {
  if (usePg(cfg.scenario)) {
    pg = new PgClient({ host: cfg.pg.host, port: cfg.pg.port, user: cfg.pg.user, password: cfg.pg.password, database: cfg.pg.database });
    await pg.connect();
    await pg.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        value INT NOT NULL DEFAULT 0
      );
    `);
  }
  if (useMongo(cfg.scenario)) {
    const mc = new MongoClient(cfg.mongo.uri);
    await mc.connect();
    mongo = mc.db(cfg.mongo.db);
    await mongo.collection("items").createIndex({ name: 1 }, { unique: false });
  }
  return { pg, mongo };
}

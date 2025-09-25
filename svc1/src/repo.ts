import { Db } from "mongodb";
import { Client as PgClient } from "pg";
import { getCache, setCache } from "./cache.js";

export class Repo {
  constructor(private pg?: PgClient, private mongo?: Db) {}

  async listItems(): Promise<{ id: string; name: string; value: number }[]> {
    const k = "items:list";
    const c = await getCache<typeof out>(k);
    if (c) return c;

    let out: { id: string; name: string; value: number }[] = [];
    if (this.pg) {
      const r = await this.pg.query(`SELECT id, name, value FROM items ORDER BY id DESC LIMIT 50`);
      out = r.rows.map((x) => ({ id: String(x.id), name: x.name, value: Number(x.value) }));
    }
    if (this.mongo) {
      const cur = await this.mongo.collection("items").find({}, { projection: { _id: 1, name: 1, value: 1 } }).sort({ _id: -1 }).limit(50).toArray();
      out = cur.map((x: any) => ({ id: String(x._id), name: x.name, value: Number(x.value ?? 0) }));
    }
    await setCache(k, out, 5);
    return out;
  }

  async createItem(name: string, value: number): Promise<void> {
    if (this.pg) await this.pg.query(`INSERT INTO items(name, value) VALUES ($1,$2)`, [name, value]);
    if (this.mongo) await this.mongo.collection("items").insertOne({ name, value });
  }
}

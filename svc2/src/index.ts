import express from "express";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { typeDefs } from "./schema.js";
import { cfg } from "./config.js";
import { initDB } from "./db.js";
import { initCache } from "./cache.js";
import { Repo } from "./repo.js";
import client from "prom-client";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await initCache();
  const { pg, mongo } = await initDB();
  const repo = new Repo(pg, mongo);

  // Prometheus
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  const gqlDur = new client.Histogram({
    name: "svc_graphql_resolver_duration_seconds",
    help: "Duracao resolvers",
    labelNames: ["field"],
    buckets: [0.01,0.05,0.1,0.2,0.5,1,2,5]
  });
  register.registerMetric(gqlDur);

  const server = new ApolloServer({
    typeDefs,
    resolvers: {
      Query: {
        health: () => `${cfg.serviceName}:${cfg.scenario}`,
        items: async () => {
          const end = gqlDur.startTimer({ field: "items" });
          const data = await repo.listItems();
          end();
          return data;
        },
        external: async () => {
          const end = gqlDur.startTimer({ field: "external" });
          await sleep(cfg.externalLatencyMs);
          const fail = Math.random() < cfg.externalFailRatio;
          end();
          if (fail) return { ok: false, latency: cfg.externalLatencyMs, service: cfg.serviceName };
          return { ok: true, latency: cfg.externalLatencyMs, service: cfg.serviceName };
        }
      },
      Mutation: {
        createItem: async (_r: any, { input }: any) => {
          const end = gqlDur.startTimer({ field: "createItem" });
          await repo.createItem(input.name, input.value);
          end();
          return true;
        }
      }
    }
  });

  await server.start();

  const app = express();
  app.use("/graphql", bodyParser.json(), expressMiddleware(server));
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  app.listen(cfg.port, () => console.log(`${cfg.serviceName} GQL :${cfg.port} [${cfg.scenario}]`));
}

main().catch((e) => { console.error(e); process.exit(1); });

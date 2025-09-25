import express from "express";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { gql } from "graphql-tag";
import { GraphQLClient } from "graphql-request";
import client from "prom-client";

const PORT = Number(process.env.PORT || 4000);
const SVC_A = process.env.SVC_A_URL || "http://localhost:4001/graphql";
const SVC_B = process.env.SVC_B_URL || "http://localhost:4002/graphql";

const gA = new GraphQLClient(SVC_A);
const gB = new GraphQLClient(SVC_B);

// Schema do gateway (BFF): compõe dados de A e B
const typeDefs = gql`
  type Item { id: ID!, name: String!, value: Int! }
  type ExternalCheck { ok: Boolean!, latency: Int!, service: String! }

  type Query {
    health: String!
    itemsA: [Item!]!
    itemsB: [Item!]!
    itemsAll: [Item!]!
    externalAll: [ExternalCheck!]!
  }

  input NewItem { name: String!, value: Int! }
  type Mutation {
    createItemA(input: NewItem!): Boolean!
    createItemB(input: NewItem!): Boolean!
  }
`;

// Métricas Prometheus
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const reqs = new client.Counter({
  name: "gateway_graphql_requests_total",
  help: "Total de operações GraphQL no gateway",
  labelNames: ["op", "field"]
});
register.registerMetric(reqs);

const server = new ApolloServer({
  typeDefs,
  resolvers: {
    Query: {
      health: async () => "ok",
      itemsA: async (_r, _a, _c, info) => {
        reqs.inc({ op: "query", field: info.fieldName });
        const data:any = await gA.request(`{ items { id name value } }`);
        return data.items;
      },
      itemsB: async (_r, _a, _c, info) => {
        reqs.inc({ op: "query", field: info.fieldName });
        const data:any = await gB.request(`{ items { id name value } }`);
        return data.items;
      },
      itemsAll: async (_r, _a, _c, info) => {
        reqs.inc({ op: "query", field: info.fieldName });
        const [a, b] = await Promise.all([
          gA.request(`{ items { id name value } }`),
          gB.request(`{ items { id name value } }`)
        ]);
        //@ts-ignore
        return [...a.items, ...b.items];
      },
      externalAll: async (_r, _a, _c, info) => {
        reqs.inc({ op: "query", field: info.fieldName });
        const q = `query { external { ok latency service } }`;
        const [a, b] = await Promise.all([gA.request(q), gB.request(q)]);
         //@ts-ignore
        return [a.external, b.external];
      }
    },
    Mutation: {
      createItemA: async (_r, { input }, _c, info) => {
        reqs.inc({ op: "mutation", field: info.fieldName });
        await gA.request(`mutation($i: NewItem!){ createItem(input:$i) }`, { i: input });
        return true;
      },
      createItemB: async (_r, { input }, _c, info) => {
        reqs.inc({ op: "mutation", field: info.fieldName });
        await gB.request(`mutation($i: NewItem!){ createItem(input:$i) }`, { i: input });
        return true;
      }
    }
  }
});

async function main() {
  await server.start();
  const app = express();
  app.use("/graphql", bodyParser.json(), expressMiddleware(server));
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });
  app.listen(PORT, () => console.log(`Gateway GQL :${PORT}`));
}
main();

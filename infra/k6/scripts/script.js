import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

/**
 * ===============================
 * Config / Env
 * ===============================
 */
const BASE_URL = __ENV.BASE_URL || "http://gateway:4000/graphql";
const DURATION = __ENV.DURATION || "5m";
const VUS = Number(__ENV.VUS || 100);
const READ_RATE = Number(__ENV.READ_RATE || 60); // req/s
const WRITE_RATE = Number(__ENV.WRITE_RATE || 10); // req/s

// Headers base
function headers() {
  const base = { "Content-Type": "application/json" };
  // Permite passar headers extras via env como JSON válido
  // Ex.: EXTRA_HEADERS='{"Authorization":"Bearer TOKEN"}'
  try {
    const extra = __ENV.EXTRA_HEADERS ? JSON.parse(__ENV.EXTRA_HEADERS) : {};
    return Object.assign({}, base, extra);
  } catch (_e) {
    // Se JSON inválido, usa apenas o base
    return base;
  }
}

/**
 * ===============================
 * Métricas custom
 * ===============================
 */
const gqlDuration = {
  readsA: new Trend("gql_readsA_duration", true),
  readsB: new Trend("gql_readsB_duration", true),
  readsAll: new Trend("gql_readsAll_duration", true),
  externalAll: new Trend("gql_externalAll_duration", true),
  writesA: new Trend("gql_writesA_duration", true),
  writesB: new Trend("gql_writesB_duration", true),
};

/**
 * ===============================
 * Options e cenários
 * ===============================
 */
export const options = {
  scenarios: {
    readsA: {
      executor: "constant-arrival-rate",
      rate: Math.floor(READ_RATE / 3) || 1,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: VUS,
      maxVUs: VUS * 2,
      exec: "scenarioReadsA",
    },
    readsB: {
      executor: "constant-arrival-rate",
      rate: Math.floor(READ_RATE / 3) || 1,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: VUS,
      maxVUs: VUS * 2,
      exec: "scenarioReadsB",
    },
    readsAll: {
      executor: "constant-arrival-rate",
      rate: Math.ceil(READ_RATE / 3) || 1,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: VUS,
      maxVUs: VUS * 2,
      exec: "scenarioReadsAll",
    },
    externalAll: {
      executor: "constant-arrival-rate",
      rate: Math.max(1, Math.floor(READ_RATE / 6)),
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(1, Math.floor(VUS / 4)),
      maxVUs: VUS,
      exec: "scenarioExternalAll",
    },
    writesA: {
      executor: "constant-arrival-rate",
      rate: Math.max(1, Math.floor(WRITE_RATE / 2)),
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(1, Math.floor(VUS / 3)),
      maxVUs: VUS,
      exec: "scenarioWritesA",
    },
    writesB: {
      executor: "constant-arrival-rate",
      rate: Math.max(1, Math.ceil(WRITE_RATE / 2)),
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(1, Math.floor(VUS / 3)),
      maxVUs: VUS,
      exec: "scenarioWritesB",
    },
  },

  // Thresholds gerais e por cenário (tags/scenario são adicionadas automaticamente)
  thresholds: {
    http_req_failed: ["rate<0.01"], // < 1% falhas
    checks: ["rate>0.99"], // > 99% checks passando

    // P95 de leitura mais apertado
    "http_req_duration{scenario:readsA}": ["p(95)<600"],
    "http_req_duration{scenario:readsB}": ["p(95)<600"],
    "http_req_duration{scenario:readsAll}": ["p(95)<600"],
    "http_req_duration{scenario:externalAll}": ["p(95)<800"],

    // P95 de escrita um pouco mais relaxado
    "http_req_duration{scenario:writesA}": ["p(95)<1000"],
    "http_req_duration{scenario:writesB}": ["p(95)<1000"],

    // Métricas custom opcionais
    gql_readsA_duration: ["p(95)<600"],
    gql_readsB_duration: ["p(95)<600"],
    gql_readsAll_duration: ["p(95)<600"],
    gql_externalAll_duration: ["p(95)<800"],
    gql_writesA_duration: ["p(95)<1000"],
    gql_writesB_duration: ["p(95)<1000"],
  },
};

/**
 * ===============================
 * Helpers
 * ===============================
 */
function gql(query, variables) {
  const payload = JSON.stringify({ query, variables });
  const res = http.post(BASE_URL, payload, { headers: headers() });
  let body;
  try {
    body = res.json();
  } catch (_e) {
    body = null;
  }
  return { res, body };
}

function randName() {
  const n = Math.floor(Math.random() * 1e6);
  return `item-${n}`;
}

function randValue() {
  return Math.floor(Math.random() * 1000); // Int!
}

/**
 * ===============================
 * Cenários de READ
 * ===============================
 */
export function scenarioReadsA() {
  const q = `query { itemsA { id name value } }`;
  const t0 = Date.now();
  const { res, body } = gql(q);
  const dt = Date.now() - t0;
  gqlDuration.readsA.add(dt);

  check(res, {
    "readsA status 200": (r) => r.status === 200,
  });

  const ok =
    body &&
    !body.errors &&
    body.data &&
    Array.isArray(body.data.itemsA) &&
    (body.data.itemsA.length >= 0 || body.data.itemsA.length === 0);

  check(body, {
    "readsA data ok": () => ok,
  });

  sleep(0.1);
}

export function scenarioReadsB() {
  const q = `query { itemsB { id name value } }`;
  const t0 = Date.now();
  const { res, body } = gql(q);
  const dt = Date.now() - t0;
  gqlDuration.readsB.add(dt);

  check(res, {
    "readsB status 200": (r) => r.status === 200,
  });

  const ok =
    body && !body.errors && body.data && Array.isArray(body.data.itemsB);

  check(body, {
    "readsB data ok": () => ok,
  });

  sleep(0.1);
}

export function scenarioReadsAll() {
  const q = `query { itemsAll { id name value } }`;
  const t0 = Date.now();
  const { res, body } = gql(q);
  const dt = Date.now() - t0;
  gqlDuration.readsAll.add(dt);

  check(res, {
    "readsAll status 200": (r) => r.status === 200,
  });

  const ok =
    body && !body.errors && body.data && Array.isArray(body.data.itemsAll);

  check(body, {
    "readsAll data ok": () => ok,
  });

  sleep(0.1);
}

export function scenarioExternalAll() {
  const q = `query { externalAll { ok latency service } }`;
  const t0 = Date.now();
  const { res, body } = gql(q);
  const dt = Date.now() - t0;
  gqlDuration.externalAll.add(dt);

  check(res, {
    "externalAll status 200": (r) => r.status === 200,
  });

  const ok =
    body &&
    !body.errors &&
    body.data &&
    Array.isArray(body.data.externalAll) &&
    body.data.externalAll.every(
      (e) =>
        typeof e.ok === "boolean" &&
        typeof e.latency === "number" &&
        typeof e.service === "string"
    );

  check(body, {
    "externalAll data ok": () => ok,
  });

  sleep(0.1);
}

/**
 * ===============================
 * Cenários de WRITE
 * ===============================
 * Mutations do gateway retornam Boolean! (true quando sucesso)
 */
export function scenarioWritesA() {
  const m = `
    mutation($input: NewItem!) {
      createItemA(input: $input)
    }
  `;
  const vars = { input: { name: randName(), value: randValue() } };
  const t0 = Date.now();
  const { res, body } = gql(m, vars);
  const dt = Date.now() - t0;
  gqlDuration.writesA.add(dt);

  check(res, {
    "writesA status 200": (r) => r.status === 200,
  });

  const ok =
    body && !body.errors && body.data && body.data.createItemA === true;

  check(body, {
    "writesA create ok": () => ok,
  });

  sleep(0.1);
}

export function scenarioWritesB() {
  const m = `
    mutation($input: NewItem!) {
      createItemB(input: $input)
    }
  `;
  const vars = { input: { name: randName(), value: randValue() } };
  const t0 = Date.now();
  const { res, body } = gql(m, vars);
  const dt = Date.now() - t0;
  gqlDuration.writesB.add(dt);

  check(res, {
    "writesB status 200": (r) => r.status === 200,
  });

  const ok =
    body && !body.errors && body.data && body.data.createItemB === true;

  check(body, {
    "writesB create ok": () => ok,
  });

  sleep(0.1);
}

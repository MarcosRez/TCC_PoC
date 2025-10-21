import http from "k6/http";
import { sleep, check } from "k6";
import { Trend, Counter } from "k6/metrics";

/** =========
 *  ENV VARS
 *  =========
 *  BASE_URL: URL do gateway (default http://localhost:4000)
 *  DURATION: duração (ex.: 2m)
 *  VUS_HOT: VUs de leitura quente (ex.: 50)
 *  VUS_COLD: VUs de leitura fria (ex.: 20)
 *  RPS_HOT: taxa alvo de requisições/s em read_hot (ex.: 100)
 *  RPS_WRITE: taxa alvo em writes/s (ex.: 20)
 *  DURATION_WRITE: duração da escrita (ex.: 1m)
 */
const BASE = __ENV.BASE_URL || "http://localhost:4000";
const URL = `${BASE.replace(/\/$/, "")}/graphql`;
const DURATION = __ENV.DURATION || "2m";

const VUS_HOT = Number(__ENV.VUS_HOT || 50);
const VUS_COLD = Number(__ENV.VUS_COLD || 20);
const RPS_HOT = Number(__ENV.RPS_HOT || 100);
const RPS_WRITE = Number(__ENV.RPS_WRITE || 20);
const DURATION_WRITE = __ENV.DURATION_WRITE || "1m";

// TTL do cache dos serviços (~5s no seu código). Usamos >TTL para “cold”.
const CACHE_TTL_SEC = Number(__ENV.CACHE_TTL_SEC || 5);
const COLD_PERIOD_SEC = CACHE_TTL_SEC + 1; // garante expiração

/** =======
 *  Métricas
 *  ======= */
const tReadHot = new Trend("gql_read_hot_duration", true);
const tReadCold = new Trend("gql_read_cold_duration", true);
const tWrite = new Trend("gql_write_duration", true);
const cHotOK = new Counter("gql_read_hot_ok");
const cColdOK = new Counter("gql_read_cold_ok");
const cWriteOK = new Counter("gql_write_ok");

/** =========
 *  Cenários
 *  =========
 *  warmup: prime o cache (baixa intensidade)
 *  read_hot: muitas leituras dentro do TTL (HIT)
 *  read_cold: leituras espaçadas > TTL (MISS)
 *  write_mix: escritas concorrentes (impacto em banco)
 */
export const options = {
  scenarios: {
    warmup: {
      executor: "constant-vus",
      vus: 5,
      duration: "20s",
      exec: "warmup",
      tags: { scenario: "warmup" },
    },

    read_hot: {
      executor: "constant-arrival-rate",
      rate: RPS_HOT,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: VUS_HOT,
      maxVUs: Math.max(VUS_HOT * 2, 50),
      exec: "readHot",
      tags: { scenario: "read_hot" },
    },

    read_cold: {
      executor: "constant-vus",
      vus: VUS_COLD,
      duration: DURATION,
      exec: "readCold",
      tags: { scenario: "read_cold" },
    },

    write_mix: {
      executor: "constant-arrival-rate",
      rate: RPS_WRITE,
      timeUnit: "1s",
      duration: DURATION_WRITE,
      preAllocatedVUs: Math.min(RPS_WRITE * 2, 100),
      maxVUs: Math.min(RPS_WRITE * 4, 200),
      exec: "writeMix",
      tags: { scenario: "write_mix" },
      startTime: "10s", // começa logo após o warmup
    },
  },

  thresholds: {
    // Você vê o efeito do cache pela diferença de p95
    "gql_read_hot_duration{scenario:read_hot}": ["p(95)<150"], // tipicamente baixo (cache HIT)
    "gql_read_cold_duration{scenario:read_cold}": ["p(95)<800"], // sem cache deve ser bem mais alto
    "gql_write_duration{scenario:write_mix}": ["p(95)<1000"],

    // checks
    checks: ["rate>0.99"],
  },

  summaryTrendStats: ["min", "avg", "p(90)", "p(95)", "p(99)", "max"],
};

// Queries/mutations (Gateway fields corretos)
const Q_ITEMS_ALL = JSON.stringify({ query: "{ itemsAll { id name value } }" });
const M_CREATE_A = (name, value) =>
  JSON.stringify({
    query: "mutation($i:NewItem!){ createItemA(input:$i) }",
    variables: { i: { name, value } },
  });

/** =============
 *  Funções auxiliares
 *  ============= */
function postGraphQL(body, extraTags = {}) {
  const res = http.post(URL, body, {
    headers: { "Content-Type": "application/json" },
    tags: extraTags,
  });
  return res;
}

function ok(res) {
  return check(res, {
    "status 200": (r) => r.status === 200,
    "no GraphQL errors": (r) => {
      try {
        const j = r.json();
        return !j || !j.errors;
      } catch {
        return false;
      }
    },
  });
}

/** ============
 *  Cenários exec
 *  ============ */

// 1) Esquenta o cache com algumas leituras
export function warmup() {
  const res = postGraphQL(Q_ITEMS_ALL, { phase: "warmup" });
  ok(res);
  sleep(1);
}

// 2) Leitura quente (HIT): várias leituras dentro do TTL
export function readHot() {
  const start = Date.now();
  const res = postGraphQL(Q_ITEMS_ALL, { phase: "hot" });
  const dur = Date.now() - start;
  tReadHot.add(dur);
  if (ok(res)) cHotOK.add(1);

  // pequena pausa (< TTL) para manter cache “quente”
  // ajustável via env se quiser: __ENV.SLEEP_HOT
  sleep(0.3);
}

// 3) Leitura fria (MISS): espera > TTL a cada iteração
export function readCold() {
  const start = Date.now();
  const res = postGraphQL(Q_ITEMS_ALL, { phase: "cold" });
  const dur = Date.now() - start;
  tReadCold.add(dur);
  if (ok(res)) cColdOK.add(1);

  // garante expiração do cache antes da próxima leitura
  sleep(COLD_PERIOD_SEC);
}

// 4) Escrita concorrente: cria itens no svc-a via gateway
export function writeMix() {
  const name = "item_" + Math.random().toString(36).slice(2, 8);
  const value = Math.floor(Math.random() * 100);
  const body = M_CREATE_A(name, value);

  const start = Date.now();
  const res = postGraphQL(body, { op: "createItemA" });
  const dur = Date.now() - start;
  tWrite.add(dur);
  if (ok(res)) cWriteOK.add(1);

  // pequena pausa para não “espiralar” a mesma VU:
  sleep(0.2);
}

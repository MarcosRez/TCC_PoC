import http from "k6/http";
import { sleep, check } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
import exec from "k6/execution";

/** =========================
 *  Config via ambiente
 *  ========================= */
const BASE_URL = __ENV.BASE_URL || "http://gateway:4000";
const URL = `${BASE_URL}/graphql`;
const REPORTS_DIR = __ENV.REPORTS_DIR || "/reports";

// carga (arrival-rate é mais real para sistemas baseados em throughput)
const INS_START = Number(__ENV.INS_START || 5);       // rps inicial de inserts
const INS_RATE  = Number(__ENV.INS_RATE  || 20);      // rps alvo de inserts
const RD_START  = Number(__ENV.RD_START  || 10);      // rps inicial de reads
const RD_RATE   = Number(__ENV.RD_RATE   || 50);      // rps alvo de reads
const RAMP      = __ENV.RAMP || "1m";
const HOLD      = __ENV.HOLD || "4m";

const N_SEED    = Number(__ENV.N_SEED || 25);         // itens semeados no setup
const READ_MODE = __ENV.READ_MODE || "byId";          // "byId" | "list"

// headers extras (ex.: Authorization)
const EXTRA_HEADERS = (() => {
  const h = {};
  if (__ENV.AUTH_TOKEN) h["Authorization"] = `Bearer ${__ENV.AUTH_TOKEN}`;
  return h;
})();

/** =========================
 *  GQL (queries/mutations)
 *  Você pode sobrescrever por ENV se seu schema for diferente
 *  ========================= */
const MUTATION_CREATE =
  __ENV.MUTATION_CREATE ||
  "mutation Create($name:String!,$value:Int!){ createItem(input:{name:$name,value:$value}){ id } }";

const QUERY_BY_ID =
  __ENV.QUERY_BY_ID ||
  "query Q($id:ID!){ item(id:$id){ id name value } }";

const QUERY_LIST =
  __ENV.QUERY_LIST ||
  "{ itemsAll { id name value } }";

/** =========================
 *  k6 options
 *  ========================= */
export const options = {
  scenarios: {
    writes: {
      executor: "ramping-arrival-rate",
      exec: "write",
      startRate: INS_START,
      timeUnit: "1s",
      preAllocatedVUs: Math.max(INS_RATE * 2, 50),
      maxVUs: Math.max(INS_RATE * 4, 100),
      stages: [
        { target: INS_RATE, duration: RAMP },
        { target: INS_RATE, duration: HOLD },
      ],
      tags: { scenario: "writes" },
    },
    reads: {
      executor: "ramping-arrival-rate",
      exec: "read",
      startRate: RD_START,
      timeUnit: "1s",
      preAllocatedVUs: Math.max(RD_RATE * 2, 50),
      maxVUs: Math.max(RD_RATE * 4, 100),
      stages: [
        { target: RD_RATE, duration: RAMP },
        { target: RD_RATE, duration: HOLD },
      ],
      tags: { scenario: "reads" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],                // <1% erros
    checks: ["rate>0.99"],                         // 99% checks ok
    "http_req_duration{scenario:writes}": ["p(95)<1000"],
    "http_req_duration{scenario:reads}":  ["p(95)<600"],
  },
};

/** =========================
 *  Utils
 *  ========================= */
function headers() {
  return Object.assign(base, EXTRA_HEADERS || {});
}
function gqlPayload(query, variables) {
  return JSON.stringify(variables ? { query, variables } : { query });
}
function rndName() {
  const n = Math.floor(Math.random() * 1e9).toString(36);
  return `item_${n}_${Date.now()}`;
}
function rndValue() {
  return Math.floor(Math.random() * 1000);
}

/** =========================
 *  Setup: semeia N itens e retorna os ids
 *  ========================= */
export function setup() {
  const ids = [];
  for (let i = 0; i < N_SEED; i++) {
    const variables = { name: rndName(), value: rndValue() };
    const res = http.post(URL, gqlPayload(MUTATION_CREATE, variables), {
      headers: headers(),
      tags: { endpoint: "createItem", phase: "setup" },
    });
    const ok = check(res, {
      "setup create 200": (r) => r.status === 200,
      "setup create id":  (r) => {
        try {
          const j = r.json();
          const id = j && j.data && j.data.createItem && j.data.createItem.id;
          if (id) ids.push(id);
          return !!id;
        } catch { return false; }
      },
    });
    if (!ok) {
      // registra no stdout, mas continua sem falhar o setup todo
      console.warn(`Seed falhou no i=${i}: status=${res.status} body=${res.body && res.body.slice(0, 200)}`);
    }
  }
  return { ids };
}

/** =========================
 *  Cenário de escrita (mutation)
 *  ========================= */
export function write(data) {
  const variables = { name: rndName(), value: rndValue() };
  const res = http.post(URL, gqlPayload(MUTATION_CREATE, variables), {
    headers: headers(),
    tags: { endpoint: "createItem" },
  });

  check(res, {
    "create 200": (r) => r.status === 200,
    "create id":  (r) => {
      try {
        return !!res.json().data.createItem.id;
      } catch { return false; }
    },
  });

  // opcional: valida o item recém-criado por ID (best-effort)
  try {
    const id = res.json().data.createItem.id;
    if (id) {
      const r2 = http.post(URL, gqlPayload(QUERY_BY_ID, { id }), {
        headers: headers(),
        tags: { endpoint: "itemById", followup: "true" },
      });
      check(r2, {
        "get by id 200": (r) => r.status === 200,
        "get by id has id": (r) => !!(r.json().data.item && r.json().data.item.id),
      });
    }
  } catch (_) { /* ignore */ }

  sleep(0.1);
}

/** =========================
 *  Cenário de leitura (query)
 *  ========================= */
export function read(data) {
  if (READ_MODE === "byId" && data && Array.isArray(data.ids) && data.ids.length > 0) {
    // escolhe um id semeado aleatoriamente
    const idx = Math.floor(Math.random() * data.ids.length);
    const id = data.ids[idx];
    const res = http.post(URL, gqlPayload(QUERY_BY_ID, { id }), {
      headers: headers(),
      tags: { endpoint: "itemById" },
    });
    check(res, {
      "byId 200": (r) => r.status === 200,
      "byId has id": (r) => !!(r.json().data.item && r.json().data.item.id),
    });
  } else {
    // fallback: lista
    const res = http.post(URL, gqlPayload(QUERY_LIST), {
      headers: headers(),
      tags: { endpoint: "itemsAll" },
    });
    check(res, {
      "list 200": (r) => r.status === 200,
      "list has array": (r) => {
        try {
          return Array.isArray(r.json().data.itemsAll);
        } catch { return false; }
      },
    });
  }

  sleep(0.05);
}

/** =========================
 *  Relatórios (JSON + HTML + stdout)
 *  ========================= */

// Pequeno gerador de HTML (sem deps)
function toHtml(data) {
  const m = (data && data.metrics) || {};
  const get = (obj, path, def = undefined) =>
    path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? def;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (v, digits = 1) => (typeof v === "number" && isFinite(v) ? v.toFixed(digits) : "N/D");

  const numReqs = get(m, "http_reqs.values.count", 0);
  const reqRate = get(m, "http_reqs.values.rate", 0);
  const avg = get(m, "http_req_duration.values.avg");
  const p95 = get(m, 'http_req_duration.values["p(95)"]');
  const p99 = get(m, 'http_req_duration.values["p(99)"]');
  const max = get(m, "http_req_duration.values.max");
  const min = get(m, "http_req_duration.values.min");
  const med = get(m, "http_req_duration.values.med");
  const checksPass = get(m, "checks.values.passes", 0);
  const checksFail = get(m, "checks.values.fails", 0);
  const checksRate = get(m, "checks.values.rate", 0);

  const durationValues = get(m, "http_req_duration.values", {});
  const dynamicPercentiles = Object.keys(durationValues)
    .filter((k) => /^p\(\d+\)$/.test(k))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
    .map((k) => `<tr><td>http_req_duration.${esc(k)}</td><td>${fmt(durationValues[k])} ms</td></tr>`)
    .join("");

  const startInfo = "não informado";
  const durationSec = get(data, "state.testRunDurationMs", 0) / 1000;

  // thresholds ok/nok
  const durThresholds = get(m, "http_req_duration.thresholds", {});
  const checksThresholds = get(m, "checks.thresholds", {});
  const thresholdBadges = [];
  for (const [name, obj] of Object.entries(durThresholds)) {
    thresholdBadges.push(`<span class="badge">${esc(name)}: ${obj.ok ? "OK ✅" : "NOK ❌"}</span>`);
  }
  for (const [name, obj] of Object.entries(checksThresholds)) {
    thresholdBadges.push(`<span class="badge">checks ${esc(name)}: ${obj.ok ? "OK ✅" : "NOK ❌"}</span>`);
  }

  return `<!doctype html>
<html lang="pt-br"><meta charset="utf-8"><title>Relatório k6</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;margin:24px}
h1{margin:0 0 8px} .muted{color:#666}
.card{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
table{border-collapse:collapse;width:100%} th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}
code,pre{background:#f6f8fa;border-radius:6px;padding:8px;display:block;white-space:pre-wrap}
.badge{display:inline-block;background:#eef;padding:4px 8px;border-radius:999px;margin-right:8px;margin-bottom:6px}
.kv{display:grid;grid-template-columns:200px 1fr;gap:8px 16px}
.kv div{padding:4px 0;border-bottom:1px dashed #eee}
</style>
<h1>Relatório k6</h1>
<div class="muted">Início: ${esc(startInfo)} • Duração: ${fmt(durationSec, 2)}s</div>

<div class="card">
  <div class="badge">Requisições: ${esc(numReqs)}</div>
  <div class="badge">Taxa: ${fmt(reqRate,1)}/s</div>
  <div class="badge">avg: ${fmt(avg)} ms</div>
  <div class="badge">med: ${fmt(med)} ms</div>
  <div class="badge">p95: ${fmt(p95)} ms</div>
  <div class="badge">p99: ${fmt(p99)} ms</div>
  <div class="badge">min: ${fmt(min)} ms</div>
  <div class="badge">max: ${fmt(max)} ms</div>
  <div class="badge">checks: ${esc(checksPass)} ✓ / ${esc(checksFail)} ✗ (rate: ${fmt(checksRate,2)})</div>
  ${thresholdBadges.join(" ")}
</div>

<div class="card">
  <h3>Métricas (resumo)</h3>
  <table>
    <thead><tr><th>Nome</th><th>Valor</th></tr></thead>
    <tbody>
      ${dynamicPercentiles}
    </tbody>
  </table>
</div>

<div class="card">
  <h3>JSON bruto</h3>
  <pre>${esc(JSON.stringify(data, null, 2))}</pre>
</div>
</html>`;
}

export function handleSummary(data) {
  return {
    [`${REPORTS_DIR}/summary.json`]: JSON.stringify(data, null, 2),
    [`${REPORTS_DIR}/summary.html`]: toHtml(data),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

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

// Presigned S3 URLs (opcional)
const S3_HTML_PUT_URL = __ENV.S3_HTML_PUT_URL || "";
const S3_JSON_PUT_URL = __ENV.S3_JSON_PUT_URL || "";

// Headers base (sem spread operator)
function headers() {
  const base = { "Content-Type": "application/json" };
  try {
    const extra = __ENV.EXTRA_HEADERS ? JSON.parse(__ENV.EXTRA_HEADERS) : {};
    return Object.assign({}, base, extra);
  } catch (_e) {
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
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{scenario:readsA}": ["p(95)<600"],
    "http_req_duration{scenario:readsB}": ["p(95)<600"],
    "http_req_duration{scenario:readsAll}": ["p(95)<600"],
    "http_req_duration{scenario:externalAll}": ["p(95)<800"],
    "http_req_duration{scenario:writesA}": ["p(95)<1000"],
    "http_req_duration{scenario:writesB}": ["p(95)<1000"],
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
  gqlDuration.readsA.add(Date.now() - t0);

  check(res, { "readsA status 200": (r) => r.status === 200 });
  const ok =
    body && !body.errors && body.data && Array.isArray(body.data.itemsA);
  check(body, { "readsA data ok": () => ok });
  sleep(0.1);
}

export function scenarioReadsB() {
  const q = `query { itemsB { id name value } }`;
  const t0 = Date.now();
  const { res, body } = gql(q);
  gqlDuration.readsB.add(Date.now() - t0);

  check(res, { "readsB status 200": (r) => r.status === 200 });
  const ok =
    body && !body.errors && body.data && Array.isArray(body.data.itemsB);
  check(body, { "readsB data ok": () => ok });
  sleep(0.1);
}

export function scenarioReadsAll() {
  const q = `query { itemsAll { id name value } }`;
  const t0 = Date.now();
  const { res, body } = gql(q);
  gqlDuration.readsAll.add(Date.now() - t0);

  check(res, { "readsAll status 200": (r) => r.status === 200 });
  const ok =
    body && !body.errors && body.data && Array.isArray(body.data.itemsAll);
  check(body, { "readsAll data ok": () => ok });
  sleep(0.1);
}

export function scenarioExternalAll() {
  const q = `query { externalAll { ok latency service } }`;
  const t0 = Date.now();
  const { res, body } = gql(q);
  gqlDuration.externalAll.add(Date.now() - t0);

  check(res, { "externalAll status 200": (r) => r.status === 200 });
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
  check(body, { "externalAll data ok": () => ok });
  sleep(0.1);
}

/**
 * ===============================
 * Cenários de WRITE (Boolean!)
 * ===============================
 */
export function scenarioWritesA() {
  const m = `mutation($input: NewItem!) { createItemA(input: $input) }`;
  const vars = { input: { name: randName(), value: randValue() } };
  const t0 = Date.now();
  const { res, body } = gql(m, vars);
  gqlDuration.writesA.add(Date.now() - t0);

  check(res, { "writesA status 200": (r) => r.status === 200 });
  const ok =
    body && !body.errors && body.data && body.data.createItemA === true;
  check(body, { "writesA create ok": () => ok });
  sleep(0.1);
}

export function scenarioWritesB() {
  const m = `mutation($input: NewItem!) { createItemB(input: $input) }`;
  const vars = { input: { name: randName(), value: randValue() } };
  const t0 = Date.now();
  const { res, body } = gql(m, vars);
  gqlDuration.writesB.add(Date.now() - t0);

  check(res, { "writesB status 200": (r) => r.status === 200 });
  const ok =
    body && !body.errors && body.data && body.data.createItemB === true;
  check(body, { "writesB create ok": () => ok });
  sleep(0.1);
}

/**
 * ===============================
 * Summary HTML + upload S3
 * ===============================
 */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

// HTML enxuto e legível
function toHtml(data) {
  const d = data.metrics || {};
  const numReqs =
    (d.http_reqs && d.http_reqs.values && d.http_reqs.values.count) || 0;
  const avg =
    (d.http_req_duration &&
      d.http_req_duration.values &&
      d.http_req_duration.values.avg) ||
    0;
  const p95 =
    (d.http_req_duration &&
      d.http_req_duration.values &&
      d.http_req_duration.values["p(95)"]) ||
    0;
  const p90 =
    (d.http_req_duration &&
      d.http_req_duration.values &&
      d.http_req_duration.values["p(90)"]) ||
    0;
  const failsRate =
    (d.http_req_failed &&
      d.http_req_failed.values &&
      d.http_req_failed.values.rate) ||
    0;
  const checksPass =
    (d.checks && d.checks.values && d.checks.values.passes) || 0;
  const checksFail =
    (d.checks && d.checks.values && d.checks.values.fails) || 0;

  return `<!doctype html>
<html lang="pt-br"><meta charset="utf-8">
<title>Resumo k6</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;margin:24px;line-height:1.4}
h1{margin:0 0 8px} .muted{color:#555} .ok{color:#15803d} .bad{color:#b91c1c}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}
.card{border:1px solid #e5e7eb;border-radius:12px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.kv{display:flex;justify-content:space-between}
pre{white-space:pre-wrap;background:#0b1020;color:#e2e8f0;padding:12px;border-radius:10px;overflow:auto}
small{color:#6b7280}
</style>
<h1>Resumo do teste k6</h1>
<p class="muted">Duração: ${esc(
    (data && data.state && (data.state.testRunDurationMs / 1000).toFixed(1)) ||
      "?"
  )}s · Reqs: ${esc(numReqs)}</p>

<div class="grid">
  <div class="card">
    <div class="kv"><b>Latência média</b><span>${esc(
      avg.toFixed ? avg.toFixed(2) : avg
    )} ms</span></div>
    <div class="kv"><b>P90</b><span>${esc(
      p90.toFixed ? p90.toFixed(2) : p90
    )} ms</span></div>
    <div class="kv"><b>P95</b><span>${esc(
      p95.toFixed ? p95.toFixed(2) : p95
    )} ms</span></div>
  </div>
  <div class="card">
    <div class="kv"><b>Falhas (taxa)</b><span class="${
      failsRate < 0.01 ? "ok" : "bad"
    }">${esc((failsRate * 100).toFixed(2))}%</span></div>
    <div class="kv"><b>Checks</b><span>${esc(checksPass)} ✅ · ${esc(
    checksFail
  )} ❌</span></div>
    <div class="kv"><b>VUs máx</b><span>${esc(
      (d.vus_max && d.vus_max.values && d.vus_max.values.value) || "?"
    )}</span></div>
  </div>
</div>

<h3>Métricas selecionadas</h3>
<pre>${esc(textSummary(data, { indent: "  ", enableColors: false }))}</pre>

<small>Gerado automaticamente pelo k6 (handleSummary).</small>
</html>`;
}

// upload via presigned PUT
function uploadToS3Presigned(url, body, contentType) {
  if (!url) return { ok: false, status: 0, error: "URL vazia" };
  const res = http.put(url, body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(
        typeof body === "string" ? body.length : body.byteLength || 0
      ),
    },
    timeout: "120s",
  });
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    error: res.status_text,
  };
}

// Chamado automaticamente ao final do teste
export function handleSummary(data) {
  const html = toHtml(data);
  const json = JSON.stringify(data, null, 2);

  // Uploads opcionais se URLs pré-assinadas forem fornecidas
  let htmlUpload = null,
    jsonUpload = null;
  if (S3_HTML_PUT_URL) {
    htmlUpload = uploadToS3Presigned(
      S3_HTML_PUT_URL,
      html,
      "text/html; charset=utf-8"
    );
    console.log(
      `[summary] upload HTML -> ${htmlUpload.status} ok=${htmlUpload.ok}`
    );
  }
  if (S3_JSON_PUT_URL) {
    jsonUpload = uploadToS3Presigned(S3_JSON_PUT_URL, json, "application/json");
    console.log(
      `[summary] upload JSON -> ${jsonUpload.status} ok=${jsonUpload.ok}`
    );
  }

  // Também salva localmente (útil para debug/artefatos do CI)
  return {
    "/reports/summary.html": html,
    "/reports/summary.json": json,
  };
}

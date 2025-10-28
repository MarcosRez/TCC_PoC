import http from "k6/http";
import { sleep, check } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

export const options = {
  vus: Number(__ENV.VUS || 100),
  duration: __ENV.DURATION || "2m",
  thresholds: {
    http_req_duration: ["p(95)<800"],
    checks: ["rate>0.99"],
  },
};

const URL = `${__ENV.BASE_URL || "http://gateway:4000"}/graphql`;
const q = JSON.stringify({ query: "{ itemsAll { id name value } }" });

export default function () {
  const res = http.post(URL, q, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(0.2);
}

// Pequeno gerador de HTML sem dependências externas
function toHtml(data) {
  const m = (data && data.metrics) || {};

  // utilitários seguros
  const get = (obj, path, def = undefined) =>
    path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) || def;

  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const fmt = (v, digits = 1) =>
    (typeof v === "number" && isFinite(v)) ? v.toFixed(digits) : "N/D";

  // campos principais (usando .values.*)
  const numReqs = get(m, "http_reqs.values.count", 0);
  const reqRate = get(m, "http_reqs.values.rate", 0);
  const avg = get(m, "http_req_duration.values.avg", undefined);
  const p95 = get(m, 'http_req_duration.values["p(95)"]', undefined);
  const p99 = get(m, 'http_req_duration.values["p(99)"]', undefined); // pode não existir no JSON
  const max = get(m, "http_req_duration.values.max", undefined);
  const min = get(m, "http_req_duration.values.min", undefined);
  const med = get(m, "http_req_duration.values.med", undefined);

  const checksPass = get(m, "checks.values.passes", 0);
  const checksFail = get(m, "checks.values.fails", 0);
  const checksRate = get(m, "checks.values.rate", 0);

  const vus = get(m, "vus.values.value", get(m, "vus.values.max", undefined));
  const vusMax = get(m, "vus_max.values.value", undefined);

  const waitAvg = get(m, "http_req_waiting.values.avg", undefined);
  const sendAvg = get(m, "http_req_sending.values.avg", undefined);
  const recvAvg = get(m, "http_req_receiving.values.avg", undefined);
  const blockedMax = get(m, "http_req_blocked.values.max", undefined);

  // thresholds (ex.: http_req_duration.thresholds["p(95)<800"].ok)
  const durThresholds = get(m, "http_req_duration.thresholds", {});
  const checksThresholds = get(m, "checks.thresholds", {});
  const thresholdBadges = [];
  for (const [name, obj] of Object.entries(durThresholds)) {
    thresholdBadges.push(`<span class="badge">${esc(name)}: ${obj.ok ? "OK ✅" : "NOK ❌"}</span>`);
  }
  for (const [name, obj] of Object.entries(checksThresholds)) {
    thresholdBadges.push(`<span class="badge">checks ${esc(name)}: ${obj.ok ? "OK ✅" : "NOK ❌"}</span>`);
  }

  // percentis disponíveis dinamicamente, caso queira listar todos
  const durationValues = get(m, "http_req_duration.values", {});
  const dynamicPercentiles = Object.keys(durationValues)
    .filter((k) => /^p\(\d+\)$/.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0], 10);
      const nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    })
    .map((k) => `<tr><td>http_req_duration.${esc(k)}</td><td>${fmt(durationValues[k])} ms</td></tr>`)
    .join("");

  const startInfo = "não informado";
  const durationSec = get(data, "state.testRunDurationMs", 0) / 1000;

  return `<!doctype html>
<html lang="pt-br"><meta charset="utf-8">
<title>Relatório k6</title>
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
  <div class="badge">VUs: ${esc(vus || "N/D")} ${vusMax ? "/ máx " + esc(vusMax) : ""}</div>
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
  <h3>Detalhes de latência</h3>
  <div class="kv">
    <div>http_req_waiting.avg</div><div>${fmt(waitAvg)} ms</div>
    <div>http_req_sending.avg</div><div>${fmt(sendAvg)} ms</div>
    <div>http_req_receiving.avg</div><div>${fmt(recvAvg)} ms</div>
    <div>http_req_blocked.max</div><div>${fmt(blockedMax)} ms</div>
  </div>
</div>

<div class="card">
  <h3>Métricas (resumo)</h3>
  <table>
    <thead><tr><th>Nome</th><th>Valor</th></tr></thead>
    <tbody>
      <tr><td>http_reqs.count</td><td>${esc(numReqs)}</td></tr>
      <tr><td>http_reqs.rate</td><td>${fmt(reqRate,1)} /s</td></tr>
      <tr><td>http_req_duration.avg</td><td>${fmt(avg)} ms</td></tr>
      <tr><td>http_req_duration.p(95)</td><td>${fmt(p95)} ms</td></tr>
      <tr><td>http_req_duration.p(99)</td><td>${fmt(p99)} ms</td></tr>
      <tr><td>checks.passes</td><td>${esc(checksPass)}</td></tr>
      <tr><td>checks.fails</td><td>${esc(checksFail)}</td></tr>
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
    "/reports/summary.json": JSON.stringify(data, null, 2),
    "/reports/summary.html": toHtml(data),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}

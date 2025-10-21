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
const q = JSON.stringify({ query: "{ items { id name value } }" });

export default function () {
  const res = http.post(URL, q, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(0.2);
}

// Pequeno gerador de HTML sem dependências externas
function toHtml(data) {
  const d = data.metrics || {};
  const numReqs = (d.http_reqs && d.http_reqs.count) || 0;
  const avg = (d.http_req_duration && d.http_req_duration.avg) || 0;
  const p95 = (d.http_req_duration && d.http_req_duration["p(95)"]) || 0;
  const p99 = (d.http_req_duration && d.http_req_duration["p(99)"]) || 0;
  const checks = (d.checks && d.checks.passes) || 0;
  const fails = (d.checks && d.checks.fails) || 0;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  return `<!doctype html>
<html lang="pt-br"><meta charset="utf-8">
<title>Relatório k6</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;margin:24px}
h1{margin:0 0 8px} .muted{color:#666}
.card{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
table{border-collapse:collapse;width:100%} th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}
code,pre{background:#f6f8fa;border-radius:6px;padding:8px;display:block;white-space:pre-wrap}
.badge{display:inline-block;background:#eef;padding:4px 8px;border-radius:999px;margin-right:8px}
</style>
<h1>Relatório k6</h1>
<div class="muted">Início: ${esc(data.start)} • Duração: ${esc(
    data.state.testRunDurationMs / 1000
  )}s</div>

<div class="card">
  <div class="badge">Requisições: ${numReqs}</div>
  <div class="badge">p95: ${p95.toFixed ? p95.toFixed(1) : p95} ms</div>
  <div class="badge">p99: ${p99.toFixed ? p99.toFixed(1) : p99} ms</div>
  <div class="badge">avg: ${avg.toFixed ? avg.toFixed(1) : avg} ms</div>
  <div class="badge">checks: ${checks} ✓ / ${fails} ✗</div>
</div>

<div class="card">
  <h3>Métricas (resumo)</h3>
  <table>
    <thead><tr><th>Nome</th><th>Valor</th></tr></thead>
    <tbody>
      <tr><td>http_reqs</td><td>${numReqs}</td></tr>
      <tr><td>http_req_duration.avg</td><td>${avg}</td></tr>
      <tr><td>http_req_duration.p95</td><td>${p95}</td></tr>
      <tr><td>http_req_duration.p99</td><td>${p99}</td></tr>
      <tr><td>checks.passes</td><td>${checks}</td></tr>
      <tr><td>checks.fails</td><td>${fails}</td></tr>
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

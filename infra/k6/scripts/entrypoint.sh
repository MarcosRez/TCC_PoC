#!/bin/sh
# shellcheck shell=sh
set -eu

# --- Config ---
: "${S3_BUCKET:=}"              # vazio = não sobe pro S3
: "${S3_PREFIX:=k6-reports}"

mkdir -p /reports

echo "[entrypoint] Iniciando k6..."
# Mesmo que o teste falhe, seguimos para fazer upload/relatório
if ! k6 run /scripts/script.js; then
  echo "[entrypoint] k6 terminou com erro (seguindo para pós-processamento)"
fi
K6_EXIT=$?

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [ -n "$S3_BUCKET" ]; then
  S3_PATH="s3://${S3_BUCKET}/${S3_PREFIX}/${TIMESTAMP}"
  echo "[entrypoint] Enviando relatórios para ${S3_PATH} ..."
  # Não falhar se aws cli não estiver disponível
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp /reports/summary.html "${S3_PATH}/summary.html" || true
    aws s3 cp /reports/summary.json "${S3_PATH}/summary.json" || true

    # Links presignados (24h) se possível
    HTML_URL="$(aws s3 presign "${S3_PATH}/summary.html" --expires-in 86400 2>/dev/null || true)"
    JSON_URL="$(aws s3 presign "${S3_PATH}/summary.json" --expires-in 86400 2>/dev/null || true)"
    [ -n "$HTML_URL" ] && echo "Link HTML (24h): $HTML_URL"
    [ -n "$JSON_URL" ] && echo "Link JSON (24h): $JSON_URL"
  else
    echo "[entrypoint] aws cli não encontrado no container; pulei upload para S3."
  fi
else
  echo "[entrypoint] S3_BUCKET não definido — relatórios ficaram em /reports."
fi

exit "$K6_EXIT"

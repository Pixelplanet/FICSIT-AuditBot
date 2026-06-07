#!/bin/sh
set -eu

DATA_ROOT="${DATA_DIR:-/data}"
DOCS_DIR="${DATA_ROOT}/docs"
BUNDLED_DOCS="/opt/ficsit-docs/en-US.json"

mkdir -p "${DATA_ROOT}/state" "${DOCS_DIR}"

# Seed /data/docs once so first-run containers have usable names/unlocks.
if [ -f "${BUNDLED_DOCS}" ]; then
  if ! ls "${DOCS_DIR}"/*.json >/dev/null 2>&1; then
    cp "${BUNDLED_DOCS}" "${DOCS_DIR}/en-US.json"
    echo "[startup] Seeded ${DOCS_DIR}/en-US.json from bundled docs snapshot."
  fi
fi

exec "$@"

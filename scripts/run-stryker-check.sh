#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p artifacts/dynamic-analysis/stryker
cp install/package.json package.json

if [ ! -d node_modules ] || ! npm ls @stryker-mutator/core >/dev/null 2>&1; then
	npm install --no-audit --no-fund
fi

if [ "${1:-}" = "--smoke" ]; then
	npm run dynamic:stryker:test
else
	npm run dynamic:stryker 2>&1 | perl -pe 's/\e\[[0-9;]*m//g' | tee artifacts/dynamic-analysis/stryker/ci-terminal-output.txt
fi

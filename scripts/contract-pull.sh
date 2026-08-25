#!/usr/bin/env bash
# Refresh contract/ from a core checkout: runs the core's opt-in export test against the test
# database, then regenerates src/contract. Usage: scripts/contract-pull.sh /path/to/oblodai-backend
set -euo pipefail
CORE="${1:?path to the backend checkout}"
SDK="$(cd "$(dirname "$0")/.." && pwd)"
DSN="${GATEWAY_TEST_PG_DSN:-postgres://gateway:gateway@127.0.0.1:5432/gateway?sslmode=disable}"
rm -rf "$SDK/contract/fixtures" "$SDK/contract/errors"
( cd "$CORE/services/core" && \
  NETGUARD_ALLOW_PRIVATE=1 SDK_CONTRACT_OUT="$SDK/contract" SDK_CONTRACT_COMMIT="$(git rev-parse HEAD)" GATEWAY_TEST_PG_DSN="$DSN" \
  go test ./internal/app/ -run TestSDKContract_Export -count=1 )
( cd "$SDK" && npm run codegen && npm test )

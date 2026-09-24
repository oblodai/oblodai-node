# Every gate CI runs. The backend checkout (drift check, conformance suite) is $(OBLODAI_BACKEND),
# else ../oblodai-backend; without one those two gates are skipped loudly.
.PHONY: ci install fmt lint typecheck drift test conformance build package live

ci: install ## every gate, fastest failure first
	npm run fmt:check
	node scripts/check-generated.mjs
	npm run typecheck
	npm test
	npm run build
	npm run check-package
	@echo "all gates green"

install: node_modules/.package-lock.json

node_modules/.package-lock.json: package-lock.json
	npm ci --no-audit --no-fund

fmt:
	npm run fmt

lint:
	npm run fmt:check

typecheck: install
	npm run typecheck

drift: ## fail when src/generated is stale (needs the backend)
	node scripts/check-generated.mjs --require

test: install
	npm test

conformance: install
	npx vitest run test/conformance

build: install
	npm run build

package: build
	npm run check-package

live: install ## the live tier (needs OBLODAI_LIVE_URL)
	npm run test:live

# Releasing

This package (`@oblodai/sdk`) is published to **npm** by CI when a `v*` tag is pushed.

## Setup (one-time)
**Repo secret:** `NPM_TOKEN` — npm *automation* token with publish rights for the `@oblodai` scope.

## Cut a release
1. Bump `version` in `package.json`.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The **Release** workflow builds and runs `npm publish --access public`.

CI (build + tests) runs on every push and pull request via `.github/workflows/ci.yml`.

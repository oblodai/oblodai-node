# Releasing

This package (`@oblodai-npm/sdk`) is published to **npm** by CI when a `v*` tag is pushed.

**The version bump is scripted for the whole SDK family.** From the backend checkout,
`tools/sdkgen/release.sh X.Y.Z` raises the version in all eight SDKs (manifest, version constant,
lock files, the install lines of the READMEs), closes the `## [X.Y.Z] — Unreleased` (or
`## [Unreleased]`) section of every `CHANGELOG.md` with today's date, commits and tags `vX.Y.Z`
locally; `-n` only checks. Pushing the tag — the step that publishes — stays manual.

## Setup (one-time)

**Repo secret:** `NPM_TOKEN` — npm _automation_ token with publish rights for the `@oblodai` scope.

## Cut a release

1. Bump `version` in `package.json` and `src/version.ts` (a test holds them equal) and add a
   `CHANGELOG.md` entry.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The **Release** workflow builds and runs `npm publish --access public`.

CI (build + tests) runs on every push and pull request via `.github/workflows/ci.yml`.

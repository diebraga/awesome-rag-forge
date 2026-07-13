# Public site split: two deployables

## Context

The full app (`app/`, `mcp/`, everything) is local-only by design and stays that way. Today's env-based gating (`ENABLE_TESTING_SURFACE`, `isPublicDeploymentRuntime()`) disables routes *functionally* in production but still compiles and ships their code — a weaker guarantee than "the code doesn't exist in that deployment." The fix is not smarter gating; it's not building the public thing out of the same app at all.

## Decision

Two genuinely separate deployables:

1. **The existing app** — unchanged. Never deployed. Local-only, run via `npm run dev`.
2. **`public-site/index.html`** (new) — the *only* thing ever meant to be deployed publicly. A single static HTML file, no framework, no build step, no server code: loads `marked.js` from a CDN, fetches `https://raw.githubusercontent.com/<owner>/<repo>/main/README.md` client-side (raw.githubusercontent.com sends permissive CORS headers, so no proxy/server needed), renders it. Editing `README.md` and pushing to GitHub updates the live page with no redeploy — the page has no build artifact to go stale.

Because there is no framework and no route table, there is structurally nothing else this deployable could leak — it cannot ship a route, an API handler, or a database credential it doesn't have. That is a stronger guarantee than env-gating the full app, achieved by having less, not by checking harder.

Deployable to GitHub Pages directly from the repo (zero extra infra) or any static host — building the file is in scope here; actually deploying/provisioning hosting is a separate, explicit-request action per this project's standing rule and is not done as part of this task.

## Dead-code pass on the existing app

Ponytail-style cleanup, scoped narrowly: delete genuinely unused code (dead files, unused exports, leftover experiment artifacts). Explicitly **not in scope**: any env-gating/`isPublicDeploymentRuntime()`/auth code. That code is active defense-in-depth for the (still possible, even if discouraged) case where someone deploys the full app anyway — it is not dead, and removing it would be a regression, not cleanup. Verify with `tsc`/`lint`/`test`/`build` after each deletion batch; nothing that breaks the app ships.

## Out of scope

- Actually deploying either the app or `public-site/` anywhere.
- Rewriting `docs/deployment.md`'s existing content beyond noting the new split (follow-up, not blocking).

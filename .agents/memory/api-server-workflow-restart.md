---
name: API server sub-workflow needs its own restart
description: Rebuilding artifacts/api-server dist and restarting "Start application" does NOT reload the separately-running "artifacts/api-server: API Server" workflow process.
---

The "artifacts/api-server: API Server" workflow (`pnpm --filter @workspace/api-server run dev`) is an independent long-running process from "Start application". Running `pnpm --filter @workspace/api-server run build` manually only overwrites `dist/index.mjs` on disk — the already-running node process (started by that sub-workflow) keeps serving the old bundle in memory, so new/changed routes 404 until that specific workflow is restarted.

**Why:** Each configured workflow is its own persistent process tree; restarting one workflow (e.g. "Start application") does not cascade to restart sibling workflows like the API Server dev workflow.

**How to apply:** After adding/changing backend routes in `artifacts/api-server`, always call `restart_workflow` on `artifacts/api-server: API Server` specifically (not just "Start application") and verify with a curl against the changed route before assuming it's live.

---
name: Mobile static build port conflicts
description: mobile-build (Metro) fails with EADDRINUSE / non-interactive prompt if other workflows already hold ports 8081-8083
---

The Expo static-build background process (triggered by serve.js when static-build/ is missing) starts Metro on port 8081, falling back to 8082/8083 if busy. If duplicate/stale `mockup-sandbox` (vite) processes are left running from prior workflow restarts, they can occupy 8081 AND 8082, leaving Metro no port and causing it to fail with "Input is required, but 'npx expo' is in non-interactive mode" (it can't prompt to use yet another port).

**Why:** Restarting the "Start application" workflow multiple times in a session can leave orphaned `node .../vite.js dev` (mockup-sandbox) processes behind that keep holding ports across restarts, since they aren't tied 1:1 to the workflow's own process tree.

**How to apply:** If a forced mobile rebuild (after deleting `static-build/`) fails with a Metro port error, check `ps aux | grep -iE "vite|metro|expo"` for duplicate/orphaned processes bound to 8081-8083, `kill -9` them, then restart the workflow again.

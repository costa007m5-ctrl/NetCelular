import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Returns server public IP and proxy domain info.
// Used by admin panel to show which IP to whitelist in CDN configurations.
let _cachedIp: string | null = null;
let _cachedAt = 0;
const IP_CACHE_MS = 60 * 1000; // refresh every 60s

router.get("/server-info", async (_req, res) => {
  try {
    const now = Date.now();
    if (!_cachedIp || now - _cachedAt > IP_CACHE_MS) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      try {
        const r = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
        clearTimeout(tid);
        const data = await r.json() as { ip: string };
        _cachedIp = data.ip ?? null;
        _cachedAt = now;
      } catch {
        clearTimeout(tid);
      }
    }
    res.json({
      ip: _cachedIp ?? "unavailable",
      proxyDomain: process.env["REPLIT_DEV_DOMAIN"] ?? process.env["EXPO_PUBLIC_DOMAIN"] ?? "unknown",
      nodeEnv: process.env["NODE_ENV"] ?? "production",
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to get server info" });
  }
});

export default router;

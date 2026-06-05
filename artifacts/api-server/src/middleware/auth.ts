import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

const ADMIN_API_KEY = process.env["ADMIN_API_KEY"];

export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_API_KEY) {
    logger.warn("ADMIN_API_KEY not set — admin routes are disabled");
    res.status(503).json({ error: "Admin authentication not configured" });
    return;
  }

  const header = req.headers["x-admin-key"] as string | undefined;
  const query = req.query["admin_key"] as string | undefined;
  const provided = header ?? query;

  if (!provided) {
    res.status(401).json({ error: "Missing admin key" });
    return;
  }

  if (provided !== ADMIN_API_KEY) {
    logger.warn({ ip: req.ip }, "Unauthorized admin attempt");
    res.status(403).json({ error: "Invalid admin key" });
    return;
  }

  next();
}

export function rateLimitByIp(
  maxRequests: number,
  windowMs: number
): (req: Request, res: Response, next: NextFunction) => void {
  const store = new Map<string, { count: number; reset: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.reset) {
      store.set(ip, { count: 1, reset: now + windowMs });
      next();
      return;
    }

    entry.count++;

    if (entry.count > maxRequests) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}

export function corsHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
}

export function cacheControl(maxAge: number) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
    next();
  };
}

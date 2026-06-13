import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/admin/check-link", async (req, res) => {
  const url = req.query["url"] as string | undefined;
  if (!url || !url.startsWith("http")) {
    res.status(400).json({ error: "Invalid or missing url param" });
    return;
  }
  const t = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    const response = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      },
    });
    clearTimeout(tid);
    res.json({
      status: response.status,
      contentType: response.headers.get("content-type"),
      location: response.headers.get("location"),
      contentLength: response.headers.get("content-length"),
      ok: response.ok || response.status === 301 || response.status === 302,
      latency: Date.now() - t,
      url,
    });
  } catch (e: any) {
    const latency = Date.now() - t;
    res.json({
      status: null,
      contentType: null,
      location: null,
      contentLength: null,
      ok: false,
      latency,
      error: e?.message ?? "fetch failed",
      url,
    });
  }
});

export default router;

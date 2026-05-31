import { Router } from "express";
import { getCatalog, isAvailable, getIdsByType, type ContentType } from "../lib/redeflix-cache";

const router = Router();

router.get("/catalog", (_req, res) => {
  res.json(getCatalog());
});

router.get("/check", (req: any, res: any) => {
  const id = Number(req.query.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  res.json({ id, available: isAvailable(id) });
});

router.get("/ids/:type", (req: any, res: any) => {
  const type = req.params.type as ContentType;
  if (!["movie", "tv", "anime", "dorama"].includes(type)) {
    res.status(400).json({ error: "invalid type" }); return;
  }
  res.json(getIdsByType(type));
});

export default router;

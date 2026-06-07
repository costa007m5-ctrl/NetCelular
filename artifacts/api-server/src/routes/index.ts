import { Router, type IRouter } from "express";
import healthRouter from "./health";
import driveRouter from "./drive";
import r2Router from "./r2";
import pushRouter from "./push";
import streamRouter from "./stream";
import liveTvRouter from "./live-tv";
import castRouter from "./cast";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/drive", driveRouter);
router.use("/r2", r2Router);
router.use("/push", pushRouter);
router.use("/stream", streamRouter);
router.use("/live", liveTvRouter);
router.use(castRouter);

export default router;

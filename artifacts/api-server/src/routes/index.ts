import { Router, type IRouter } from "express";
import healthRouter from "./health";
import driveRouter from "./drive";
import r2Router from "./r2";
import pushRouter from "./push";
import streamRouter from "./stream";
import liveTvRouter from "./live-tv";
import castRouter from "./cast";
import appLogsRouter from "./app-logs";
import adminRouter from "./admin";
import tmdbRouter from "./tmdb";
import teraboxRouter from "./terabox";
import shortsRouter from "./shorts";
import tvmazeRouter from "./tvmaze";
import geminiRouter from "./gemini";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/drive", driveRouter);
router.use("/r2", r2Router);
router.use("/tmdb", tmdbRouter);
router.use("/terabox", teraboxRouter);
router.use("/push", pushRouter);
router.use("/stream", streamRouter);
router.use("/live", liveTvRouter);
router.use(castRouter);
router.use(appLogsRouter);
router.use(adminRouter);
router.use(shortsRouter);
router.use(tvmazeRouter);
router.use(geminiRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import liveTvRouter from "./live-tv";
import redeflixRouter from "./redeflix";
import driveRouter from "./drive";
import gstreamRouter from "./gstream";
import r2Router from "./r2";
import pushRouter from "./push";
import d1ContentRouter from "./d1-content";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tmdb", tmdbRouter);
router.use("/live", liveTvRouter);
router.use("/redeflix", redeflixRouter);
router.use("/drive", driveRouter);
router.use("/gstream", gstreamRouter);
router.use("/r2", r2Router);
router.use("/push", pushRouter);
router.use("/content", d1ContentRouter);

export default router;

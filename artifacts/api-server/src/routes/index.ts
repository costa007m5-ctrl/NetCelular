import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import liveTvRouter from "./live-tv";
import redeflixRouter from "./redeflix";
import driveRouter from "./drive";
import gstreamRouter from "./gstream";
import r2Router from "./r2";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tmdb", tmdbRouter);
router.use("/live", liveTvRouter);
router.use("/redeflix", redeflixRouter);
router.use("/drive", driveRouter);
router.use("/gstream", gstreamRouter);
router.use("/r2", r2Router);

export default router;

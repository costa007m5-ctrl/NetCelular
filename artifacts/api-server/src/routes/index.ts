import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import liveTvRouter from "./live-tv";
import redeflixRouter from "./redeflix";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tmdb", tmdbRouter);
router.use("/live", liveTvRouter);
router.use("/redeflix", redeflixRouter);

export default router;

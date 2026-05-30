import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import liveTvRouter from "./live-tv";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tmdb", tmdbRouter);
router.use("/live", liveTvRouter);

export default router;

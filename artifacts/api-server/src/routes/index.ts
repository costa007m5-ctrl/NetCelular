import { Router, type IRouter } from "express";
import healthRouter from "./health";
import driveRouter from "./drive";
import r2Router from "./r2";
import pushRouter from "./push";
import streamRouter from "./stream";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/drive", driveRouter);
router.use("/r2", r2Router);
router.use("/push", pushRouter);
router.use("/stream", streamRouter);

export default router;

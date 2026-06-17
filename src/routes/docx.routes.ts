import { Router } from "express";
import type { LessonPlan } from "../types.js";
import { buildFilename, renderLessonPlansDocx } from "../services/lesson-plan.service.js";

const router = Router();

router.post("/export", async (req, res, next) => {
  try {
    const plans = Array.isArray(req.body?.plans) ? (req.body.plans as LessonPlan[]) : [];
    if (!plans.length) {
      const error = new Error("Chưa có kế hoạch bài dạy để xuất file.") as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    console.log("[docx/export] request", {
      plans: plans.length,
      className: plans[0]?.className ?? ""
    });

    const buffer = renderLessonPlansDocx(plans);
    const sortedWeeks = [...plans].sort((a, b) => a.weekNumber - b.weekNumber);
    const filename = buildFilename(plans[0]?.className || "lop", sortedWeeks[sortedWeeks.length - 1]?.weekNumber || plans.length);

    console.log("[docx/export] success", {
      plans: plans.length,
      filename,
      bytes: buffer.length
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error("[docx/export] failed", error);
    next(error);
  }
});

export default router;

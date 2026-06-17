import { Router } from "express";
import {
  buildFilename,
  generateLessonPlansFromAi,
  renderLessonPlansDocx,
  type GenerateDocxInput,
  validateGenerateDocxInput
} from "../services/lesson-plan.service.js";

const router = Router();

router.post("/generate-docx", async (req, res, next) => {
  try {
    const input = req.body as GenerateDocxInput;
    validateGenerateDocxInput(input);

    console.log("[generate-docx] request", {
      className: input.className,
      grade: input.grade,
      subject: input.subject,
      numberOfWeeks: input.numberOfWeeks,
      periodsPerWeek: input.periodsPerWeek,
      teacherRequestLength: String(input.teacherRequest ?? "").trim().length,
      teacherRequestPreview: String(input.teacherRequest ?? "").trim().slice(0, 1000)
    });

    const plans = await generateLessonPlansFromAi(input);
    const buffer = renderLessonPlansDocx(plans);
    const filename = buildFilename(input.className, input.numberOfWeeks);

    console.log("[generate-docx] success", {
      plans: plans.length,
      filename,
      bytes: buffer.length
    });

    res.json({
      plans,
      filename,
      docxBase64: buffer.toString("base64")
    });
  } catch (error) {
    console.error("[generate-docx] failed", error);
    next(error);
  }
});

export default router;

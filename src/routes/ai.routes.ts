import { Router } from "express";
import { completeJson, completeText } from "../services/openrouter.service.js";
import type { BasicInfo, GenerationOptions, LessonActivity, LessonPlan, RefineAction, WeekOutline } from "../types.js";
import { addDaysToIsoDate } from "../utils/dates.js";
import { dottedLines, toStringArray } from "../utils/text.js";

const router = Router();

interface RawLessonActivity {
  time?: unknown;
  name?: unknown;
  objective?: unknown;
  objectives?: unknown;
  procedure?: unknown;
  teacherActions?: unknown;
  studentActions?: unknown;
}

const LESSON_SYSTEM_PROMPT = `Bạn là giáo viên tiểu học nhiều kinh nghiệm, quen viết kế hoạch bài dạy để đồng nghiệp có thể in ra và dạy ngay.
Bạn hiểu định hướng GDPT 2018 và cấu trúc kế hoạch bài dạy theo Công văn 2345/BGDĐT.
Hãy viết bằng tiếng Việt tự nhiên, giống giáo án giáo viên tự soạn: rõ việc, gọn câu, tránh văn phong máy móc.
Chỉ trả về JSON hợp lệ. Không markdown. Không giải thích ngoài JSON.

Quy tắc nội dung:
- Mỗi tuần là một kế hoạch bài dạy dùng cho số tiết trong tuần.
- Phần I gồm: Năng lực đặc thù, Năng lực chung, Phẩm chất.
- Phần II gồm: Giáo viên, Học sinh.
- Phần III luôn có đúng 4 hoạt động:
  1. KHỞI ĐỘNG
  2. HÌNH THÀNH KIẾN THỨC MỚI
  3. LUYỆN TẬP - THỰC HÀNH
  4. VẬN DỤNG, TRẢI NGHIỆM
- Mỗi hoạt động có: time, name, objectives, procedure, studentActions.
- objectives là mảng ý ngắn, cụ thể.
- procedure là mảng các bước tiến hành phía giáo viên theo trình tự lên lớp.
- studentActions là mảng việc làm hoặc phản hồi tương ứng của học sinh.
- Tránh câu chung chung, tránh lặp cùng một cấu trúc ở mọi dòng.
- Với lớp 1, dùng câu ngắn, thao tác rõ, thực tế và dễ triển khai ngay.`;

function getActionInstruction(action: RefineAction): string {
  switch (action) {
    case "clarify":
      return "Làm rõ ý, bổ sung chi tiết cần thiết nhưng không đổi ý định chính của giáo viên.";
    case "shorten":
      return "Rút gọn còn phần cốt lõi để AI vẫn hiểu và soạn bài đúng.";
    case "professionalize":
      return "Viết lại gọn gàng, tự nhiên, đúng văn phong giáo viên tiểu học.";
    case "expand":
      return "Mở rộng vừa đủ để AI hiểu rõ yêu cầu, ưu tiên chi tiết có thể dùng ngay khi dạy.";
    case "improve":
    default:
      return "Chỉnh lại câu chữ cho mạch lạc, tự nhiên và hữu ích hơn cho việc soạn kế hoạch bài dạy.";
  }
}

function validateText(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) {
    const error = new Error("Vui lòng nhập yêu cầu soạn bài.") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/^\s*[-•–—*]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTextArray(value: unknown): string[] {
  return toStringArray(value).map(cleanText).filter(Boolean);
}

function normalizeWeekOutlines(rawWeeks: unknown, input: BasicInfo): WeekOutline[] {
  const source = Array.isArray(rawWeeks) ? rawWeeks : [];
  const expectedCount = Math.max(1, Number(input.numberOfWeeks || 1));

  return Array.from({ length: expectedCount }, (_, index) => {
    const raw = (source[index] ?? {}) as Partial<WeekOutline>;
    const weekNumber = Number(raw.weekNumber) || Number(input.startWeek) + index;
    const defaultTeachDate = input.autoIncreaseTeachDate
      ? addDaysToIsoDate(input.firstTeachDate, index * 7)
      : input.firstTeachDate;

    return {
      weekNumber,
      lessonTitle: String(raw.lessonTitle ?? `Bài học tuần ${weekNumber}`).trim(),
      mainContent: String(raw.mainContent ?? "").trim(),
      teachDate: String(raw.teachDate ?? defaultTeachDate ?? "").trim(),
      notes: String(raw.notes ?? "").trim()
    };
  });
}

function normalizeLessonActivity(raw: RawLessonActivity, index: number): LessonActivity {
  const defaultNames = [
    "KHỞI ĐỘNG",
    "HÌNH THÀNH KIẾN THỨC MỚI",
    "LUYỆN TẬP - THỰC HÀNH",
    "VẬN DỤNG, TRẢI NGHIỆM"
  ];
  const objectives = cleanTextArray(raw.objectives);
  const objectiveFallback = cleanText(raw.objective);
  const procedure = [...cleanTextArray(raw.procedure), ...cleanTextArray(raw.teacherActions)];

  if (!objectives.length && objectiveFallback) {
    objectives.push(objectiveFallback);
  }

  return {
    time: String(raw.time ?? "").trim() || (index === 0 ? "5 phút" : index === 3 ? "5 phút" : "25 phút"),
    name: String(raw.name ?? defaultNames[index] ?? `Hoạt động ${index + 1}`).trim(),
    objectives: objectives.length ? objectives : ["Giúp học sinh thực hiện đúng yêu cầu trọng tâm của hoạt động."],
    procedure: procedure.length
      ? procedure
      : ["Giáo viên nêu nhiệm vụ, làm mẫu ngắn gọn và hướng dẫn học sinh thực hiện từng bước."],
    studentActions: cleanTextArray(raw.studentActions).length
      ? cleanTextArray(raw.studentActions)
      : ["Học sinh lắng nghe, thực hiện nhiệm vụ và nêu kết quả."]
  };
}

function normalizeLessonPlans(rawPlans: unknown, basicInfo: BasicInfo, weeks: WeekOutline[]): LessonPlan[] {
  const source = Array.isArray(rawPlans) ? rawPlans : [];

  return source.map((rawValue, index) => {
    const raw = rawValue as Partial<LessonPlan> & { activities?: RawLessonActivity[] };
    const matchingWeek = weeks.find((week) => Number(week.weekNumber) === Number(raw.weekNumber)) ?? weeks[index];
    const activities = Array.isArray(raw.activities) ? raw.activities : [];

    return {
      weekNumber: Number(raw.weekNumber) || matchingWeek?.weekNumber || Number(basicInfo.startWeek) + index,
      lessonTitle: String(raw.lessonTitle ?? matchingWeek?.lessonTitle ?? "").trim(),
      className: String(raw.className ?? basicInfo.className ?? "").trim(),
      grade: String(raw.grade ?? basicInfo.grade ?? "").trim(),
      subject: String(raw.subject ?? basicInfo.subject ?? "").trim(),
      bookSeries: String(raw.bookSeries ?? basicInfo.bookSeries ?? "").trim(),
      periods: Number(raw.periods) || Number(basicInfo.periodsPerWeek) || 1,
      prepareDate: String(raw.prepareDate ?? basicInfo.prepareDate ?? "").trim(),
      teachDate: String(raw.teachDate ?? matchingWeek?.teachDate ?? basicInfo.firstTeachDate ?? "").trim(),
      objectives: {
        specificCompetencies: toStringArray(raw.objectives?.specificCompetencies),
        generalCompetencies: toStringArray(raw.objectives?.generalCompetencies),
        qualities: toStringArray(raw.objectives?.qualities)
      },
      teachingMaterials: {
        teacher: toStringArray(raw.teachingMaterials?.teacher),
        students: toStringArray(raw.teachingMaterials?.students)
      },
      activities: Array.from({ length: 4 }, (_, activityIndex) =>
        normalizeLessonActivity(activities[activityIndex] ?? {}, activityIndex)
      ),
      afterLessonAdjustment: String(raw.afterLessonAdjustment ?? dottedLines()).trim() || dottedLines()
    };
  });
}

function summarizeBasicInfo(input: BasicInfo) {
  return {
    className: input.className,
    grade: input.grade,
    subject: input.subject,
    startWeek: input.startWeek,
    numberOfWeeks: input.numberOfWeeks,
    periodsPerWeek: input.periodsPerWeek,
    teacherRequestLength: String(input.teacherRequest ?? "").trim().length
  };
}

router.post("/refine-text", async (req, res, next) => {
  try {
    const text = validateText(req.body?.text);
    const action = String(req.body?.action ?? "improve") as RefineAction;
    const context = req.body?.context ?? {};

    console.log("[ai/refine-text] request", {
      action,
      textLength: text.length,
      grade: context.grade ?? "",
      subject: context.subject ?? ""
    });

    const result = await completeText(
      [
        {
          role: "system",
          content:
            "Bạn là trợ lý tiếng Việt cho giáo viên tiểu học. Viết lại ngắn gọn, tự nhiên, dễ hiểu, ít mùi AI. Trả về văn bản thuần, không markdown."
        },
        {
          role: "user",
          content: `${getActionInstruction(action)}

Bối cảnh:
- Khối/lớp: ${context.grade ?? ""}
- Môn/chủ đề: ${context.subject ?? ""}
- Bộ sách: ${context.bookSeries ?? ""}

Văn bản cần chỉnh:
${text}

Yêu cầu thêm:
- Giữ đúng ý chính của giáo viên.
- Ưu tiên cách diễn đạt ngắn, rõ, tự nhiên.
- Không biến thành một prompt quá dài.

Chỉ trả về văn bản sau khi chỉnh.`
        }
      ],
      { temperature: 0.45, maxTokens: 1200 }
    );

    console.log("[ai/refine-text] success", { outputLength: result.trim().length });
    res.json({ text: result.trim() });
  } catch (error) {
    console.error("[ai/refine-text] failed", error);
    next(error);
  }
});

router.post("/generate-week-outline", async (req, res, next) => {
  try {
    const input = req.body as BasicInfo;
    validateText(input.teacherRequest);

    if (!input.className?.trim()) {
      const error = new Error("Vui lòng nhập lớp.") as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    console.log("[ai/generate-week-outline] request", summarizeBasicInfo(input));

    const data = await completeJson<{ weeks: WeekOutline[] }>(
      [
        {
          role: "system",
          content: LESSON_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `Tạo dàn ý theo tuần cho kế hoạch bài dạy.

Thông tin:
${JSON.stringify(
  {
    grade: input.grade,
    className: input.className,
    subject: input.subject,
    bookSeries: input.bookSeries,
    startWeek: input.startWeek,
    numberOfWeeks: input.numberOfWeeks,
    periodsPerWeek: input.periodsPerWeek,
    prepareDate: input.prepareDate,
    firstTeachDate: input.firstTeachDate,
    autoIncreaseTeachDate: input.autoIncreaseTeachDate,
    teacherRequest: input.teacherRequest
  },
  null,
  2
)}

Nếu yêu cầu còn ngắn, tự suy luận tiến trình hợp lý theo từng tuần.
Trả về đúng JSON:
{
  "weeks": [
    {
      "weekNumber": number,
      "lessonTitle": string,
      "mainContent": string,
      "teachDate": "yyyy-mm-dd",
      "notes": string
    }
  ]
}`
        }
      ],
      { temperature: 0.5, maxTokens: 3500 }
    );

    const weeks = normalizeWeekOutlines(data.weeks, input);
    console.log("[ai/generate-week-outline] success", { weeks: weeks.length });
    res.json({ weeks });
  } catch (error) {
    console.error("[ai/generate-week-outline] failed", error);
    next(error);
  }
});

router.post("/generate-lesson-plans", async (req, res, next) => {
  try {
    const basicInfo = req.body?.basicInfo as BasicInfo;
    const options = req.body?.options as GenerationOptions;
    const allWeeks = Array.isArray(req.body?.weeks) ? (req.body.weeks as WeekOutline[]) : [];
    const range = req.body?.range as { fromWeek?: number; toWeek?: number } | undefined;

    validateText(basicInfo?.teacherRequest);

    const weeks =
      range?.fromWeek && range?.toWeek
        ? allWeeks.filter((week) => week.weekNumber >= Number(range.fromWeek) && week.weekNumber <= Number(range.toWeek))
        : allWeeks;

    if (!weeks.length) {
      const error = new Error("Chưa có dàn ý tuần để tạo kế hoạch bài dạy.") as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    console.log("[ai/generate-lesson-plans] request", {
      ...summarizeBasicInfo(basicInfo),
      weeks: weeks.length,
      options
    });

    const data = await completeJson<{ plans: LessonPlan[] }>(
      [
        {
          role: "system",
          content: LESSON_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `Tạo kế hoạch bài dạy đầy đủ theo mẫu DOCX.

Thông tin cơ bản:
${JSON.stringify(basicInfo, null, 2)}

Tùy chỉnh nhanh:
${JSON.stringify(options, null, 2)}

Dàn ý tuần cần viết:
${JSON.stringify(weeks, null, 2)}

Yêu cầu đầu ra:
- Trả về một object JSON có khóa "plans".
- plans phải có cùng số phần tử với số tuần cần viết.
- activities phải có đúng 4 hoạt động.
- Mỗi hoạt động phải có đủ objectives, procedure và studentActions để dùng ngay trong phần III của giáo án.
- Viết tự nhiên, thực tế, không sáo rỗng.

Schema:
{
  "plans": [
    {
      "weekNumber": number,
      "lessonTitle": string,
      "className": string,
      "grade": string,
      "subject": string,
      "bookSeries": string,
      "periods": number,
      "prepareDate": "yyyy-mm-dd",
      "teachDate": "yyyy-mm-dd",
      "objectives": {
        "specificCompetencies": string[],
        "generalCompetencies": string[],
        "qualities": string[]
      },
      "teachingMaterials": {
        "teacher": string[],
        "students": string[]
      },
      "activities": [
        {
          "time": string,
          "name": string,
          "objectives": string[],
          "procedure": string[],
          "studentActions": string[]
        }
      ],
      "afterLessonAdjustment": string
    }
  ]
}`
        }
      ],
      { temperature: 0.55, maxTokens: 9000 }
    );

    const plans = normalizeLessonPlans(data.plans, basicInfo, weeks);
    console.log("[ai/generate-lesson-plans] success", { plans: plans.length });
    res.json({ plans });
  } catch (error) {
    console.error("[ai/generate-lesson-plans] failed", error);
    next(error);
  }
});

export default router;

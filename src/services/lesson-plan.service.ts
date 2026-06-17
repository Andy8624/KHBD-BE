import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { completeJson } from "./openrouter.service.js";
import type { LessonActivity, LessonPlan } from "../types.js";
import { addDaysToIsoDate, formatDateVi } from "../utils/dates.js";
import { sanitizeFilenamePart, toStringArray } from "../utils/text.js";

export interface GenerateDocxInput {
  className: string;
  grade: string;
  subject: string;
  numberOfWeeks: number;
  periodsPerWeek: number;
  prepareDate: string;
  firstTeachDate: string;
  teacherRequest: string;
}

interface AiLessonActivity {
  time?: unknown;
  name?: unknown;
  objective?: unknown;
  objectives?: unknown;
  procedure?: unknown;
  teacherActions?: unknown;
  studentActions?: unknown;
}

interface AiLessonPlan {
  weekNumber?: number;
  lessonTitle?: string;
  className?: string;
  grade?: string;
  subject?: string;
  periods?: number;
  prepareDate?: string;
  teachDate?: string;
  specificCompetencies?: unknown;
  generalCompetencies?: unknown;
  qualities?: unknown;
  teacherMaterials?: unknown;
  studentMaterials?: unknown;
  objectives?: {
    specificCompetencies?: unknown;
    generalCompetencies?: unknown;
    qualities?: unknown;
  };
  teachingMaterials?: {
    teacher?: unknown;
    students?: unknown;
  };
  activities?: AiLessonActivity[];
}

interface TemplatePlan {
  weekNumber: number;
  lessonTitle: string;
  className: string;
  periods: number;
  prepareDate: string;
  teachDate: string;
  specificCompetencies: string[];
  generalCompetencies: string[];
  qualities: string[];
  teacherMaterials: string[];
  studentMaterials: string[];
  khoiDongName: string;
  khoiDongTime: string;
  khoiDongObjectives: string[];
  khoiDongProcedures: string[];
  khoiDongStudentActions: string[];
  khoiDongGvContent: string;
  khoiDongHsContent: string;
  hinhThanhName: string;
  hinhThanhTime: string;
  hinhThanhObjectives: string[];
  hinhThanhProcedures: string[];
  hinhThanhStudentActions: string[];
  hinhThanhGvContent: string;
  hinhThanhHsContent: string;
  luyenTapName: string;
  luyenTapTime: string;
  luyenTapObjectives: string[];
  luyenTapProcedures: string[];
  luyenTapStudentActions: string[];
  luyenTapGvContent: string;
  luyenTapHsContent: string;
  vanDungName: string;
  vanDungTime: string;
  vanDungObjectives: string[];
  vanDungProcedures: string[];
  vanDungStudentActions: string[];
  vanDungGvContent: string;
  vanDungHsContent: string;
}

const TEMPLATE_PATH = path.resolve(process.cwd(), "templates", "lesson-plan-template.docx");

const LESSON_SYSTEM_PROMPT = `Bạn là giáo viên tiểu học nhiều kinh nghiệm, quen viết kế hoạch bài dạy để đồng nghiệp có thể in ra và dạy ngay.
Bạn hiểu định hướng GDPT 2018 và cấu trúc kế hoạch bài dạy theo Công văn 2345/BGDĐT.
Hãy viết bằng tiếng Việt tự nhiên, giống giáo án giáo viên tự soạn: rõ việc, gọn câu, tránh văn phong máy móc.
Chỉ trả về JSON hợp lệ. Không markdown. Không giải thích ngoài JSON.

Quy tắc nội dung:
- Nếu yêu cầu của giáo viên còn ngắn, tự bổ sung chi tiết hợp lý để dùng được ngay.
- Mỗi tuần là một kế hoạch bài dạy dùng chung cho số tiết của tuần đó.
- Tạo đúng số tuần được yêu cầu, từ tuần 1 đến hết số tuần.
- Mỗi kế hoạch có: weekNumber, lessonTitle, className, grade, subject, periods, prepareDate, teachDate.
- Phần I gồm: specificCompetencies, generalCompetencies, qualities.
- Phần II gồm: teacherMaterials, studentMaterials.
- Phần III luôn có đúng 4 hoạt động:
  1. KHỞI ĐỘNG
  2. HÌNH THÀNH KIẾN THỨC MỚI
  3. LUYỆN TẬP - THỰC HÀNH
  4. VẬN DỤNG, TRẢI NGHIỆM
- Mỗi hoạt động có: time, name, objectives, procedure, studentActions.
- objectives là mảng 1-3 ý ngắn, cụ thể, bám đúng việc học sinh cần đạt ở hoạt động đó.
- procedure là mảng các bước tiến hành phía giáo viên theo đúng trình tự lên lớp, cụ thể và làm được ngay.
- studentActions là mảng các phản hồi hoặc việc làm tương ứng của học sinh.
- Tránh viết khuôn mẫu, lặp đi lặp lại một kiểu câu ở mọi dòng.
- Không dùng câu rỗng như "tạo hứng thú học tập", "phát triển năng lực" nếu không gắn với việc làm cụ thể.
- Với lớp 1, ưu tiên câu ngắn, thao tác rõ, nhắc đúng tư thế ngồi, cầm bút, trình bày vở khi phù hợp.
- Nếu yêu cầu nói về rèn chữ, cần ưu tiên nét chữ, độ cao, độ rộng, điểm đặt bút, rê bút, dừng bút, giữ vở sạch và dùng tẩy đúng cách khi phù hợp.
- Tất cả phần tử mảng là văn bản sạch, không thêm dấu đầu dòng thủ công như "-", "•", "–", "*".`;

const DEFAULT_ACTIVITY_NAMES = [
  "KHỞI ĐỘNG",
  "HÌNH THÀNH KIẾN THỨC MỚI",
  "LUYỆN TẬP - THỰC HÀNH",
  "VẬN DỤNG, TRẢI NGHIỆM"
];

export function validateGenerateDocxInput(input: GenerateDocxInput) {
  if (!String(input.className ?? "").trim()) {
    throwFriendly("Vui lòng nhập lớp.", 400);
  }
  if (!String(input.teacherRequest ?? "").trim()) {
    throwFriendly("Vui lòng nhập yêu cầu soạn bài.", 400);
  }
  if (!Number(input.numberOfWeeks) || Number(input.numberOfWeeks) < 1) {
    throwFriendly("Vui lòng chọn số tuần.", 400);
  }
}

export async function generateLessonPlansFromAi(input: GenerateDocxInput): Promise<LessonPlan[]> {
  validateGenerateDocxInput(input);

  const data = await completeJson<{ plans: AiLessonPlan[] }>(
    [
      {
        role: "system",
        content: LESSON_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `Tạo kế hoạch bài dạy theo mẫu Word.

Thông tin:
${JSON.stringify(
  {
    className: input.className,
    grade: input.grade,
    subject: input.subject,
    numberOfWeeks: input.numberOfWeeks,
    periodsPerWeek: input.periodsPerWeek,
    prepareDate: input.prepareDate,
    firstTeachDate: input.firstTeachDate,
    teacherRequest: input.teacherRequest
  },
  null,
  2
)}

Yêu cầu đầu ra:
- Viết như giáo viên đang soạn thật để in và dạy, không viết bóng bẩy.
- Trong mỗi hoạt động, phần objectives phải đủ để đưa vào mục "Mục tiêu", phần procedure phải đủ để đưa vào mục "Cách tiến hành".
- Các dòng trong procedure nên có thứ tự triển khai rõ ràng.
- Các dòng trong studentActions phải bám sát hoạt động thật của học sinh.

Trả về đúng JSON:
{
  "plans": [
    {
      "weekNumber": number,
      "lessonTitle": string,
      "className": string,
      "grade": string,
      "subject": string,
      "periods": number,
      "prepareDate": "yyyy-mm-dd",
      "teachDate": "yyyy-mm-dd",
      "specificCompetencies": string[],
      "generalCompetencies": string[],
      "qualities": string[],
      "teacherMaterials": string[],
      "studentMaterials": string[],
      "activities": [
        {
          "time": string,
          "name": string,
          "objectives": string[],
          "procedure": string[],
          "studentActions": string[]
        }
      ]
    }
  ]
}`
      }
    ],
    { temperature: 0.55, maxTokens: 12000 }
  );

  return normalizeLessonPlans(data.plans, input);
}

export function normalizeLessonPlans(rawPlans: unknown, input: GenerateDocxInput): LessonPlan[] {
  const source = Array.isArray(rawPlans) ? rawPlans : [];
  const count = Math.max(1, Math.min(12, Number(input.numberOfWeeks) || 1));

  return Array.from({ length: count }, (_, index) => {
    const raw = (source[index] ?? {}) as AiLessonPlan;
    const weekNumber = Number(raw.weekNumber) || index + 1;
    const activities = Array.isArray(raw.activities) ? raw.activities : [];

    return {
      weekNumber,
      lessonTitle: cleanText(raw.lessonTitle) || `Bài học tuần ${weekNumber}`,
      className: cleanText(raw.className) || cleanText(input.className),
      grade: cleanText(raw.grade) || cleanText(input.grade),
      subject: cleanText(raw.subject) || cleanText(input.subject),
      bookSeries: "",
      periods: Number(raw.periods) || Number(input.periodsPerWeek) || 1,
      prepareDate: cleanText(raw.prepareDate) || input.prepareDate,
      teachDate: cleanText(raw.teachDate) || addDaysToIsoDate(input.firstTeachDate, index * 7),
      objectives: {
        specificCompetencies: cleanTextArray(raw.specificCompetencies ?? raw.objectives?.specificCompetencies),
        generalCompetencies: cleanTextArray(raw.generalCompetencies ?? raw.objectives?.generalCompetencies),
        qualities: cleanTextArray(raw.qualities ?? raw.objectives?.qualities)
      },
      teachingMaterials: {
        teacher: cleanTextArray(raw.teacherMaterials ?? raw.teachingMaterials?.teacher),
        students: cleanTextArray(raw.studentMaterials ?? raw.teachingMaterials?.students)
      },
      activities: normalizeActivities(activities),
      afterLessonAdjustment: ""
    };
  });
}

export function renderLessonPlansDocx(plans: LessonPlan[]): Buffer {
  if (!existsSync(TEMPLATE_PATH)) {
    throwFriendly(
      "Không tìm thấy file template Word. Vui lòng kiểm tra backend/templates/lesson-plan-template.docx.",
      500
    );
  }

  try {
    const content = readFileSync(TEMPLATE_PATH, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    doc.render({
      plans: plans.map(transformPlanForTemplate)
    });

    return doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE"
    });
  } catch (error) {
    console.error("[docx] render failed", error);
    throwFriendly("Không thể tạo file DOCX. Vui lòng thử lại.", 500);
  }
}

export function buildFilename(className: string, numberOfWeeks: number) {
  return `ke-hoach-bai-day-${sanitizeFilenamePart(className || "lop")}-tuan-1-den-${Number(numberOfWeeks) || 1}.docx`;
}

export function transformPlanForTemplate(plan: LessonPlan): TemplatePlan {
  const activities = mapActivities(plan.activities);

  return {
    weekNumber: plan.weekNumber,
    lessonTitle: plan.lessonTitle,
    className: plan.className,
    periods: plan.periods,
    prepareDate: formatDateVi(plan.prepareDate),
    teachDate: formatDateVi(plan.teachDate),
    specificCompetencies: cleanTextArray(plan.objectives.specificCompetencies),
    generalCompetencies: cleanTextArray(plan.objectives.generalCompetencies),
    qualities: cleanTextArray(plan.objectives.qualities),
    teacherMaterials: cleanTextArray(plan.teachingMaterials.teacher),
    studentMaterials: cleanTextArray(plan.teachingMaterials.students),
    khoiDongName: activities.khoiDong.name,
    khoiDongTime: activities.khoiDong.time,
    khoiDongObjectives: cleanTextArray(activities.khoiDong.objectives),
    khoiDongProcedures: cleanTextArray(activities.khoiDong.procedure),
    khoiDongStudentActions: cleanTextArray(activities.khoiDong.studentActions),
    khoiDongGvContent: buildTeacherContent(activities.khoiDong),
    khoiDongHsContent: buildStudentContent(activities.khoiDong),
    hinhThanhName: activities.hinhThanh.name,
    hinhThanhTime: activities.hinhThanh.time,
    hinhThanhObjectives: cleanTextArray(activities.hinhThanh.objectives),
    hinhThanhProcedures: cleanTextArray(activities.hinhThanh.procedure),
    hinhThanhStudentActions: cleanTextArray(activities.hinhThanh.studentActions),
    hinhThanhGvContent: buildTeacherContent(activities.hinhThanh),
    hinhThanhHsContent: buildStudentContent(activities.hinhThanh),
    luyenTapName: activities.luyenTap.name,
    luyenTapTime: activities.luyenTap.time,
    luyenTapObjectives: cleanTextArray(activities.luyenTap.objectives),
    luyenTapProcedures: cleanTextArray(activities.luyenTap.procedure),
    luyenTapStudentActions: cleanTextArray(activities.luyenTap.studentActions),
    luyenTapGvContent: buildTeacherContent(activities.luyenTap),
    luyenTapHsContent: buildStudentContent(activities.luyenTap),
    vanDungName: activities.vanDung.name,
    vanDungTime: activities.vanDung.time,
    vanDungObjectives: cleanTextArray(activities.vanDung.objectives),
    vanDungProcedures: cleanTextArray(activities.vanDung.procedure),
    vanDungStudentActions: cleanTextArray(activities.vanDung.studentActions),
    vanDungGvContent: buildTeacherContent(activities.vanDung),
    vanDungHsContent: buildStudentContent(activities.vanDung)
  };
}

function normalizeActivities(rawActivities: AiLessonActivity[]): LessonActivity[] {
  const baseActivities = Array.from({ length: 4 }, (_, index) =>
    normalizeActivity(rawActivities[index] ?? {}, index)
  );

  const mapped = mapActivities(baseActivities);
  return [mapped.khoiDong, mapped.hinhThanh, mapped.luyenTap, mapped.vanDung];
}

function normalizeActivity(raw: AiLessonActivity, index: number): LessonActivity {
  const mergedObjectives = cleanTextArray(raw.objectives);
  const fallbackObjective = cleanText(raw.objective);
  const mergedProcedure = [...cleanTextArray(raw.procedure), ...cleanTextArray(raw.teacherActions)];

  if (!mergedObjectives.length && fallbackObjective) {
    mergedObjectives.push(fallbackObjective);
  }

  return {
    time: cleanText(raw.time) || (index === 0 || index === 3 ? "5 phút" : "25 phút"),
    name: cleanText(raw.name) || DEFAULT_ACTIVITY_NAMES[index] || `Hoạt động ${index + 1}`,
    objectives: mergedObjectives.length
      ? mergedObjectives
      : ["Giúp học sinh thực hiện đúng yêu cầu trọng tâm của hoạt động."],
    procedure: mergedProcedure.length
      ? mergedProcedure
      : ["Giáo viên nêu nhiệm vụ, làm mẫu ngắn gọn và hướng dẫn học sinh thực hiện từng bước."],
    studentActions: cleanTextArray(raw.studentActions).length
      ? cleanTextArray(raw.studentActions)
      : ["Học sinh lắng nghe, thực hiện nhiệm vụ và nêu kết quả."]
  };
}

function mapActivities(activities: LessonActivity[]) {
  const fallback = [
    normalizeActivity({}, 0),
    normalizeActivity({}, 1),
    normalizeActivity({}, 2),
    normalizeActivity({}, 3)
  ];

  return {
    khoiDong: findActivity(activities, "khoiDong") ?? fallback[0],
    hinhThanh: findActivity(activities, "hinhThanh") ?? fallback[1],
    luyenTap: findActivity(activities, "luyenTap") ?? fallback[2],
    vanDung: findActivity(activities, "vanDung") ?? fallback[3]
  };
}

function findActivity(activities: LessonActivity[], kind: "khoiDong" | "hinhThanh" | "luyenTap" | "vanDung") {
  return activities.find((activity) => getActivityKind(activity.name) === kind);
}

function getActivityKind(name: string) {
  const normalized = removeVietnameseMarks(name).toLowerCase();
  if (normalized.includes("khoi")) return "khoiDong";
  if (normalized.includes("hinh thanh") || normalized.includes("kien thuc")) return "hinhThanh";
  if (normalized.includes("luyen tap") || normalized.includes("thuc hanh")) return "luyenTap";
  if (normalized.includes("van dung") || normalized.includes("trai nghiem")) return "vanDung";
  return "";
}

function buildTeacherContent(activity: LessonActivity) {
  return ["Mục tiêu:", ...prefixDash(activity.objectives), "Cách tiến hành:", ...prefixDash(activity.procedure)].join(
    "\n"
  );
}

function buildStudentContent(activity: LessonActivity) {
  return prefixDash(activity.studentActions).join("\n");
}

function prefixDash(items: string[]) {
  return cleanTextArray(items).map((item) => `- ${item}`);
}

function cleanTextArray(value: unknown): string[] {
  return toStringArray(value).map(cleanText).filter(Boolean);
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/^\s*[-•–—*]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeVietnameseMarks(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function throwFriendly(message: string, statusCode: number): never {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  throw error;
}

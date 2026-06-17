export type RefineAction =
  | "improve"
  | "clarify"
  | "shorten"
  | "professionalize"
  | "expand";

export interface BasicInfo {
  grade: string;
  className: string;
  subject: string;
  bookSeries: string;
  startWeek: number;
  numberOfWeeks: number;
  periodsPerWeek: number;
  prepareDate: string;
  firstTeachDate: string;
  autoIncreaseTeachDate: boolean;
  teacherRequest: string;
}

export interface GenerationOptions {
  detailLevel: string;
  teachingStyle: string;
  studentLevel: string;
  generateMode?: string;
}

export interface WeekOutline {
  weekNumber: number;
  lessonTitle: string;
  mainContent: string;
  teachDate: string;
  notes: string;
}

export interface LessonActivity {
  time: string;
  name: string;
  objectives: string[];
  procedure: string[];
  studentActions: string[];
}

export interface LessonPlan {
  weekNumber: number;
  lessonTitle: string;
  className: string;
  grade: string;
  subject: string;
  bookSeries: string;
  periods: number;
  prepareDate: string;
  teachDate: string;
  objectives: {
    specificCompetencies: string[];
    generalCompetencies: string[];
    qualities: string[];
  };
  teachingMaterials: {
    teacher: string[];
    students: string[];
  };
  activities: LessonActivity[];
  afterLessonAdjustment: string;
}

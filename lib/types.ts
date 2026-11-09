// Shared data model for the timetable portal. Everything the site shows is
// derived from one published Dataset, which is parsed from the master Excel.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Day = (typeof DAYS)[number];

export const SLOT_TYPES = ["Lecture", "Lab", "Tutorial", "Seminar", "Project"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

export type Role = "Faculty" | "HOD" | "Admin";

export interface Faculty {
  id: string; // e.g. FAC042
  name: string;
  email: string;
  department?: string;
  designation?: string;
  phone?: string;
  role: Role;
  onLeave?: boolean;
}

export interface Period {
  number: number;
  start: string; // "09:00"
  end: string; // "09:50"
  isBreak?: boolean;
  label?: string; // "Lunch"
}

export interface Semester {
  name: string; // "Sem 3"
  startDate: string; // ISO date
  endDate: string;
  academicYear?: string;
  examWindow?: string;
}

export interface Slot {
  key: string; // semester|section|day|period|batch — natural key
  semester: string;
  section: string;
  day: Day;
  period: number;
  start?: string;
  end?: string;
  subjectCode: string;
  subjectName: string;
  type: SlotType;
  facultyIds: string[];
  room: string;
  batch?: string;
  notes?: string;
  sourceRow: number; // row number in the Excel for error reports
}

export interface Dataset {
  faculty: Faculty[];
  periods: Period[];
  semesters: Semester[];
  slots: Slot[];
}

export type IssueLevel = "error" | "warning";
export interface Issue {
  level: IssueLevel;
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

export type ChangeType = "added" | "removed" | "moved" | "reassigned" | "room_changed" | "details_changed" | "grid_changed";

export interface Change {
  id: string;
  type: ChangeType;
  before?: Slot;
  after?: Slot;
  affectedFacultyIds: string[];
  text: string; // one plain-language sentence
}

export type VersionStatus = "draft" | "published" | "superseded";

export interface Version {
  id: number;
  status: VersionStatus;
  createdAt: string;
  publishedAt?: string;
  note?: string;
  fileName?: string;
  data: Dataset;
  changes: Change[];
  issues: Issue[];
  summary: { slots: number; faculty: number; changes: number; affectedFaculty: number };
}

export interface Announcement {
  id: number;
  createdAt: string;
  title: string;
  body: string;
  audience: { kind: "all" } | { kind: "semester"; semester: string } | { kind: "faculty"; ids: string[] };
  emailed: boolean;
  expiresAt?: string;
}

export interface Prefs {
  facultyId: string;
  dailyReminder: boolean;   // morning list of today's classes
  changeEmails: boolean;    // email when their classes change
  updatedAt: string;
}

/** Office-wide settings the admin can change without a redeploy. */
export interface Settings {
  reminderEnabled: boolean;
  reminderHour: number;          // 0-23, Indian Standard Time
  reminderDays: string[];        // weekdays reminders go out on
  holidays: string[];            // ISO dates with no classes and no reminders
  remindOnlyWithClasses: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  reminderEnabled: true,
  reminderHour: 7,
  reminderDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  holidays: [],
  remindOnlyWithClasses: true,
};

export interface Ack {
  versionId: number;
  facultyId: string;
  seenAt: string;
}

export interface EmailLogEntry {
  id: number;
  createdAt: string;
  kind: "publish" | "announcement" | "reminder" | "daily";
  refId: number;
  recipient: string;
  facultyId: string;
  subject: string;
  status: "sent" | "failed" | "skipped";
  providerId?: string;
  error?: string;
}

// What the public portal receives.
export interface PublicPayload {
  version: { id: number; publishedAt: string; note?: string } | null;
  data: Dataset | null;
  changes: Change[];
  recentPublishes: { id: number; publishedAt: string; note?: string; changes: Change[] }[];
  announcements: Announcement[];
  acks: Ack[];
  prefs: Prefs[];
  settings: Settings;
  site: { department: string; institute: string; url: string };
}

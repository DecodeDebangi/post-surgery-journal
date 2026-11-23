// Types and fixed lists shared by the server and the client.

export type Mode = "public" | "me" | "doctor";
export type Author = "me" | "doctor";

export const EXERCISE_SESSIONS = ["morning", "evening", "upper_a", "upper_b", "core"] as const;
export type ExerciseSession = (typeof EXERCISE_SESSIONS)[number];

export const SESSION_LABELS: Record<ExerciseSession, string> = {
  morning: "Morning rehab",
  evening: "Evening maintenance",
  upper_a: "Upper A (Push)",
  upper_b: "Upper B (Pull)",
  core: "Core",
};

export const MEDICINE_TIMES = ["morning", "afternoon", "night"] as const;
export type MedicineTime = (typeof MEDICINE_TIMES)[number];

export const SWELLING = ["none", "mild", "moderate", "severe"] as const;
export type Swelling = (typeof SWELLING)[number];

export const MOODS = ["😣", "😕", "😐", "🙂", "😄"] as const;

export const RED_FLAGS = {
  flag_locking: "Locking",
  flag_catching: "Catching",
  flag_giving_way: "Giving way",
  flag_sharp_pain: "New sharp pain",
} as const;
export type RedFlagKey = keyof typeof RED_FLAGS;

export interface Exercise {
  id: number;
  name: string;
  session: ExerciseSession;
  days: number[]; // 0 = Sun … 6 = Sat
  sets: string;
  target: string; // "6–10", "30–45s", "15 min"
  notes: string;
  active: boolean;
  sort_order: number;
}

export interface Medicine {
  id: number;
  name: string;
  dose: string;
  times: MedicineTime[];
  start_date: string | null;
  end_date: string | null;
  notes: string;
  active: boolean;
}

export interface PrescriptionChange {
  id: number;
  item_type: "exercise" | "medicine";
  item_id: number;
  action: "create" | "update";
  changed_by: Author;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  created_at: string;
}

/** One checklist line for one day (a snapshot of the prescription). */
export interface DayItem {
  id: number;
  kind: "exercise" | "medicine";
  slot: string; // exercise session, or medicine time
  name: string;
  done: boolean;
  actual: string;
  // Private (stripped for the public):
  sets?: string;
  target?: string;
  notes?: string;
}

export interface DayLog {
  date: string;
  exists: boolean;
  pain: number | null;
  swelling: Swelling | null;
  stiffness: number | null;
  flexion_deg: number | null;
  extension_deg: number | null;
  mood: string | null;
  journal: string;
  items: DayItem[];
  media: Media[];
  milestones: Milestone[];
  // Private (stripped for the public):
  flag_locking?: boolean;
  flag_catching?: boolean;
  flag_giving_way?: boolean;
  flag_sharp_pain?: boolean;
}

export type CommentTarget = "day" | "week" | "plan";

export interface Comment {
  id: number;
  target_type: CommentTarget;
  target_key: string;
  parent_id: number | null;
  about: string;
  author: Author;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface Media {
  id: number;
  date: string;
  kind: "photo" | "video";
  caption: string;
  is_private: boolean;
  /** Photos: served through the API so permissions are checked on every view. */
  url: string | null;
  /** Videos: the Google Drive file id, shown with Drive's embedded player. */
  drive_id: string | null;
  created_at: string;
}

export interface Milestone {
  id: number;
  date: string;
  title: string;
  note: string;
  emoji: string;
}

export interface TimelineDay {
  date: string;
  pain: number | null;
  swelling: Swelling | null;
  stiffness: number | null;
  mood: string | null;
  journal: string;
  flexion_deg: number | null;
  extension_deg: number | null;
  done: number;
  total: number;
  media: Media[];
  milestones: Milestone[];
  // Me and the doctor only:
  red_flag?: boolean;
  comments?: number;
}

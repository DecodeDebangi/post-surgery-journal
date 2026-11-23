import type { ExerciseSession } from "../../shared/types.ts";

// The starting prescription. Sunday is a rest day (evening maintenance only),
// so the morning rehab runs Mon–Sat. Sets/targets left blank were not given
// in the original plan; fill them in from the Prescription page.

interface SeedExercise {
  name: string;
  session: ExerciseSession;
  days: number[];
  sets?: string;
  target?: string;
  notes?: string;
}

const MON_SAT = [1, 2, 3, 4, 5, 6];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const MON_THU = [1, 4];
const TUE_FRI = [2, 5];

export const SEED_EXERCISES: SeedExercise[] = [
  // Morning full rehab
  { session: "morning", days: MON_SAT, name: "Hamstring stretches" },
  { session: "morning", days: MON_SAT, name: "Knee flexion with towel" },
  { session: "morning", days: MON_SAT, name: "Static cycling" },
  { session: "morning", days: MON_SAT, name: "Leg press with resistance band" },
  { session: "morning", days: MON_SAT, name: "Squats", notes: "As tolerated" },
  { session: "morning", days: MON_SAT, name: "Lunges" },
  { session: "morning", days: MON_SAT, name: "Balance exercises" },
  { session: "morning", days: MON_SAT, name: "Ankle stretches" },
  { session: "morning", days: MON_SAT, name: "Step-ups and step-downs" },
  { session: "morning", days: MON_SAT, name: "Side step-ups and side step-downs" },

  // Evening maintenance
  { session: "evening", days: EVERY_DAY, name: "Hamstring stretches" },
  { session: "evening", days: EVERY_DAY, name: "Knee flexion" },

  // Upper A (Push), Mon/Thu
  { session: "upper_a", days: MON_THU, name: "Push-ups", sets: "3", notes: "Stop 1–2 reps before failure" },
  { session: "upper_a", days: MON_THU, name: "Pike push-ups", sets: "3", target: "6–10" },
  { session: "upper_a", days: MON_THU, name: "Chair dips", sets: "3", target: "8–12" },
  { session: "upper_a", days: MON_THU, name: "Band shoulder press", sets: "3", target: "10–12" },
  { session: "upper_a", days: MON_THU, name: "Lateral raises", sets: "3", target: "12–15" },
  { session: "upper_a", days: MON_THU, name: "Close-grip push-ups", sets: "3", target: "8–10" },
  { session: "upper_a", days: MON_THU, name: "Dead bugs", sets: "3", target: "10/side" },
  { session: "upper_a", days: MON_THU, name: "Plank", sets: "3", target: "30–45s" },

  // Upper B (Pull), Tue/Fri
  { session: "upper_b", days: TUE_FRI, name: "Seated band row", sets: "3", target: "12–15" },
  { session: "upper_b", days: TUE_FRI, name: "Band pull-aparts", sets: "3", target: "15" },
  { session: "upper_b", days: TUE_FRI, name: "Prone Y-T-W raises", sets: "3", target: "8 each" },
  { session: "upper_b", days: TUE_FRI, name: "Superman holds", sets: "3", target: "20–30s" },
  { session: "upper_b", days: TUE_FRI, name: "Band bicep curls", sets: "3", target: "12" },
  { session: "upper_b", days: TUE_FRI, name: "Band hammer curls", sets: "3", target: "12" },
  { session: "upper_b", days: TUE_FRI, name: "Side plank", sets: "3", target: "20–30s/side" },
  { session: "upper_b", days: TUE_FRI, name: "Plank shoulder taps", sets: "3", target: "10/side" },

  // Saturday
  { session: "core", days: [6], name: "Core session", target: "15 min", notes: "Optional" },
];

import type {
  Prisma,
  Profile,
  Subscription,
  Branding,
  Exercise,
  Food,
  FoodUnit,
  ProgressRecord,
  WaterEntry,
  Appointment,
  Message,
  Notification,
} from '@prisma/client';
type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type Program = Serialized<
  Prisma.ProgramGetPayload<{ include: { exercises: { include: { exercise: true } } } }>
>;
export type Workout = Serialized<
  Prisma.WorkoutSessionGetPayload<{
    include: {
      sets: { include: { exercise: true } };
      program: { include: { exercises: { include: { exercise: true } } } };
    };
  }>
>;
export type MealPlanWithItems = Serialized<
  Prisma.MealPlanGetPayload<{ include: { items: { include: { food: true } } } }>
>;
export type PlanItem = MealPlanWithItems['items'][number];
export type Meal = Serialized<Prisma.MealEntryGetPayload<{ include: { food: true } }>>;
export type Recipe = Serialized<
  Prisma.RecipeGetPayload<{ include: { ingredients: { include: { food: true } } } }>
>;
export type Relationship = Serialized<
  Prisma.CoachRelationshipGetPayload<{
    include: {
      coach: {
        select: {
          id: true;
          name: true;
          email: true;
          phone: true;
          branding: {
            select: {
              businessName: true;
              color: true;
              welcome: true;
              logoAt: true;
              backgroundAt: true;
            };
          };
        };
      };
      client: { select: { id: true; name: true; email: true } };
    };
  }>
>;
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  language: string;
  theme: string;
};
export type State = {
  clockAt: number;
  user: User;
  profile: Profile | null;
  subscription: Subscription | null;
  branding: Branding | null;
  programs: Program[];
  workouts: Workout[];
  calendarWorkouts?: import('./workout-calendar').CalendarWorkout[];
  meals: Meal[];
  water: WaterEntry[];
  progress: ProgressRecord[];
  appointments: Serialized<Appointment>[];
  messages: Serialized<Message>[];
  notifications: Serialized<Notification>[];
  /** Administrative announcements referenced by `announcement` notifications. */
  announcements?: { id: string; titleEn: string; titleHe: string; bodyEn: string; bodyHe: string }[];
  /** APPROVED | PENDING | REJECTED | REVOKED for coaches; null otherwise. */
  coachStatus?: string | null;
  relationships: Relationship[];
  recipes: Recipe[];
  mealPlans: MealPlanWithItems[];
  /** meal '' = the whole menu was marked done. */
  mealChecks: { planId: string; meal: string }[];
  entitlements: import('./plans').Entitlements;
  integrations: Record<string, boolean>;
  /** AdSense unit, sent only to accounts whose plan shows ads. */
  adsense?: { client: string; slot: string } | null;
  demo: boolean;
  /** Consent on record: current Terms/Privacy version, and health-data consent for trainees. */
  consent?: { terms: boolean; health: boolean };
};
export type FoodWithUnits = Food & { units: FoodUnit[] };
export type Library = {
  exercises: (Exercise & {
    hasDemonstration?: boolean;
    demonstration?: { mp4: string; poster: string; gif?: string } | null;
  })[];
  foods: FoodWithUnits[];
};
export type ProgramDraft = {
  id?: string;
  name: string;
  description: string;
  weeks: number; // 0 = ongoing schedule
  days: string;
  template: boolean;
  assignedClientId: string | null;
  exercises: {
    exerciseId: string;
    sets: number;
    reps: number;
    /** Top of a repetition range; 0 = a single target of `reps`. */
    repsMax: number;
    rest: number;
    weight: number;
    notes: string;
    /** Exercises next to each other with the same group form a superset. */
    group: string;
  }[];
};

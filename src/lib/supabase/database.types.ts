// Hand-authored types matching supabase/migrations/0001_init.sql.
// TODO once the project is linked: `supabase gen types typescript --linked`
// to replace this with a generated, always-in-sync version.

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// @supabase/postgrest-js (2.x) requires each table entry to include
// `Relationships` (used for typed foreign-table joins, which this
// hand-written schema doesn't model) — always empty here since every query
// in this app selects a single table at a time.
type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

type HabitScheduleFields = {
  emoji: string; days: number[] | null; on_date: string | null;
  starts_on: string; archived_on: string | null; added_by: 'coach' | 'client';
};

export type CrmStage = 'lead' | 'contacted' | 'consult' | 'proposal' | 'won' | 'lost' | 'past';
export type CrmActivityKind = 'note' | 'call' | 'message' | 'meeting' | 'email' | 'stage' | 'form' | 'system';
export type CrmContactRow = {
  id: string; full_name: string; email: string | null; phone: string | null; source: string; stage: CrmStage;
  lost_reason: string | null; tags: string[]; value_eur: number | null; next_follow_up: string | null; notes: string;
  client_id: string | null; stage_changed_at: string; last_activity_at: string; created_at: string;
  brand: CrmBrand; package: CrmPackage | null; package_price: number | null; package_start: string | null;
  payment_plan: CrmPaymentPlan | null; payment_method: string | null;
  /** list order — IronBodyFit follows the coach's sheet; new contacts go last */
  list_position: number;
};
export type CrmPaymentPlan = 'full' | 'monthly';
export type CrmBrand = 'vitality' | 'ironbodyfit';
export type CrmPackage = '3_months' | '6_months' | '12_months' | 'meal_plan';

export type MealPlanStatus = 'new' | 'in_progress' | 'sent';
export type MealPlanSource = 'ironbodyfit' | 'vitality';

// The 16 micronutrient columns on food_log_entries, all nullable numeric
// (Nullable is the "unset" type — null for Row, and also allowed on
// Insert/Update via Partial<> at each call site).
type MicronutrientFields<Nullable> = {
  fiber_g: number | Nullable; sugar_g: number | Nullable; sodium_mg: number | Nullable;
  calcium_mg: number | Nullable; iron_mg: number | Nullable; potassium_mg: number | Nullable;
  magnesium_mg: number | Nullable; zinc_mg: number | Nullable;
  vitamin_a_mcg: number | Nullable; vitamin_c_mg: number | Nullable; vitamin_d_mcg: number | Nullable;
  vitamin_e_mg: number | Nullable; vitamin_k_mcg: number | Nullable;
  vitamin_b6_mg: number | Nullable; vitamin_b12_mcg: number | Nullable; folate_mcg: number | Nullable;
};

export type Database = {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      profiles: Table<
        { id: string; role: 'coach' | 'client'; full_name: string; email: string; created_at: string; archived_at: string | null },
        { id: string; role?: 'coach' | 'client'; full_name?: string; email: string; created_at?: string; archived_at?: string | null },
        { id?: string; role?: 'coach' | 'client'; full_name?: string; email?: string; created_at?: string; archived_at?: string | null }
      >;
      client_profiles: Table<
        {
          user_id: string; start_date: string; start_weight: number; current_weight: number; goal_weight: number;
          goal_type: 'lose' | 'gain'; goal_date: string | null; program_length_days: number; pace_config: Json;
          coach_note: string; ibf_enabled: boolean; ibf_baseline: Json; ibf_main_baseline: number;
          updated_by: 'coach' | 'client'; updated_at: string;
        },
        {
          user_id: string; start_date?: string; start_weight?: number; current_weight?: number; goal_weight?: number;
          goal_type?: 'lose' | 'gain'; goal_date?: string | null; program_length_days?: number; pace_config?: Json;
          coach_note?: string; ibf_enabled?: boolean; ibf_baseline?: Json; ibf_main_baseline?: number;
          updated_by?: 'coach' | 'client'; updated_at?: string;
        },
        {
          user_id?: string; start_date?: string; start_weight?: number; current_weight?: number; goal_weight?: number;
          goal_type?: 'lose' | 'gain'; goal_date?: string | null; program_length_days?: number; pace_config?: Json;
          coach_note?: string; ibf_enabled?: boolean; ibf_baseline?: Json; ibf_main_baseline?: number;
          updated_by?: 'coach' | 'client'; updated_at?: string;
        }
      >;
      weight_checkpoints: Table<
        { id: string; user_id: string; month_index: number; weight: number; entered_at: string },
        { id?: string; user_id: string; month_index: number; weight: number; entered_at?: string },
        { id?: string; user_id?: string; month_index?: number; weight?: number; entered_at?: string }
      >;
      targets: Table<
        { user_id: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; water_l: number; steps: number; sleep_hours: number; updated_by: 'coach' | 'client'; updated_at: string },
        { user_id: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; water_l?: number; steps?: number; sleep_hours?: number; updated_by?: 'coach' | 'client'; updated_at?: string },
        { user_id?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; water_l?: number; steps?: number; sleep_hours?: number; updated_by?: 'coach' | 'client'; updated_at?: string }
      >;
      food_log_entries: Table<
        {
          id: string; user_id: string; date: string; logged_at: string; name: string;
          calories: number; protein_g: number; carbs_g: number; fat_g: number;
          original_text: string | null; matched_food: string | null; amount: number | null; unit: string | null;
          estimated: boolean; confidence: number | null; source: 'chat' | 'manual' | 'template';
          quality_score: number | null;
        } & MicronutrientFields<null>,
        {
          id?: string; user_id: string; date: string; logged_at?: string; name: string;
          calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number;
          original_text?: string | null; matched_food?: string | null; amount?: number | null; unit?: string | null;
          estimated?: boolean; confidence?: number | null; source?: 'chat' | 'manual' | 'template';
          quality_score?: number | null;
        } & Partial<MicronutrientFields<null>>,
        {
          id?: string; user_id?: string; date?: string; logged_at?: string; name?: string;
          calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number;
          original_text?: string | null; matched_food?: string | null; amount?: number | null; unit?: string | null;
          estimated?: boolean; confidence?: number | null; source?: 'chat' | 'manual' | 'template';
          quality_score?: number | null;
        } & Partial<MicronutrientFields<null>>
      >;
      daily_metrics: Table<
        { user_id: string; date: string; water_l: number; steps: number; sleep_hours: number },
        { user_id: string; date: string; water_l?: number; steps?: number; sleep_hours?: number },
        { user_id?: string; date?: string; water_l?: number; steps?: number; sleep_hours?: number }
      >;
      // Schedule columns from 0011_habit_schedule.sql — see src/lib/habits.ts.
      habits: Table<
        { id: string; user_id: string; key: string; label: string; tag: string; sort_order: number } & HabitScheduleFields,
        { id?: string; user_id: string; key: string; label: string; tag?: string; sort_order?: number } & Partial<HabitScheduleFields>,
        { id?: string; user_id?: string; key?: string; label?: string; tag?: string; sort_order?: number } & Partial<HabitScheduleFields>
      >;
      habit_completions: Table<
        { user_id: string; habit_id: string; date: string; completed: boolean },
        { user_id: string; habit_id: string; date: string; completed?: boolean },
        { user_id?: string; habit_id?: string; date?: string; completed?: boolean }
      >;
      meal_templates: Table<
        { id: string; user_id: string; name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; mealtime: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null },
        { id?: string; user_id: string; name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; mealtime?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null },
        { id?: string; user_id?: string; name?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; mealtime?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null }
      >;
      custom_foods: Table<
        { id: string; user_id: string; name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; default_grams: number; ingredients_text: string | null },
        { id?: string; user_id: string; name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; default_grams?: number; ingredients_text?: string | null },
        { id?: string; user_id?: string; name?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; default_grams?: number; ingredients_text?: string | null }
      >;
      coach_daily_messages: Table<
        { id: string; user_id: string; date: string; body: string; created_at: string; updated_at: string },
        { id?: string; user_id: string; date: string; body: string; created_at?: string; updated_at?: string },
        { id?: string; user_id?: string; date?: string; body?: string; created_at?: string; updated_at?: string }
      >;
      workouts: Table<
        { id: string; user_id: string; name: string; sort_order: number; created_at: string },
        { id?: string; user_id: string; name: string; sort_order?: number; created_at?: string },
        { id?: string; user_id?: string; name?: string; sort_order?: number; created_at?: string }
      >;
      workout_exercises: Table<
        { id: string; user_id: string; workout_id: string; name: string; sort_order: number; created_at: string },
        { id?: string; user_id: string; workout_id: string; name: string; sort_order?: number; created_at?: string },
        { id?: string; user_id?: string; workout_id?: string; name?: string; sort_order?: number; created_at?: string }
      >;
      workout_sets: Table<
        { id: string; user_id: string; exercise_id: string; date: string; set_number: number; weight_kg: number; reps: number; created_at: string },
        { id?: string; user_id: string; exercise_id: string; date: string; set_number: number; weight_kg: number; reps: number; created_at?: string },
        { id?: string; user_id?: string; exercise_id?: string; date?: string; set_number?: number; weight_kg?: number; reps?: number; created_at?: string }
      >;
      foods_global: Table<
        { name: string; type: 'per100g' | 'perUnit' | 'dish'; data: Json },
        { name: string; type: 'per100g' | 'perUnit' | 'dish'; data: Json },
        { name?: string; type?: 'per100g' | 'perUnit' | 'dish'; data?: Json }
      >;
      food_synonyms: Table<
        { phrase: string; canonical: string },
        { phrase: string; canonical: string },
        { phrase?: string; canonical?: string }
      >;
      chat_pending_state: Table<
        { user_id: string; pending_type: 'unknown_food' | 'mealtime_options'; payload: Json; created_at: string },
        { user_id: string; pending_type: 'unknown_food' | 'mealtime_options'; payload: Json; created_at?: string },
        { user_id?: string; pending_type?: 'unknown_food' | 'mealtime_options'; payload?: Json; created_at?: string }
      >;
      ibf_weekly_scores: Table<
        { user_id: string; week_start_date: string; muscle_group: string; score: number },
        { user_id: string; week_start_date: string; muscle_group: string; score: number },
        { user_id?: string; week_start_date?: string; muscle_group?: string; score?: number }
      >;
      body_stats: Table<
        { user_id: string; waist: number | null; chest: number | null; hips: number | null; arm: number | null; thigh: number | null; bench: number | null; squat: number | null; deadlift: number | null; ohp: number | null; updated_at: string },
        { user_id: string; waist?: number | null; chest?: number | null; hips?: number | null; arm?: number | null; thigh?: number | null; bench?: number | null; squat?: number | null; deadlift?: number | null; ohp?: number | null; updated_at?: string },
        { user_id?: string; waist?: number | null; chest?: number | null; hips?: number | null; arm?: number | null; thigh?: number | null; bench?: number | null; squat?: number | null; deadlift?: number | null; ohp?: number | null; updated_at?: string }
      >;
      rank_overrides: Table<
        { user_id: string; date: string; rank: 'gold' | 'silver' | 'bronze'; set_by: string; set_at: string },
        { user_id: string; date: string; rank: 'gold' | 'silver' | 'bronze'; set_by: string; set_at?: string },
        { user_id?: string; date?: string; rank?: 'gold' | 'silver' | 'bronze'; set_by?: string; set_at?: string }
      >;
      assessments: Table<
        { id: string; submission_id: string; full_name: string; email: string; phone: string; answers: Json; created_at: string },
        { id?: string; submission_id: string; full_name: string; email: string; phone: string; answers: Json; created_at?: string },
        { id?: string; submission_id?: string; full_name?: string; email?: string; phone?: string; answers?: Json; created_at?: string }
      >;
      // CRM (0012_crm.sql) — coach-only; see src/lib/crm.
      crm_contacts: Table<
        CrmContactRow,
        Partial<CrmContactRow> & { full_name: string },
        Partial<CrmContactRow>
      >;
      crm_activities: Table<
        { id: string; contact_id: string; kind: CrmActivityKind; body: string; meta: Json; created_at: string },
        { id?: string; contact_id: string; kind: CrmActivityKind; body?: string; meta?: Json; created_at?: string },
        { id?: string; contact_id?: string; kind?: CrmActivityKind; body?: string; meta?: Json; created_at?: string }
      >;
      crm_payments: Table<
        { id: string; contact_id: string; amount: number; due_on: string; paid_on: string | null; method: string | null; note: string; created_at: string },
        { id?: string; contact_id: string; amount: number; due_on: string; paid_on?: string | null; method?: string | null; note?: string; created_at?: string },
        { id?: string; contact_id?: string; amount?: number; due_on?: string; paid_on?: string | null; method?: string | null; note?: string; created_at?: string }
      >;
      crm_tasks: Table<
        { id: string; contact_id: string; title: string; due_on: string; done_at: string | null; created_at: string },
        { id?: string; contact_id: string; title: string; due_on: string; done_at?: string | null; created_at?: string },
        { id?: string; contact_id?: string; title?: string; due_on?: string; done_at?: string | null; created_at?: string }
      >;
      meal_plan_requests: Table<
        { id: string; submission_id: string; full_name: string; email: string; phone: string; answers: Json; status: MealPlanStatus; source: MealPlanSource; created_at: string },
        { id?: string; submission_id: string; full_name: string; email: string; phone: string; answers: Json; status?: MealPlanStatus; source?: MealPlanSource; created_at?: string },
        { id?: string; submission_id?: string; full_name?: string; email?: string; phone?: string; answers?: Json; status?: MealPlanStatus; source?: MealPlanSource; created_at?: string }
      >;
    };
  };
};

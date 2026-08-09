// Hand-authored types matching supabase/migrations/0001_init.sql.
// TODO once the project is linked: `supabase gen types typescript --linked`
// to replace this with a generated, always-in-sync version.

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// @supabase/postgrest-js (2.x) requires each table entry to include
// `Relationships` (used for typed foreign-table joins, which this
// hand-written schema doesn't model) — always empty here since every query
// in this app selects a single table at a time.
type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type Database = {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      profiles: Table<
        { id: string; role: 'coach' | 'client'; full_name: string; email: string; created_at: string },
        { id: string; role?: 'coach' | 'client'; full_name?: string; email: string; created_at?: string },
        { id?: string; role?: 'coach' | 'client'; full_name?: string; email?: string; created_at?: string }
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
        },
        {
          id?: string; user_id: string; date: string; logged_at?: string; name: string;
          calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number;
          original_text?: string | null; matched_food?: string | null; amount?: number | null; unit?: string | null;
          estimated?: boolean; confidence?: number | null; source?: 'chat' | 'manual' | 'template';
        },
        {
          id?: string; user_id?: string; date?: string; logged_at?: string; name?: string;
          calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number;
          original_text?: string | null; matched_food?: string | null; amount?: number | null; unit?: string | null;
          estimated?: boolean; confidence?: number | null; source?: 'chat' | 'manual' | 'template';
        }
      >;
      daily_metrics: Table<
        { user_id: string; date: string; water_l: number; steps: number; sleep_hours: number },
        { user_id: string; date: string; water_l?: number; steps?: number; sleep_hours?: number },
        { user_id?: string; date?: string; water_l?: number; steps?: number; sleep_hours?: number }
      >;
      habits: Table<
        { id: string; user_id: string; key: string; label: string; tag: string; sort_order: number },
        { id?: string; user_id: string; key: string; label: string; tag?: string; sort_order?: number },
        { id?: string; user_id?: string; key?: string; label?: string; tag?: string; sort_order?: number }
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
        { id: string; user_id: string; name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; default_grams: number },
        { id?: string; user_id: string; name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; default_grams?: number },
        { id?: string; user_id?: string; name?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; default_grams?: number }
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
    };
  };
};

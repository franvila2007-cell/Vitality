-- "Teach Vitto a Recipe": custom_foods already lets a client save their own
-- named food (RLS already permits user_id = auth.uid() write), and Vitto's
-- parser already merges custom_foods into its lookup table, so logging a
-- saved recipe by name already works with zero new parser code. This adds
-- a column to keep the ingredient list for display/reference — it's not
-- used by the matcher, which only needs the name and total macros.
alter table public.custom_foods
  add column ingredients_text text;

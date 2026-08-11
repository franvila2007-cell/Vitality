-- Full micronutrient panel per logged food, estimated by Vitto alongside
-- the macro/quality estimate. These are LLM estimates from a food's name
-- and portion, not lab-measured values — treat as directionally useful,
-- not precise (this is communicated in the client-facing UI copy, not
-- enforced here).
alter table public.food_log_entries
  add column fiber_g numeric,
  add column sugar_g numeric,
  add column sodium_mg numeric,
  add column calcium_mg numeric,
  add column iron_mg numeric,
  add column potassium_mg numeric,
  add column magnesium_mg numeric,
  add column zinc_mg numeric,
  add column vitamin_a_mcg numeric,
  add column vitamin_c_mg numeric,
  add column vitamin_d_mcg numeric,
  add column vitamin_e_mg numeric,
  add column vitamin_k_mcg numeric,
  add column vitamin_b6_mg numeric,
  add column vitamin_b12_mcg numeric,
  add column folate_mcg numeric;

alter table public.storyboard_shots
  add column if not exists character_ids uuid[];


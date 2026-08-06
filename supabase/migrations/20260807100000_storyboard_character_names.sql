alter table public.storyboard_shots
  add column if not exists character_names text[] not null default '{}';

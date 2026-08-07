alter table public.storyboard_shots
  add column if not exists emotion text;

comment on column public.storyboard_shots.emotion is
  'Per-shot actor direction: emotion, intensity, pace, volume and subtext.';

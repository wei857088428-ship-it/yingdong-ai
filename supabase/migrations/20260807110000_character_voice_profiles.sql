alter table public.characters
  add column if not exists voice_id text not null default 'orion',
  add column if not exists voice_language text not null default 'zh';

alter table public.storyboard_shots
  add column if not exists speaker_character_id uuid references public.characters(id) on delete set null;

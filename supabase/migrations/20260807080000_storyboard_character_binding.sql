alter table public.storyboard_projects
  add column if not exists character_id uuid references public.characters(id) on delete set null;

create index if not exists storyboard_projects_character_id_idx
  on public.storyboard_projects(character_id);

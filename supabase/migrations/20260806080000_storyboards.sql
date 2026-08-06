create table if not exists public.storyboard_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyboard_shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.storyboard_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shot_number integer not null,
  duration_seconds integer not null default 5,
  shot_type text not null default '',
  camera text not null default '',
  scene text not null default '',
  action text not null default '',
  dialogue text not null default '',
  sound text not null default '',
  image_prompt text not null default '',
  video_prompt text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists storyboard_projects_user_idx on public.storyboard_projects(user_id, updated_at desc);
create index if not exists storyboard_shots_project_idx on public.storyboard_shots(project_id, shot_number);
alter table public.storyboard_projects enable row level security;
alter table public.storyboard_shots enable row level security;
drop policy if exists "users own storyboard projects" on public.storyboard_projects;
create policy "users own storyboard projects" on public.storyboard_projects for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "users own storyboard shots" on public.storyboard_shots;
create policy "users own storyboard shots" on public.storyboard_shots for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

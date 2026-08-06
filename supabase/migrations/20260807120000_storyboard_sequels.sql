alter table public.storyboard_projects
  add column if not exists parent_project_id uuid references public.storyboard_projects(id) on delete set null;

create index if not exists storyboard_projects_parent_project_id_idx
  on public.storyboard_projects(parent_project_id);

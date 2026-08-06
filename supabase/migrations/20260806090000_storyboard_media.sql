alter table public.storyboard_shots add column if not exists image_url text;
alter table public.storyboard_shots add column if not exists video_url text;
alter table public.storyboard_shots add column if not exists media_status text not null default 'pending'
  check (media_status in ('pending','image_generating','image_ready','video_generating','completed','failed'));
alter table public.storyboard_shots add column if not exists error_message text;

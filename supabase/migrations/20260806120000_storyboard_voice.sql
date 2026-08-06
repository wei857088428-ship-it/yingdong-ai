alter table public.storyboard_shots add column if not exists audio_url text;
alter table public.storyboard_shots add column if not exists voice_id text not null default 'orion';
alter table public.storyboard_shots add column if not exists voice_language text not null default 'zh';
alter table public.storyboard_shots add column if not exists subtitle_start_ms integer;
alter table public.storyboard_shots add column if not exists subtitle_end_ms integer;

alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check check (kind in ('chat','image','video','audio'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storyboard-audio', 'storyboard-audio', true, 10485760, array['audio/mpeg'])
on conflict (id) do update set public=true, file_size_limit=10485760, allowed_mime_types=array['audio/mpeg'];

drop policy if exists "users upload storyboard audio" on storage.objects;
drop policy if exists "users update storyboard audio" on storage.objects;
drop policy if exists "users read storyboard audio" on storage.objects;
create policy "users read storyboard audio" on storage.objects for select to authenticated
  using (bucket_id='storyboard-audio' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users upload storyboard audio" on storage.objects for insert to authenticated
  with check (bucket_id='storyboard-audio' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users update storyboard audio" on storage.objects for update to authenticated
  using (bucket_id='storyboard-audio' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='storyboard-audio' and (storage.foldername(name))[1]=auth.uid()::text);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  version integer not null default 1,
  images jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_user_updated_idx on public.characters(user_id, updated_at desc);
alter table public.characters enable row level security;
drop policy if exists "users own characters" on public.characters;
create policy "users own characters" on public.characters for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-references', 'character-references', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "users upload character refs" on storage.objects;
create policy "users upload character refs" on storage.objects for insert to authenticated
with check (bucket_id='character-references' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "users update character refs" on storage.objects;
create policy "users update character refs" on storage.objects for update to authenticated
using (bucket_id='character-references' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "users delete character refs" on storage.objects;
create policy "users delete character refs" on storage.objects for delete to authenticated
using (bucket_id='character-references' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "public read character refs" on storage.objects;
create policy "public read character refs" on storage.objects for select using (bucket_id='character-references');

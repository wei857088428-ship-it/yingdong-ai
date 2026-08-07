insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-images', 'generated-images', true, 20971520, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=20971520,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

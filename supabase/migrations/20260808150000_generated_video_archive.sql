insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-videos', 'generated-videos', true, 157286400, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public=true, file_size_limit=157286400,
  allowed_mime_types=array['video/mp4','video/webm','video/quicktime'];

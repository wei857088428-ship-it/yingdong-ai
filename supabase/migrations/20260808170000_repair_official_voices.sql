alter table public.characters alter column voice_id set default 'sal';
alter table public.storyboard_shots alter column voice_id set default 'sal';

update public.characters set voice_id = case
  when lower(voice_id) in ('carina','luna','iris') then 'eve'
  when lower(voice_id) = 'orion' then 'leo'
  when lower(voice_id) not in ('ara','eve','leo','rex','sal') then 'rex'
  else lower(voice_id) end;

update public.storyboard_shots set voice_id = case
  when lower(voice_id) in ('carina','luna','iris') then 'eve'
  when lower(voice_id) = 'orion' then 'leo'
  when lower(voice_id) not in ('ara','eve','leo','rex','sal') then 'rex'
  else lower(voice_id) end;

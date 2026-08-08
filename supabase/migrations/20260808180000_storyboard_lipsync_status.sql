alter table public.storyboard_shots
  drop constraint if exists storyboard_shots_media_status_check;

alter table public.storyboard_shots
  add constraint storyboard_shots_media_status_check
  check (
    media_status in (
      'pending',
      'image_generating',
      'image_ready',
      'video_generating',
      'lipsync_generating',
      'lipsync_ready',
      'completed',
      'failed'
    )
  );

drop policy if exists "users own messages" on public.messages;
drop policy if exists "users read own messages" on public.messages;
drop policy if exists "users insert own messages" on public.messages;
create policy "users read own messages" on public.messages
  for select using (auth.uid() = user_id);
create policy "users insert own messages" on public.messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "users own works" on public.works;
drop policy if exists "users read own works" on public.works;
drop policy if exists "users insert own works" on public.works;
drop policy if exists "users update own works" on public.works;
create policy "users read own works" on public.works
  for select using (auth.uid() = user_id);
create policy "users insert own works" on public.works
  for insert with check (auth.uid() = user_id);
create policy "users update own works" on public.works
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

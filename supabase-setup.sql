create table if not exists public.country_photos (
  id uuid primary key default gen_random_uuid(),
  country_id text not null,
  country_name text not null,
  title text not null,
  image_path text not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table public.country_photos enable row level security;

create policy "Anyone can view country photos"
on public.country_photos
for select
using (true);

create policy "Anyone can add country photos"
on public.country_photos
for insert
with check (true);

insert into storage.buckets (id, name, public)
values ('country-photos', 'country-photos', true)
on conflict (id) do update set public = true;

create policy "Anyone can view uploaded country photos"
on storage.objects
for select
using (bucket_id = 'country-photos');

create policy "Anyone can upload country photos"
on storage.objects
for insert
with check (bucket_id = 'country-photos');

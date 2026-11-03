create table if not exists public.video_sections (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 48),
  created_at timestamptz not null default now()
);

insert into public.video_sections (id, name)
values
  ('apparatology', 'Aparatología'),
  ('makeup', 'Maquillaje'),
  ('haircare', 'Tratamientos capilares'),
  ('newness', 'Novedades'),
  ('haircolor', 'Color de pelo'),
  ('global', 'Vídeo de espera · todas las secciones')
on conflict (id) do nothing;

create unique index if not exists video_sections_name_unique_idx
  on public.video_sections (lower(name));

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  section_id text not null,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm', 'video/ogg')),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);

alter table public.videos drop constraint if exists videos_section_id_check;
alter table public.videos drop constraint if exists videos_section_id_allowed;
alter table public.videos
  add constraint videos_section_id_allowed
  foreign key (section_id) references public.video_sections (id) on delete cascade;

create index if not exists videos_section_created_idx
  on public.videos (section_id, created_at);

alter table public.video_sections enable row level security;
alter table public.videos enable row level security;

grant select on public.video_sections to anon, authenticated;
grant insert, delete on public.video_sections to authenticated;
grant select on public.videos to anon, authenticated;
grant insert, delete on public.videos to authenticated;

drop policy if exists "Anyone can read video sections" on public.video_sections;
create policy "Anyone can read video sections"
  on public.video_sections for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can add video sections" on public.video_sections;
create policy "Admins can add video sections"
  on public.video_sections for insert
  to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'beauty_admin') = 'true');

drop policy if exists "Admins can delete video sections" on public.video_sections;
create policy "Admins can delete video sections"
  on public.video_sections for delete
  to authenticated
  using (
    id not in ('apparatology', 'makeup', 'haircare', 'newness', 'haircolor', 'global')
    and (auth.jwt() -> 'app_metadata' ->> 'beauty_admin') = 'true'
  );

drop policy if exists "Anyone can read video metadata" on public.videos;
create policy "Anyone can read video metadata"
  on public.videos for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can add video metadata" on public.videos;
create policy "Admins can add video metadata"
  on public.videos for insert
  to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'beauty_admin') = 'true');

drop policy if exists "Admins can delete video metadata" on public.videos;
create policy "Admins can delete video metadata"
  on public.videos for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'beauty_admin') = 'true');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'beauty-videos',
  'beauty-videos',
  true,
  52428800,
  array['video/mp4', 'video/webm', 'video/ogg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can read Beauty Tech video objects" on storage.objects;
create policy "Admins can read Beauty Tech video objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'beauty-videos'
    and (auth.jwt() -> 'app_metadata' ->> 'beauty_admin') = 'true'
  );

drop policy if exists "Admins can upload Beauty Tech videos" on storage.objects;
create policy "Admins can upload Beauty Tech videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'beauty-videos'
    and (auth.jwt() -> 'app_metadata' ->> 'beauty_admin') = 'true'
  );

drop policy if exists "Admins can delete Beauty Tech videos" on storage.objects;
create policy "Admins can delete Beauty Tech videos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'beauty-videos'
    and (auth.jwt() -> 'app_metadata' ->> 'beauty_admin') = 'true'
  );

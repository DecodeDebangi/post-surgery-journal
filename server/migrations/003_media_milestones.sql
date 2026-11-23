-- Phase 2: photos (in object storage), Google Drive videos, milestones.

create table media (
  id serial primary key,
  date date not null,
  kind text not null check (kind in ('photo', 'video')),
  storage_key text unique,
  content_type text,
  bytes int,
  drive_id text,
  caption text not null default '',
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  check (
    (kind = 'photo' and storage_key is not null and drive_id is null)
    or (kind = 'video' and drive_id is not null and storage_key is null)
  )
);

create index media_date on media (date);

create table milestones (
  id serial primary key,
  date date not null,
  title text not null check (length(title) between 1 and 120),
  note text not null default '',
  emoji text not null default '⭐',
  created_at timestamptz not null default now()
);

create index milestones_date on milestones (date);

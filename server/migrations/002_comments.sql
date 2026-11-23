-- Comments between me and the doctor, on a day, a post-op week, or the
-- prescription. One level of replies. "about" optionally names what the
-- comment is about (an exercise, "Pain", a medicine…).

create table comments (
  id serial primary key,
  target_type text not null check (target_type in ('day', 'week', 'plan')),
  target_key text not null,
  parent_id int references comments (id) on delete cascade,
  about text not null default '',
  author text not null check (author in ('me', 'doctor')),
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  -- When the other person first saw it.
  read_at timestamptz
);

create index comments_target on comments (target_type, target_key, created_at);

create index comments_unread on comments (author) where read_at is null;

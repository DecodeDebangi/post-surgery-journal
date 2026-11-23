-- Phase 1: access, prescription, daily log.
-- Statements are separated by a line that ends in ";" (migrate.ts splits on that).

create table sessions (
  token_hash text primary key,
  mode text not null check (mode in ('me', 'doctor')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_expires_at on sessions (expires_at);

create table pin_attempts (
  ip text primary key,
  failures int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table exercises (
  id serial primary key,
  name text not null check (length(name) between 1 and 100),
  session text not null check (session in ('morning', 'evening', 'upper_a', 'upper_b', 'core')),
  days smallint[] not null check (cardinality(days) > 0 and days <@ array[0,1,2,3,4,5,6]::smallint[]),
  sets text not null default '',
  target text not null default '',
  notes text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table medicines (
  id serial primary key,
  name text not null check (length(name) between 1 and 100),
  dose text not null default '',
  times text[] not null check (cardinality(times) > 0 and times <@ array['morning','afternoon','night']),
  start_date date,
  end_date date,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table prescription_changes (
  id serial primary key,
  item_type text not null check (item_type in ('exercise', 'medicine')),
  item_id int not null,
  action text not null check (action in ('create', 'update')),
  changed_by text not null check (changed_by in ('me', 'doctor')),
  before jsonb,
  after jsonb not null,
  created_at timestamptz not null default now()
);

create index prescription_changes_created_at on prescription_changes (created_at desc);

create table day_logs (
  date date primary key,
  pain smallint check (pain between 0 and 10),
  swelling text check (swelling in ('none', 'mild', 'moderate', 'severe')),
  stiffness smallint check (stiffness between 0 and 10),
  flexion_deg smallint check (flexion_deg between 0 and 170),
  extension_deg smallint check (extension_deg between -30 and 30),
  mood text,
  journal text not null default '',
  flag_locking boolean not null default false,
  flag_catching boolean not null default false,
  flag_giving_way boolean not null default false,
  flag_sharp_pain boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table day_items (
  id serial primary key,
  date date not null references day_logs (date) on delete cascade,
  kind text not null check (kind in ('exercise', 'medicine')),
  source_id int not null,
  slot text not null,
  name text not null,
  sets text not null default '',
  target text not null default '',
  notes text not null default '',
  sort_order int not null default 0,
  done boolean not null default false,
  actual text not null default '',
  unique (date, kind, source_id, slot)
);

-- Tables for the separate "Jul–Dec 2026" copy of the system (juit-tt.vercel.app/2026 and /2026_admin).
-- Run once in Supabase → SQL editor, exactly like schema.sql. The original tables are not touched.
create table if not exists versions_2026 (
  id bigserial primary key,
  status text not null check (status in ('draft','published','superseded')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  note text,
  file_name text,
  data jsonb not null,
  changes jsonb not null default '[]',
  issues jsonb not null default '[]',
  summary jsonb not null
);
create index if not exists versions_2026_status_idx on versions_2026(status, id desc);

create table if not exists acks_2026 (
  version_id bigint not null references versions_2026(id) on delete cascade,
  faculty_id text not null,
  seen_at timestamptz not null default now(),
  primary key (version_id, faculty_id)
);

create table if not exists announcements_2026 (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  title text not null,
  body text not null,
  audience jsonb not null default '{"kind":"all"}',
  emailed boolean not null default false,
  expires_at timestamptz
);

create table if not exists email_log_2026 (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  ref_id bigint not null,
  recipient text not null,
  faculty_id text not null,
  subject text not null,
  status text not null,
  provider_id text,
  error text
);
create index if not exists email_log_2026_created_idx on email_log_2026(id desc);

alter table versions_2026 enable row level security;
alter table acks_2026 enable row level security;
alter table announcements_2026 enable row level security;
alter table email_log_2026 enable row level security;

-- Added for daily reminders and per-faculty preferences.
create table if not exists prefs_2026 (
  faculty_id text primary key,
  daily_reminder boolean not null default true,
  change_emails boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists settings_2026 (
  id int primary key default 1,
  value jsonb not null default '{}'
);

alter table prefs_2026 enable row level security;
alter table settings_2026 enable row level security;

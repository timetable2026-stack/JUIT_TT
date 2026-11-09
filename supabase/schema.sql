-- Run once in Supabase → SQL editor. Service-role key is used by the server, so RLS stays on with no public policies.
create table if not exists versions (
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
create index if not exists versions_status_idx on versions(status, id desc);

create table if not exists acks (
  version_id bigint not null references versions(id) on delete cascade,
  faculty_id text not null,
  seen_at timestamptz not null default now(),
  primary key (version_id, faculty_id)
);

create table if not exists announcements (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  title text not null,
  body text not null,
  audience jsonb not null default '{"kind":"all"}',
  emailed boolean not null default false,
  expires_at timestamptz
);

create table if not exists email_log (
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
create index if not exists email_log_created_idx on email_log(id desc);

alter table versions enable row level security;
alter table acks enable row level security;
alter table announcements enable row level security;
alter table email_log enable row level security;

-- Added for daily reminders and per-faculty preferences.
create table if not exists prefs (
  faculty_id text primary key,
  daily_reminder boolean not null default true,
  change_emails boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key default 1,
  value jsonb not null default '{}'
);

alter table prefs enable row level security;
alter table settings enable row level security;

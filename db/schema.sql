-- PQ4R 튜터 MVP 데이터베이스 (Postgres: Neon 또는 Supabase)
-- 빈 데이터베이스면 앱이 첫 요청 때 이 파일을 자동으로 실행한다(lib/db.js ensureSchema). SQL Editor에서 직접 실행해도 된다(여러 번 실행해도 안전).

create extension if not exists pgcrypto;

-- 학생 명단(가명). 집단은 명단에서만 정해진다.
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{2,20}$'),
  grp text not null check (grp in ('EXPERIMENT', 'CONTROL')),
  class_name text not null default '',
  pin_hash text not null,
  active boolean not null default true,
  failed_logins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 연구자 화면에 PIN을 다시 보여 주기 위한 암호문(AES-GCM, 키는 서버 APP_SECRET). 로그인 확인은 pin_hash로만.
alter table students add column if not exists pin_enc text;

-- 수업(차시 × 반). 단계·설정·변경 번호를 가진다.
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{2,24}$'),
  lesson int not null default 1 check (lesson between 1 and 8),
  class_name text not null default '',
  stage int not null default 0 check (stage between 0 and 5),
  stage_opened jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  stage_rev int not null default 0,
  rev bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- 수업에 들어온 학생
create table if not exists participants (
  session_id uuid not null references sessions(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  closed_stages jsonb not null default '[]'::jsonb,
  primary key (session_id, student_id)
);

-- 학생 × 문항의 현재 상태(엔진 rec, 임시저장, 제출본). 기록 원본은 events.
create table if not exists item_states (
  session_id uuid not null references sessions(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  item_id text not null,
  rec jsonb not null,
  draft jsonb not null default '{}'::jsonb,
  draft_sel jsonb not null default '{}'::jsonb,
  versions jsonb not null default '[]'::jsonb,
  last_judgment jsonb,
  reason text not null default '',
  rev int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id, item_id)
);

-- 학생 화면에 보이는 지원 대화(AI·교사·안내)
create table if not exists messages (
  seq bigserial primary key,
  id uuid not null unique default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  item_id text not null,
  sender text not null check (sender in ('AI', 'TEACHER', 'SYS')),
  level int,
  text text not null,
  bank_id text,
  requires_resubmission boolean not null default false,
  ack boolean not null default false,
  reply_to uuid,
  at timestamptz not null default now()
);
create index if not exists messages_student on messages (session_id, student_id, seq);

-- 통제집단 도움 요청 대기열
create table if not exists help_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  item_id text not null,
  stage text not null,
  attempt int not null default 0,
  requested_at timestamptz not null default now(),
  answered_at timestamptz,
  answer_message uuid
);
create index if not exists help_open on help_requests (session_id) where answered_at is null;

-- 연구 기록(06 로그 사전 + 추가 항목). 추가만 가능하고 고치거나 지울 수 없다.
create table if not exists events (
  seq bigserial primary key,
  event_id text not null unique,
  session_id uuid references sessions(id) on delete restrict,
  student_code text,
  event_type text not null,
  item_id text,
  server_ts timestamptz not null default now(),
  data jsonb not null
);
create index if not exists events_session on events (session_id, seq);
create index if not exists events_type on events (event_type);

create or replace function pq4r_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'events 표는 추가만 할 수 있어요 (% 거부)', tg_op;
end $$;
drop trigger if exists events_no_update on events;
create trigger events_no_update before update or delete on events
  for each row execute function pq4r_append_only();
drop trigger if exists events_no_truncate on events;
create trigger events_no_truncate before truncate on events
  for each statement execute function pq4r_append_only();

-- 로그인 실패 잠금(교직원)
create table if not exists auth_failures (
  key text primary key,
  count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- 무료 플랜 일시정지 방지용 하루 한 번 기록
create table if not exists heartbeat (
  id int primary key default 1 check (id = 1),
  at timestamptz not null default now(),
  note text
);

-- 이 파일의 판(앱이 내용이 바뀐 것을 알아채고 다시 실행하는 데 씀)
create table if not exists schema_meta (
  id int primary key default 1 check (id = 1),
  version text not null,
  applied_at timestamptz not null default now()
);

-- 브라우저용 공개 키(anon/publishable)로는 어떤 표도 읽거나 쓸 수 없게 한다.
-- 앱 서버는 데이터베이스 연결 문자열(postgres 사용자)로만 접근한다.
alter table students enable row level security;
alter table sessions enable row level security;
alter table participants enable row level security;
alter table item_states enable row level security;
alter table messages enable row level security;
alter table help_requests enable row level security;
alter table events enable row level security;
alter table auth_failures enable row level security;
alter table heartbeat enable row level security;
alter table schema_meta enable row level security;

-- Fulcro: esquema de Supabase. Pégalo entero en SQL Editor y ejecútalo una vez.
-- Solo se comparten resúmenes de cada serie con el grupo. El vídeo no sale del móvil.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default 'Atleta'
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
-- una persona, un grupo
create unique index if not exists group_members_one_group on public.group_members (user_id);

create table if not exists public.sets (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  exercise text not null,
  arm text not null,
  weight_kg real not null default 0,
  started_at timestamptz not null,
  reps int not null,
  avg_range real not null default 0,
  avg_tempo_ms real not null default 0,
  fatigue_rep int,
  pain_zone text,
  pain_level int not null default 0
);
create index if not exists sets_user_time on public.sets (user_id, started_at desc);

-- Perfil automático al registrarse
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Ayudantes (security definer para evitar recursión en las políticas)
create or replace function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.sets enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group(id));
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated using (public.is_member(id));

drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members for select to authenticated using (public.is_member(group_id));

drop policy if exists sets_read on public.sets;
create policy sets_read on public.sets for select to authenticated
  using (user_id = auth.uid() or public.shares_group(user_id));
drop policy if exists sets_write on public.sets;
create policy sets_write on public.sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Grupo del usuario actual
create or replace function public.my_group() returns table (id uuid, name text, code text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.code from public.groups g
  join public.group_members m on m.group_id = g.id
  where m.user_id = auth.uid();
$$;

create or replace function public.create_group(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare gid uuid; c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  if exists (select 1 from group_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un grupo. Sal de él para crear otro.';
  end if;
  loop
    c := upper(substr(translate(encode(gen_random_bytes(6), 'base64'), '+/=OIl01', ''), 1, 6));
    exit when length(c) = 6 and not exists (select 1 from groups where code = c);
    tries := tries + 1;
    if tries > 20 then raise exception 'No se pudo generar un código. Inténtalo otra vez.'; end if;
  end loop;
  insert into groups (name, code, owner) values (trim(p_name), c, auth.uid()) returning groups.id into gid;
  insert into group_members (group_id, user_id) values (gid, auth.uid());
end $$;

create or replace function public.join_group(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare gid uuid; n int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  select id into gid from groups where code = upper(trim(p_code));
  if gid is null then raise exception 'Ese código no existe.'; end if;
  if exists (select 1 from group_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un grupo.';
  end if;
  select count(*) into n from group_members where group_id = gid;
  if n >= 10 then raise exception 'El grupo está lleno (máximo 10 atletas).'; end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid());
end $$;

create or replace function public.leave_group() returns void
language sql security definer set search_path = public as $$
  delete from group_members where user_id = auth.uid();
$$;

-- Actividad de la semana (lunes a domingo, hora UTC) de cada miembro
create or replace function public.group_activity() returns table (
  user_id uuid, name text, days_week int, sets_week int, avg_range_week real,
  last_exercise text, last_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with mine as (select group_id from group_members where user_id = auth.uid()),
  members as (select m.user_id from group_members m join mine on mine.group_id = m.group_id)
  select p.id, p.name,
    coalesce((select count(distinct (s.started_at at time zone 'utc')::date) from sets s
      where s.user_id = p.id and s.started_at >= date_trunc('week', now())), 0)::int,
    coalesce((select count(*) from sets s
      where s.user_id = p.id and s.started_at >= date_trunc('week', now())), 0)::int,
    coalesce((select avg(s.avg_range) from sets s
      where s.user_id = p.id and s.started_at >= date_trunc('week', now())), 0)::real,
    (select s.exercise from sets s where s.user_id = p.id order by s.started_at desc limit 1),
    (select s.started_at from sets s where s.user_id = p.id order by s.started_at desc limit 1)
  from profiles p join members on members.user_id = p.id
  order by 3 desc, 4 desc;
$$;

-- Comparación por ejercicio (últimos 30 días)
create or replace function public.group_exercise_stats(p_exercise text) returns table (
  user_id uuid, name text, sets int, avg_range real, avg_tempo_ms real, best_kg real
)
language sql stable security definer set search_path = public as $$
  with mine as (select group_id from group_members where user_id = auth.uid()),
  members as (select m.user_id from group_members m join mine on mine.group_id = m.group_id)
  select p.id, p.name, count(s.id)::int,
    coalesce(avg(s.avg_range), 0)::real, coalesce(avg(s.avg_tempo_ms), 0)::real,
    coalesce(max(s.weight_kg), 0)::real
  from profiles p join members on members.user_id = p.id
  left join sets s on s.user_id = p.id and s.exercise = p_exercise and s.started_at >= now() - interval '30 days'
  group by p.id, p.name
  order by 4 desc;
$$;

grant execute on function public.my_group() to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group() to authenticated;
grant execute on function public.group_activity() to authenticated;
grant execute on function public.group_exercise_stats(text) to authenticated;

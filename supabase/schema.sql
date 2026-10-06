-- GymLog · esquema de Supabase
-- Pegar entero en: Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez.
--
-- Una sola tabla guarda todos los registros de la app (ejercicios, rutinas, sesiones, series,
-- calendario) como JSON. Cada fila pertenece a un usuario y Row Level Security garantiza que
-- nadie pueda leer ni modificar datos de otra cuenta.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null check (tbl in ('exercises','routines','sessions','sessionExercises','sets','calendar')),
  id         text        not null,
  data       jsonb,
  updated_at bigint      not null,                       -- ms del dispositivo que hizo el cambio
  deleted    boolean     not null default false,         -- borrado lógico, para propagarlo a otros dispositivos
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_server_ts on public.records (user_id, server_ts);

-- Last-write-wins: ignora una escritura más antigua que la guardada y sella la hora del servidor
create or replace function public.records_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_ts := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

-- Seguridad: cada usuario solo ve y toca sus propias filas
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;
drop policy if exists "records_delete_own" on public.records;

create policy "records_select_own" on public.records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "records_insert_own" on public.records for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "records_update_own" on public.records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "records_delete_own" on public.records for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

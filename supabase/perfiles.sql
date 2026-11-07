-- Perfiles de Tropical Sadness: el nick y el avatar de cada persona, guardados en su cuenta.
-- Se pega entero en Supabase > SQL Editor y se ejecuta una vez (se puede volver a correr sin romper nada).
-- Usa la misma sesión anónima del chat (supabase/foro.sql). Con un email se vuelve permanente y se
-- recupera en otro dispositivo.

-- 1) La tabla: una fila por persona
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 16 and nick !~ '\s'),
  -- El avatar: un objeto chico de números (ver Look en components/ascii3d/engine/avatars.ts)
  look jsonb check (look is null or (jsonb_typeof(look) = 'object' and pg_column_size(look) < 600)),
  updated_at timestamptz not null default now()
);

-- 2) Permisos: cada quien lee y escribe solo su propia fila; nadie borra
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
drop policy if exists "perfil: leer el propio" on public.profiles;
create policy "perfil: leer el propio" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "perfil: crear el propio" on public.profiles;
create policy "perfil: crear el propio" on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "perfil: cambiar el propio" on public.profiles;
create policy "perfil: cambiar el propio" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3) La fecha la pone el servidor
create or replace function public.profiles_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.profiles_touch();

-- Foro del chat de Tropical Sadness, pensado para el plan gratis de Supabase.
-- Se pega entero en Supabase > SQL Editor y se ejecuta una vez (se puede volver a correr sin romper nada).
-- Antes: Authentication > Sign In / Providers > activar "Allow anonymous sign-ins".
--
-- Cómo cuida la cuota gratis:
--   · base (500 MB): un mensaje ocupa ~0,5 KB; se borran solos a los 90 días y nunca hay más de 400.000
--   · mensajes en vivo (2 M/mes): no hay lista de "en línea" (Presence gasta mucho) y el chat solo se
--     conecta con la ventana abierta y la pestaña visible
--   · abuso: modo lento de 4 s, 300 mensajes por persona por día y un tope general por hora

-- 1) La tabla
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 16 and nick !~ '\s'),
  body text not null check (char_length(body) between 1 and 200 and body !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_user_time on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_time on public.chat_messages (created_at);

-- 2) Permisos: cualquiera lee; solo escribe quien tiene sesión (anónima), a su nombre; nadie edita ni borra
alter table public.chat_messages enable row level security;
drop policy if exists "foro: leer" on public.chat_messages;
create policy "foro: leer" on public.chat_messages for select to anon, authenticated using (true);
drop policy if exists "foro: escribir" on public.chat_messages;
create policy "foro: escribir" on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 3) Límites en el servidor (el modo lento del navegador se puede saltear; este no)
create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.body := btrim(new.body);
  if exists (
    select 1 from public.chat_messages
    where user_id = new.user_id and created_at > now() - interval '4 seconds'
  ) then
    raise exception 'modo_lento';
  end if;
  if (
    select count(*) from public.chat_messages
    where user_id = new.user_id and created_at > now() - interval '1 day'
  ) >= 300 then
    raise exception 'limite_diario';
  end if;
  -- Si alguien crea muchas sesiones para inundar el foro, esto frena a todos por un rato
  if (select count(*) from public.chat_messages where created_at > now() - interval '1 hour') >= 3000 then
    raise exception 'foro_saturado';
  end if;
  return new;
end $$;
drop trigger if exists chat_guard on public.chat_messages;
create trigger chat_guard before insert on public.chat_messages
  for each row execute function public.chat_guard();

-- 4) En vivo: la base misma avisa de cada mensaje guardado (así nadie puede mandar mensajes falsos)
create or replace function public.chat_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'nick', new.nick, 'body', new.body, 'created_at', new.created_at),
    'msg', 'foro', true
  );
  return null;
end $$;
drop trigger if exists chat_broadcast on public.chat_messages;
create trigger chat_broadcast after insert on public.chat_messages
  for each row execute function public.chat_broadcast();

-- El canal "foro" es privado: se puede escuchar con sesión, pero ningún navegador puede publicar en él
drop policy if exists "foro: escuchar" on realtime.messages;
create policy "foro: escuchar" on realtime.messages for select to authenticated
  using (realtime.topic() = 'foro' and extension = 'broadcast');

-- 5) Limpieza diaria (4:17 UTC): fuera lo de más de 90 días, y nunca más de 400.000 mensajes
create extension if not exists pg_cron;
select cron.unschedule('foro-limpieza') where exists (select 1 from cron.job where jobname = 'foro-limpieza');
select cron.schedule('foro-limpieza', '17 4 * * *', $$
  delete from public.chat_messages where created_at < now() - interval '90 days';
  delete from public.chat_messages where id < (
    select id from public.chat_messages order by id desc offset 400000 limit 1
  );
$$);

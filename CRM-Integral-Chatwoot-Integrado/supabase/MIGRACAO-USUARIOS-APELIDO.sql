-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO DE USUÁRIOS / APELIDO
-- Execute no SQL Editor do Supabase ATUAL.
-- Não apaga usuários existentes.
-- ============================================================

alter table public.profiles
add column if not exists apelido text;

create unique index if not exists profiles_apelido_uidx
on public.profiles (lower(apelido))
where apelido is not null;

alter table public.profiles
drop constraint if exists profiles_apelido_format_check;

alter table public.profiles
add constraint profiles_apelido_format_check
check (
  apelido is null
  or (
    char_length(apelido) between 3 and 30
    and apelido = lower(apelido)
    and apelido ~ '^[a-z0-9._-]+$'
  )
);

-- Garante que administradores possam editar o apelido
-- usando as policies atuais de profiles.
grant select, update on public.profiles to authenticated;

-- Usuários existentes continuam acessando por e-mail até que
-- um administrador defina um apelido para eles.

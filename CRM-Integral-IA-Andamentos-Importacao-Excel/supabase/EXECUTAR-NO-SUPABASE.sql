-- ============================================================
-- CRM INTEGRAL — SCRIPT ÚNICO DE ATUALIZAÇÃO
-- Execute no SQL Editor do projeto Supabase ATUAL (produção).
-- Idempotente: pode ser executado quantas vezes forem necessárias,
-- sem apagar dados existentes.
--
-- Este script junta, em ordem segura, as duas migrações pendentes:
--   1) Usuários / apelido (login por nome de usuário)
--   2) Projetos / Núcleos / Andamentos / vínculo com Marketing
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) USUÁRIOS — APELIDO / NOME DE USUÁRIO
-- ------------------------------------------------------------
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

grant select, update on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 2) PROJETOS / NÚCLEOS / ANDAMENTOS / MARKETING
-- ------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists public.projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text not null,
  estado text not null check (char_length(estado) = 2),
  ativo boolean not null default true,
  observacoes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clientes add column if not exists projeto_id uuid references public.projetos(id) on delete set null;
alter table public.clientes add column if not exists estado text;

create table if not exists public.andamentos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  status text not null check (status in (
    'Topografia',
    'Projeto',
    'Protocolado',
    'Correções para Prefeitura',
    'Registro de Imóveis',
    'Concluído',
    'Outros'
  )),
  descricao_cliente text not null,
  observacao_interna text,
  visivel_ia boolean not null default true,
  data_atualizacao date not null default current_date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_projetos add column if not exists projeto_id uuid references public.projetos(id) on delete cascade;

create unique index if not exists projetos_nome_cidade_estado_uidx
  on public.projetos (lower(nome), lower(cidade), upper(estado));

create index if not exists clientes_projeto_idx on public.clientes(projeto_id);
create index if not exists andamentos_projeto_idx on public.andamentos(projeto_id);
create index if not exists andamentos_data_idx on public.andamentos(data_atualizacao desc);
create index if not exists andamentos_visivel_ia_idx on public.andamentos(visivel_ia) where visivel_ia = true;
create unique index if not exists marketing_projetos_projeto_uidx
  on public.marketing_projetos(projeto_id) where projeto_id is not null;

drop trigger if exists projetos_updated_at on public.projetos;
create trigger projetos_updated_at before update on public.projetos
for each row execute function public.set_updated_at();

drop trigger if exists andamentos_updated_at on public.andamentos;
create trigger andamentos_updated_at before update on public.andamentos
for each row execute function public.set_updated_at();

alter table public.projetos enable row level security;
alter table public.andamentos enable row level security;

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname
           from pg_policies
           where schemaname='public' and tablename in ('projetos','andamentos')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy projetos_select on public.projetos
for select to authenticated using (true);

create policy projetos_insert on public.projetos
for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());

create policy projetos_update on public.projetos
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy projetos_delete on public.projetos
for delete to authenticated
using (public.is_admin());

create policy andamentos_select on public.andamentos
for select to authenticated using (true);

create policy andamentos_insert on public.andamentos
for insert to authenticated
with check (created_by = auth.uid());

create policy andamentos_update on public.andamentos
for update to authenticated
using (created_by = auth.uid() or public.is_admin())
with check (created_by = auth.uid() or public.is_admin());

create policy andamentos_delete on public.andamentos
for delete to authenticated
using (created_by = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.projetos to authenticated;
grant select, insert, update, delete on public.andamentos to authenticated;
grant select, insert, update, delete on public.marketing_projetos to authenticated;

commit;

-- ============================================================
-- OPCIONAL — migrar cadastros legados (município + núcleo) para Projetos
-- Fica comentado de propósito: revise o "estado" antes de rodar,
-- pois o placeholder abaixo assume 'SC' quando o cliente não tiver
-- estado preenchido.
-- ============================================================
-- insert into public.projetos (nome, cidade, estado, created_by)
-- select distinct c.nucleo, c.municipio, coalesce(nullif(c.estado,''),'SC'), c.created_by
-- from public.clientes c
-- where c.nucleo is not null and c.municipio is not null
-- on conflict do nothing;
--
-- update public.clientes c
-- set projeto_id = p.id
-- from public.projetos p
-- where c.projeto_id is null
--   and lower(p.nome) = lower(c.nucleo)
--   and lower(p.cidade) = lower(c.municipio);
-- ============================================================

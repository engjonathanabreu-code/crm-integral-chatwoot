-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO PROJETOS / ANDAMENTOS / MARKETING
-- Aplicar no projeto Supabase ATUAL após publicar a nova versão na Vercel.
-- É idempotente: pode ser executado novamente com segurança.
-- ============================================================

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

-- Atualiza timestamp
drop trigger if exists projetos_updated_at on public.projetos;
create trigger projetos_updated_at before update on public.projetos
for each row execute function public.set_updated_at();

drop trigger if exists andamentos_updated_at on public.andamentos;
create trigger andamentos_updated_at before update on public.andamentos
for each row execute function public.set_updated_at();

-- RLS
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

-- Projetos podem ser consultados por usuários autenticados.
-- Administração cria/edita projetos.
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

-- Andamentos são consultáveis pela equipe autenticada;
-- registros são criados pela própria equipe.
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

-- O Controle de Marketing agora pode carregar projeto_id.
grant select, insert, update, delete on public.marketing_projetos to authenticated;

-- ============================================================
-- MIGRAÇÃO OPCIONAL DOS DADOS LEGADOS
-- Cria projetos a partir das combinações município + núcleo já cadastradas.
-- O estado é preenchido como 'SC' APENAS como placeholder quando não houver
-- estado no cadastro legado. Revise antes de usar em produção.
-- ============================================================
-- IMPORTANTE: deixamos este bloco COMENTADO para não presumir o estado.
--
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

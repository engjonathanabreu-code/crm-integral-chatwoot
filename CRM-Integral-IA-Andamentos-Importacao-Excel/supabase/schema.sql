-- ============================================================
-- CRM INTEGRAL PROFISSIONAL — SUPABASE
-- Execute no SQL Editor de um projeto novo.
-- ============================================================

create extension if not exists pgcrypto;

-- PERFIS VINCULADOS AO SUPABASE AUTH
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  apelido text,
  perfil text not null default 'usuario' check (perfil in ('admin', 'usuario', 'marketing', 'comercial')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_apelido_uidx
  on public.profiles (lower(apelido))
  where apelido is not null;

-- CLIENTES / LEADS
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  nome text not null,
  telefone text,
  email text,
  municipio text,
  nucleo text,
  remessa text,
  origem text,
  status text not null default 'Novo' check (status in ('Novo', 'Contato feito', 'Proposta enviada', 'Negociação', 'Cliente Ativo', 'Perdido')),
  valor_estimado numeric(14,2) not null default 0,
  responsavel text,
  observacoes text,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- PROJETOS / NÚCLEOS URBANOS
create table if not exists public.projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text not null,
  estado text not null check (char_length(estado) = 2),
  sigla text,
  ativo boolean not null default true,
  observacoes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projetos add column if not exists sigla text;
-- A sigla NÃO precisa ser única: projetos diferentes podem compartilhar o mesmo código/prefixo de processo.

alter table public.clientes add column if not exists projeto_id uuid references public.projetos(id) on delete set null;
alter table public.clientes add column if not exists estado text;
alter table public.clientes add column if not exists telefone_normalizado text;
alter table public.clientes add column if not exists chatwoot_contact_id bigint;
alter table public.clientes add column if not exists chatwoot_last_conversation_id bigint;
alter table public.clientes add column if not exists ultimo_setor text;
alter table public.clientes add column if not exists ultimo_agente text;
alter table public.clientes add column if not exists comercial_id uuid references public.profiles(id);
create index if not exists clientes_comercial_id_idx on public.clientes (comercial_id);
-- comercial_id: agente comercial responsável pelo cliente no Funil comercial,
-- atribuído pelo Admin ou por quem cadastrou o cliente (created_by).
alter table public.projetos add column if not exists comercial_ids uuid[] not null default '{}'::uuid[];
-- comercial_ids: comerciais responsáveis por todo o núcleo/projeto — os
-- clientes vinculados a ele (clientes.projeto_id) aparecem no Funil
-- comercial de cada um, além do comercial_id direto do cliente.
alter table public.clientes add column if not exists canal text default 'CRM';
alter table public.clientes add column if not exists codigo_processo text;
alter table public.clientes add column if not exists estado_civil text;
alter table public.clientes add column if not exists tipo_documental text;
alter table public.clientes add column if not exists contrato_status text;
alter table public.clientes add column if not exists procuracao_status text;
alter table public.clientes add column if not exists requerimento_status text;
alter table public.clientes add column if not exists distrato_status text;
alter table public.clientes add column if not exists documento_faltante text;
alter table public.clientes add column if not exists informacao_faltante text;
alter table public.clientes add column if not exists observacao_documental text;
alter table public.clientes add column if not exists situacao_documental text;
alter table public.clientes add column if not exists importacao_origem text;
alter table public.clientes add column if not exists cpf text;
alter table public.clientes add column if not exists endereco text;
alter table public.clientes add column if not exists tipo_imovel text;
alter table public.clientes add column if not exists tipo_posse text;
alter table public.clientes add column if not exists area_posse text;
create unique index if not exists clientes_codigo_processo_uidx on public.clientes(codigo_processo) where codigo_processo is not null;
drop index if exists public.clientes_telefone_normalizado_uidx;
create index if not exists clientes_telefone_normalizado_idx on public.clientes(telefone_normalizado) where telefone_normalizado is not null;
create index if not exists clientes_chatwoot_contact_idx on public.clientes(chatwoot_contact_id) where chatwoot_contact_id is not null;

create table if not exists public.andamentos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  status text not null check (status in ('Topografia','Projeto','Protocolado','Correções para Prefeitura','Registro de Imóveis','Concluído','Outros')),
  descricao_cliente text not null,
  observacao_interna text,
  visivel_ia boolean not null default true,
  data_atualizacao date not null default current_date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CAMPOS ESTRUTURADOS PARA CONSULTA DO AGENTE IA
alter table public.andamentos add column if not exists status_operacional text not null default 'Em andamento';
alter table public.andamentos add column if not exists previsao date;
alter table public.andamentos add column if not exists orientacao_ia text;
alter table public.andamentos add column if not exists fonte text not null default 'CRM';
create index if not exists andamentos_projeto_visivel_data_idx
  on public.andamentos(projeto_id, visivel_ia, data_atualizacao desc, created_at desc);

-- ATENDIMENTOS
create table if not exists public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_by uuid references public.profiles(id),
  setor text not null check (setor in ('Atendimento', 'Comercial', 'Financeiro', 'Projetos', 'Topografia', 'Pós-Protocolo')),
  assunto text not null,
  motivo_contato text,
  status text not null default 'Aberto' check (status in ('Aberto', 'Em andamento', 'Resolvido')),
  observacao text,
  origem text not null default 'CRM',
  agente_nome text,
  chatwoot_conversation_id bigint,
  iniciado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists atendimentos_chatwoot_conversation_uidx
  on public.atendimentos(chatwoot_conversation_id) where chatwoot_conversation_id is not null;

-- INTERAÇÕES / MENSAGENS (CHATWOOT + CRM)
create table if not exists public.interacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  atendimento_id uuid references public.atendimentos(id) on delete set null,
  chatwoot_conversation_id bigint,
  chatwoot_message_id bigint,
  direcao text not null default 'sistema' check (direcao in ('entrada', 'saida', 'sistema')),
  autor_tipo text not null default 'Sistema' check (autor_tipo in ('Cliente', 'IA', 'Agente', 'Sistema')),
  autor_nome text,
  setor text,
  conteudo text,
  tipo_midia text not null default 'texto',
  evento text not null default 'mensagem',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists interacoes_chatwoot_message_uidx
  on public.interacoes(chatwoot_message_id) where chatwoot_message_id is not null;
create index if not exists interacoes_cliente_created_idx on public.interacoes(cliente_id, created_at desc);
create index if not exists interacoes_conversation_idx on public.interacoes(chatwoot_conversation_id) where chatwoot_conversation_id is not null;

-- TAREFAS
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  assigned_to uuid not null references public.profiles(id),
  titulo text not null,
  data date not null,
  prioridade text not null default 'Normal' check (prioridade in ('Normal', 'Alta', 'Urgente')),
  concluida boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- HISTÓRICO E ATUALIZAÇÕES
create table if not exists public.historico (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  tipo text not null,
  descricao text not null,
  created_at timestamptz not null default now()
);

-- Garante que instalações já existentes (criadas antes do perfil "marketing")
-- também aceitem o novo valor.
alter table public.profiles drop constraint if exists profiles_perfil_check;
alter table public.profiles add constraint profiles_perfil_check check (perfil in ('admin', 'usuario', 'marketing', 'comercial'));

-- CONTROLE DE MARKETING (jornada do cliente por município)
create table if not exists public.marketing_etapas (
  id uuid primary key default gen_random_uuid(),
  fase_numero int not null,
  fase_nome text not null,
  codigo text not null unique,
  ordem int not null,
  titulo text not null,
  descricao text
);

create table if not exists public.marketing_projetos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references public.projetos(id) on delete cascade,
  municipio text not null,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_progresso (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.marketing_projetos(id) on delete cascade,
  etapa_id uuid not null references public.marketing_etapas(id) on delete cascade,
  concluida boolean not null default false,
  concluida_em timestamptz,
  concluida_por uuid references public.profiles(id),
  observacao text,
  updated_at timestamptz not null default now(),
  unique (projeto_id, etapa_id)
);

insert into public.marketing_etapas (fase_numero, fase_nome, codigo, ordem, titulo, descricao) values
  (1, 'Fase Comercial', '1', 1, 'Atendimento e fechamento', 'Atendimento, apresentação da solução e fechamento do serviço.'),
  (2, 'Criação do Grupo de WhatsApp', '2.1', 2, 'Mensagem de boas-vindas', 'Mensagem de boas-vindas explicando os próximos passos.'),
  (2, 'Criação do Grupo de WhatsApp', '2.2', 3, 'Divulgação das redes sociais', 'Publicação para acessar nossas redes sociais e acompanhar por lá.'),
  (2, 'Criação do Grupo de WhatsApp', '2.3', 4, 'Divulgação do acervo técnico', 'Publicação para visualizarem nosso site de acervo técnico.'),
  (2, 'Criação do Grupo de WhatsApp', '2.4', 5, 'Revisão de documentos', 'Etapa de revisão dos documentos apresentados finalizada e aprovada pelo setor técnico.'),
  (2, 'Criação do Grupo de WhatsApp', '2.5', 6, 'Pesquisa de satisfação', 'Pesquisa de satisfação da fase de criação do grupo.'),
  (3, 'Contato para Topografia', '3.1', 7, 'Aviso da etapa', 'O que você precisa saber dessa etapa.'),
  (3, 'Contato para Topografia', '3.2', 8, 'Trabalho de campo', 'Estamos em campo medindo os terrenos.'),
  (3, 'Contato para Topografia', '3.3', 9, 'Confirmação do LEPAC', 'Entraremos em contato para confirmar o LEPAC.'),
  (3, 'Contato para Topografia', '3.4', 10, 'Pesquisa de satisfação', 'Pesquisa de satisfação da etapa de topografia.'),
  (4, 'Etapa Projetos', '4.1', 11, 'Aviso da etapa', 'O que você precisa saber dessa etapa.'),
  (4, 'Etapa Projetos', '4.2', 12, 'Projeto protocolado', 'Projeto completo e protocolado.'),
  (5, 'Pós Protocolo e Atualizações', '5.1', 13, 'Aviso da etapa', 'O que você precisa saber dessa etapa.'),
  (5, 'Pós Protocolo e Atualizações', '5.2', 14, 'Atualizações mensais', 'Atualizações mensais dos grupos.'),
  (5, 'Pós Protocolo e Atualizações', '5.3', 15, 'Pesquisa de satisfação final', 'Pesquisa de satisfação do trabalho.')
on conflict (codigo) do nothing;

create index if not exists clientes_owner_idx on public.clientes(owner_id);
create index if not exists clientes_municipio_idx on public.clientes(municipio);
create index if not exists clientes_status_idx on public.clientes(status);
create index if not exists atendimentos_cliente_idx on public.atendimentos(cliente_id);
create index if not exists atendimentos_setor_idx on public.atendimentos(setor);
create index if not exists tarefas_cliente_idx on public.tarefas(cliente_id);
create index if not exists tarefas_assigned_idx on public.tarefas(assigned_to);
create index if not exists historico_cliente_idx on public.historico(cliente_id);
create index if not exists marketing_progresso_projeto_idx on public.marketing_progresso(projeto_id);
create index if not exists marketing_progresso_etapa_idx on public.marketing_progresso(etapa_id);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and perfil = 'admin' and ativo = true
  );
$$;

create or replace function public.can_access_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.clientes
    where id = target_client and owner_id = auth.uid()
  );
$$;

create or replace function public.is_marketing_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and perfil in ('admin', 'marketing') and ativo = true
  );
$$;

-- Quando um projeto de marketing é criado, gera automaticamente uma linha de
-- progresso para cada etapa fixa da jornada do cliente.
create or replace function public.seed_marketing_progresso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.marketing_progresso (projeto_id, etapa_id)
  select new.id, e.id from public.marketing_etapas e
  on conflict (projeto_id, etapa_id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, perfil, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(coalesce(new.email, 'usuario'), '@', 1)),
    'usuario',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.touch_client_last_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clientes
  set last_contact_at = greatest(coalesce(last_contact_at, '-infinity'::timestamptz), new.created_at)
  where id = new.cliente_id;
  return new;
end;
$$;

create or replace function public.touch_client_from_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clientes
  set last_contact_at = greatest(coalesce(last_contact_at, '-infinity'::timestamptz), new.created_at)
  where id = new.cliente_id;
  return new;
end;
$$;

-- Triggers de atualização
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists clientes_updated_at on public.clientes;
create trigger clientes_updated_at before update on public.clientes for each row execute function public.set_updated_at();

drop trigger if exists atendimentos_updated_at on public.atendimentos;
create trigger atendimentos_updated_at before update on public.atendimentos for each row execute function public.set_updated_at();

drop trigger if exists tarefas_updated_at on public.tarefas;
create trigger tarefas_updated_at before update on public.tarefas for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists atendimento_updates_last_contact on public.atendimentos;
create trigger atendimento_updates_last_contact after insert on public.atendimentos for each row execute function public.touch_client_last_contact();

drop trigger if exists history_updates_last_contact on public.historico;
create trigger history_updates_last_contact after insert on public.historico for each row execute function public.touch_client_from_history();

drop trigger if exists marketing_projetos_updated_at on public.marketing_projetos;
create trigger marketing_projetos_updated_at before update on public.marketing_projetos for each row execute function public.set_updated_at();

drop trigger if exists marketing_progresso_updated_at on public.marketing_progresso;
create trigger marketing_progresso_updated_at before update on public.marketing_progresso for each row execute function public.set_updated_at();

drop trigger if exists marketing_projeto_seed on public.marketing_projetos;
create trigger marketing_projeto_seed after insert on public.marketing_projetos for each row execute function public.seed_marketing_progresso();

-- Cria perfis para usuários que já existam antes da execução do script.
insert into public.profiles (id, nome, perfil, ativo)
select
  id,
  coalesce(nullif(raw_user_meta_data ->> 'nome', ''), split_part(coalesce(email, 'usuario'), '@', 1)),
  'usuario',
  true
from auth.users
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY — SEGREGAÇÃO REAL DOS DADOS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.atendimentos enable row level security;
alter table public.tarefas enable row level security;
alter table public.historico enable row level security;
alter table public.interacoes enable row level security;
alter table public.marketing_etapas enable row level security;
alter table public.marketing_projetos enable row level security;
alter table public.marketing_progresso enable row level security;

-- Remove políticas anteriores para permitir reexecução.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('profiles','clientes','atendimentos','tarefas','historico','interacoes','marketing_etapas','marketing_projetos','marketing_progresso')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- PERFIS
create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- CLIENTES
create policy clientes_select on public.clientes
for select to authenticated
using (owner_id = auth.uid() or public.is_admin());

create policy clientes_insert on public.clientes
for insert to authenticated
with check (
  created_by = auth.uid()
  and (owner_id = auth.uid() or public.is_admin())
);

create policy clientes_update on public.clientes
for update to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

create policy clientes_delete on public.clientes
for delete to authenticated
using (owner_id = auth.uid() or public.is_admin());

-- ATENDIMENTOS
create policy atendimentos_select on public.atendimentos
for select to authenticated
using (public.can_access_client(cliente_id));

create policy atendimentos_insert on public.atendimentos
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_client(cliente_id));

create policy atendimentos_update on public.atendimentos
for update to authenticated
using (public.can_access_client(cliente_id))
with check (public.can_access_client(cliente_id));

create policy atendimentos_delete on public.atendimentos
for delete to authenticated
using (public.can_access_client(cliente_id));

-- TAREFAS
create policy tarefas_select on public.tarefas
for select to authenticated
using (public.can_access_client(cliente_id));

create policy tarefas_insert on public.tarefas
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_client(cliente_id)
  and (assigned_to = auth.uid() or public.is_admin())
);

create policy tarefas_update on public.tarefas
for update to authenticated
using (public.can_access_client(cliente_id))
with check (public.can_access_client(cliente_id));

create policy tarefas_delete on public.tarefas
for delete to authenticated
using (public.can_access_client(cliente_id));

-- HISTÓRICO
create policy historico_select on public.historico
for select to authenticated
using (public.can_access_client(cliente_id));

create policy historico_insert on public.historico
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_client(cliente_id));

create policy historico_update on public.historico
for update to authenticated
using (public.can_access_client(cliente_id))
with check (public.can_access_client(cliente_id));

create policy historico_delete on public.historico
for delete to authenticated
using (public.can_access_client(cliente_id));

-- INTERAÇÕES
create policy interacoes_select on public.interacoes
for select to authenticated
using (public.can_access_client(cliente_id));

-- Alterações de interações originadas do Chatwoot são feitas pelo backend com service role.

-- CONTROLE DE MARKETING
-- Somente administradores e o setor de marketing enxergam e preenchem esta aba.
create policy marketing_etapas_select on public.marketing_etapas
for select to authenticated
using (public.is_marketing_or_admin());

create policy marketing_projetos_select on public.marketing_projetos
for select to authenticated
using (public.is_marketing_or_admin());

create policy marketing_projetos_insert on public.marketing_projetos
for insert to authenticated
with check (public.is_marketing_or_admin() and created_by = auth.uid());

create policy marketing_projetos_update on public.marketing_projetos
for update to authenticated
using (public.is_marketing_or_admin())
with check (public.is_marketing_or_admin());

create policy marketing_projetos_delete on public.marketing_projetos
for delete to authenticated
using (public.is_marketing_or_admin());

create policy marketing_progresso_select on public.marketing_progresso
for select to authenticated
using (public.is_marketing_or_admin());

create policy marketing_progresso_update on public.marketing_progresso
for update to authenticated
using (public.is_marketing_or_admin())
with check (public.is_marketing_or_admin());

-- Permissões da Data API. O RLS continua sendo a proteção efetiva.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.clientes to authenticated;
grant select, insert, update, delete on public.atendimentos to authenticated;
grant select, insert, update, delete on public.tarefas to authenticated;
grant select, insert, update, delete on public.historico to authenticated;
grant select on public.interacoes to authenticated;
grant select on public.marketing_etapas to authenticated;
grant select, insert, update, delete on public.marketing_projetos to authenticated;
grant select, update on public.marketing_progresso to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;
grant execute on function public.is_marketing_or_admin() to authenticated;

-- ============================================================
-- PRIMEIRO ADMINISTRADOR
-- 1) Crie o usuário em Authentication > Users.
-- 2) Substitua o e-mail abaixo e execute apenas este UPDATE:
--
-- update public.profiles
-- set nome = 'Administrador Integral', perfil = 'admin', ativo = true
-- where id = (select id from auth.users where email = 'SEU_EMAIL@DOMINIO.COM');
-- ============================================================

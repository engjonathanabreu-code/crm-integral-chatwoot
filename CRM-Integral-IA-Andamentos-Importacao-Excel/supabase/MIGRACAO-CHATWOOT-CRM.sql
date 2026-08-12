-- CRM Integral — Integração Chatwoot / WhatsApp
begin;

alter table public.clientes add column if not exists telefone_normalizado text;
alter table public.clientes add column if not exists chatwoot_contact_id bigint;
alter table public.clientes add column if not exists chatwoot_last_conversation_id bigint;
alter table public.clientes add column if not exists ultimo_setor text;
alter table public.clientes add column if not exists ultimo_agente text;
alter table public.clientes add column if not exists canal text default 'CRM';
drop index if exists public.clientes_telefone_normalizado_uidx;
create index if not exists clientes_telefone_normalizado_idx on public.clientes(telefone_normalizado) where telefone_normalizado is not null;

alter table public.atendimentos drop constraint if exists atendimentos_setor_check;
alter table public.atendimentos add constraint atendimentos_setor_check check (setor in ('Atendimento','Comercial','Financeiro','Projetos','Topografia','Pós-Protocolo'));
alter table public.atendimentos alter column created_by drop not null;
alter table public.atendimentos add column if not exists motivo_contato text;
alter table public.atendimentos add column if not exists origem text not null default 'CRM';
alter table public.atendimentos add column if not exists agente_nome text;
alter table public.atendimentos add column if not exists chatwoot_conversation_id bigint;
alter table public.atendimentos add column if not exists iniciado_em timestamptz not null default now();
alter table public.atendimentos add column if not exists resolvido_em timestamptz;
create unique index if not exists atendimentos_chatwoot_conversation_uidx on public.atendimentos(chatwoot_conversation_id) where chatwoot_conversation_id is not null;

create table if not exists public.interacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  atendimento_id uuid references public.atendimentos(id) on delete set null,
  chatwoot_conversation_id bigint,
  chatwoot_message_id bigint,
  direcao text not null default 'sistema' check (direcao in ('entrada','saida','sistema')),
  autor_tipo text not null default 'Sistema' check (autor_tipo in ('Cliente','IA','Agente','Sistema')),
  autor_nome text,
  setor text,
  conteudo text,
  tipo_midia text not null default 'texto',
  evento text not null default 'mensagem',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists interacoes_chatwoot_message_uidx on public.interacoes(chatwoot_message_id) where chatwoot_message_id is not null;
create index if not exists interacoes_cliente_created_idx on public.interacoes(cliente_id, created_at desc);

alter table public.interacoes enable row level security;
drop policy if exists interacoes_select on public.interacoes;
create policy interacoes_select on public.interacoes for select to authenticated using (public.can_access_client(cliente_id));
grant select on public.interacoes to authenticated;

commit;

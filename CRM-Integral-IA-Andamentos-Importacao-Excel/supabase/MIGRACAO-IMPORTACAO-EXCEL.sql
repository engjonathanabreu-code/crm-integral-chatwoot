-- CRM Integral — Importação Excel / Dados Documental GTB
-- Pode ser executado com segurança no banco atual.

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

create unique index if not exists clientes_codigo_processo_uidx
  on public.clientes(codigo_processo)
  where codigo_processo is not null;

-- Um mesmo telefone pode estar vinculado a mais de um processo/cliente.
drop index if exists public.clientes_telefone_normalizado_uidx;
create index if not exists clientes_telefone_normalizado_idx
  on public.clientes(telefone_normalizado)
  where telefone_normalizado is not null;

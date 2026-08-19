-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: CAMPOS DO MODELO BENEFICIÁRIOS/NUI
-- Aplicar no SQL Editor do projeto Supabase ATUAL.
-- Idempotente: pode ser executado novamente com segurança.
--
-- Suporta o novo modelo de planilha de importação (ex.: Agrolândia),
-- com colunas CodigoNUI, Beneficiarios, Localizacao, Objeto, Posse e
-- AreaPosse — além do modelo Dados Documental GTB já existente.
-- ============================================================

alter table public.clientes add column if not exists cpf text;
alter table public.clientes add column if not exists endereco text;
alter table public.clientes add column if not exists tipo_imovel text;
alter table public.clientes add column if not exists tipo_posse text;
alter table public.clientes add column if not exists area_posse text;

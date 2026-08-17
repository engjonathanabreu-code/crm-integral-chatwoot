-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: SIGLA DO PROJETO (auto-detecção na importação)
-- Aplicar no SQL Editor do projeto Supabase ATUAL.
-- Idempotente: pode ser executado novamente com segurança.
--
-- Objetivo: permitir que a importação de Excel descubra sozinha o
-- Município/Estado de cada linha, a partir do prefixo do
-- CodigoProcesso (ex.: "GTB01" em "GTB01_0386", "AGM02" em "AGM02_0078"),
-- sem depender de o operador escolher manualmente o Projeto/NUI.
-- ============================================================

alter table public.projetos add column if not exists sigla text;

-- Garante que duas siglas iguais (ignorando maiúsc./minúsc.) não coexistam.
create unique index if not exists projetos_sigla_uidx
  on public.projetos (upper(sigla))
  where sigla is not null;

-- ------------------------------------------------------------
-- Depois de aplicar esta migração:
-- 1) Abra o CRM em Projetos/NUIs e edite cada projeto existente,
--    preenchendo o campo "Sigla / Prefixo do processo" com o
--    prefixo usado nos códigos daquele projeto (ex.: GTB01, AGM02).
-- 2) A partir daí, toda importação de planilha detecta o município
--    e o estado automaticamente linha a linha, sem exigir a escolha
--    manual de um único Projeto/NUI para o arquivo inteiro.
-- ------------------------------------------------------------

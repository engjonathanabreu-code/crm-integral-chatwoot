-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: SIGLA DE PROJETO DEIXA DE SER ÚNICA
-- Aplicar no SQL Editor do projeto Supabase ATUAL.
-- Idempotente: pode ser executado novamente com segurança.
--
-- Antes, dois projetos não podiam ter a mesma Sigla/Prefixo do
-- processo (ex.: dois projetos com sigla "AGM02"). Agora isso é
-- permitido — projetos diferentes podem compartilhar o mesmo código.
--
-- Efeito colateral: se dois (ou mais) projetos ativos usarem a mesma
-- sigla, a importação de Excel (que casa o prefixo do Código do
-- Processo com a sigla para preencher município/estado sozinha) passa
-- a escolher um projeto ativo entre os que baterem — se nenhum
-- estiver ativo, usa o primeiro encontrado. Ou seja: com siglas
-- repetidas, a detecção automática de município pode ficar ambígua.
-- ============================================================

drop index if exists public.projetos_sigla_uidx;

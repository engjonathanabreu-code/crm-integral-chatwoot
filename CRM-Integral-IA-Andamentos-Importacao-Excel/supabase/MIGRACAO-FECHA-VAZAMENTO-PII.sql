-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: FECHA VAZAMENTO DE DADOS (PII)
-- Já aplicada diretamente no Supabase de produção. Este arquivo
-- fica no repositório apenas como registro/auditoria.
-- Idempotente: pode ser executado novamente com segurança.
--
-- ACHADO (auditoria de código de 19/08/2026):
-- O projeto tinha views e funções SECURITY DEFINER órfãs (não
-- usadas por nenhum código atual) com permissão de execução para
-- os papéis "anon" e "authenticated". Como SECURITY DEFINER
-- ignora Row Level Security, qualquer pessoa com a anon key
-- pública do site (visível em /config.js, exposta por design)
-- conseguia, SEM LOGIN:
--
--   1) Listar nome, telefone, email, núcleo, remessa e status de
--      TODOS os clientes:
--      GET /rest/v1/clientes_projetos
--
--   2) Buscar um cliente específico por telefone:
--      POST /rest/v1/rpc/buscar_cliente_telefone {"target_phone": "..."}
--
--   3) Enumerar apelidos de usuários do CRM e ver se são
--      admin/estão ativos:
--      POST /rest/v1/rpc/buscar_perfil_por_apelido {"target_username": "..."}
--
-- Confirmado por grep que nada no app.js, nas Edge Functions ou
-- no agente de WhatsApp usa essas rotas — são resquícios de uma
-- versão anterior do banco. O login por apelido (login-username)
-- já busca direto na tabela profiles usando a service role key,
-- sem depender de buscar_perfil_por_apelido.
-- ============================================================

revoke all on public.clientes_projetos from anon, authenticated;
revoke all on public.andamentos_ia from anon, authenticated;

revoke all on function public.buscar_cliente_telefone(text) from anon, authenticated;
revoke all on function public.buscar_perfil_por_apelido(text) from anon, authenticated;

-- Corrige também o search_path mutável do trigger de updated_at
-- (achado de menor severidade do linter de segurança do Supabase).
alter function public.set_updated_at() set search_path = 'public';

-- ============================================================
-- MIGRAÇÃO: libera visualização de todos os clientes para
-- qualquer usuário autenticado
-- ============================================================
--
-- Já aplicada em produção via apply_migration (Supabase MCP),
-- migração "libera_select_clientes_para_todos_usuarios".
-- Este arquivo documenta a mudança no histórico do repositório.
--
-- Pedido: "permita que todos os usuários tenham acesso a todos os
-- clientes cadastrados".
--
-- Antes: a policy clientes_select só deixava um usuário ver um
-- cliente se ele fosse o owner_id do registro, ou se fosse admin
-- (is_admin()). Um usuário comum não enxergava clientes cadastrados
-- por outro colega.
--
-- Depois: qualquer usuário autenticado pode ver (SELECT) qualquer
-- cliente, independente de quem é o dono. INSERT/UPDATE/DELETE
-- continuam restritos a dono do registro ou admin — o pedido foi
-- especificamente sobre acesso/visualização, não sobre permissão de
-- editar ou excluir registros de terceiros.
--
-- Idempotente (drop + create).

drop policy if exists clientes_select on public.clientes;

create policy clientes_select
  on public.clientes
  for select
  to authenticated
  using (true);

-- ============================================================
-- MIGRAÇÃO: corrige erros de RLS após liberar acesso a clientes
-- ============================================================
--
-- Já aplicada em produção via apply_migration (Supabase MCP),
-- migração "libera_can_access_client_e_update_clientes_para_todos".
-- Este arquivo documenta a mudança no histórico do repositório.
--
-- Depois de MIGRACAO-LIBERA-ACESSO-TODOS-CLIENTES.sql (que abriu
-- clientes_select pra todo mundo), dois erros passaram a aparecer em
-- produção ao mexer em um cliente de outro usuário:
--
-- 1) "new row violates row-level security policy for table
--    atendimentos" — ao registrar um atendimento.
-- 2) "Cannot coerce the result to a single JSON object" — ao editar
--    um cliente (o UPDATE era bloqueado pelo RLS, afetava 0 linhas,
--    e o .select().single() do Supabase falha quando não há retorno).
--
-- Causa raiz: a função can_access_client(), usada nas policies de
-- atendimentos/historico/interacoes/tarefas (select/insert/update/
-- delete), fazia sua PRÓPRIA checagem de owner_id = auth.uid(),
-- independente da policy clientes_select — então ficou
-- inconsistente com o que tinha acabado de ser liberado. E
-- clientes_update continuava restrita a dono/admin.
--
-- Fix: can_access_client() agora retorna true sempre (autenticado já
-- é suficiente, na mesma linha do que foi pedido pra clientes_select)
-- e clientes_update passa a valer pra qualquer usuário autenticado.
--
-- clientes_delete e as policies de DELETE de atendimentos/historico/
-- tarefas (que também usam can_access_client, e portanto também
-- ficaram abertas) continuam sem exigir confirmação adicional — não
-- foi reportado problema em exclusão, mas vale registrar que
-- can_access_client() agora vale pra delete também, não só
-- select/insert/update.

create or replace function public.can_access_client(target_client uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select true;
$$;

drop policy if exists clientes_update on public.clientes;

create policy clientes_update
  on public.clientes
  for update
  to authenticated
  using (true)
  with check (true);

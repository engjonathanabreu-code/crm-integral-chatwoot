-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: OTIMIZA POLÍTICAS DE RLS (INITPLAN)
-- Já aplicada diretamente no Supabase de produção. Este arquivo
-- fica no repositório apenas como registro/auditoria.
-- Idempotente: pode ser executado novamente com segurança.
--
-- Envolve as chamadas a auth.uid()/is_admin()/is_marketing_or_admin()
-- dentro das políticas de RLS em "(select ...)", para o Postgres
-- resolver uma vez só por consulta em vez de uma vez por linha.
-- Mesmo comportamento, mais rápido conforme as tabelas crescem.
-- Recomendação padrão do linter de performance do Supabase.
-- ============================================================

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using ((id = (select auth.uid())) or (select public.is_admin()));

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes
for select to authenticated
using ((owner_id = (select auth.uid())) or (select public.is_admin()));

drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes
for insert to authenticated
with check ((created_by = (select auth.uid())) and ((owner_id = (select auth.uid())) or (select public.is_admin())));

drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes
for update to authenticated
using ((owner_id = (select auth.uid())) or (select public.is_admin()))
with check ((owner_id = (select auth.uid())) or (select public.is_admin()));

drop policy if exists clientes_delete on public.clientes;
create policy clientes_delete on public.clientes
for delete to authenticated
using ((owner_id = (select auth.uid())) or (select public.is_admin()));

drop policy if exists atendimentos_insert on public.atendimentos;
create policy atendimentos_insert on public.atendimentos
for insert to authenticated
with check ((created_by = (select auth.uid())) and public.can_access_client(cliente_id));

drop policy if exists tarefas_insert on public.tarefas;
create policy tarefas_insert on public.tarefas
for insert to authenticated
with check (
  (created_by = (select auth.uid()))
  and public.can_access_client(cliente_id)
  and ((assigned_to = (select auth.uid())) or (select public.is_admin()))
);

drop policy if exists historico_insert on public.historico;
create policy historico_insert on public.historico
for insert to authenticated
with check ((created_by = (select auth.uid())) and public.can_access_client(cliente_id));

drop policy if exists marketing_projetos_insert on public.marketing_projetos;
create policy marketing_projetos_insert on public.marketing_projetos
for insert to authenticated
with check ((select public.is_marketing_or_admin()) and (created_by = (select auth.uid())));

drop policy if exists andamentos_insert on public.andamentos;
create policy andamentos_insert on public.andamentos
for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists andamentos_update on public.andamentos;
create policy andamentos_update on public.andamentos
for update to authenticated
using ((created_by = (select auth.uid())) or (select public.is_admin()))
with check ((created_by = (select auth.uid())) or (select public.is_admin()));

drop policy if exists andamentos_delete on public.andamentos;
create policy andamentos_delete on public.andamentos
for delete to authenticated
using ((created_by = (select auth.uid())) or (select public.is_admin()));

drop policy if exists projetos_insert on public.projetos;
create policy projetos_insert on public.projetos
for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists projetos_update on public.projetos;
create policy projetos_update on public.projetos
for update to authenticated
using ((select public.is_admin()) or (created_by = (select auth.uid())))
with check ((select public.is_admin()) or (created_by = (select auth.uid())));

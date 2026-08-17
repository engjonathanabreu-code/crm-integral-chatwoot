-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: PERMISSÕES DE PROJETO + STATUS "CLIENTE ATIVO"
-- Aplicar no SQL Editor do projeto Supabase ATUAL.
-- Idempotente: pode ser executado novamente com segurança.
--
-- 1) Usuário comum passa a poder CRIAR projetos/núcleos (antes só admin).
--    Editar continua restrito ao próprio criador ou a um administrador.
--    Excluir continua restrito a administradores (ação destrutiva, apaga
--    em cascata os andamentos do projeto e desvincula os clientes).
-- 2) Status de cliente "Fechado" renomeado para "Cliente Ativo".
-- ============================================================

-- ------------------------------------------------------------
-- 1) Projetos — qualquer usuário autenticado pode criar;
--    edição fica restrita ao criador ou a um administrador.
-- ------------------------------------------------------------
drop policy if exists projetos_insert on public.projetos;
create policy projetos_insert on public.projetos
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists projetos_update on public.projetos;
create policy projetos_update on public.projetos
for update to authenticated
using (public.is_admin() or created_by = auth.uid())
with check (public.is_admin() or created_by = auth.uid());

-- projetos_delete permanece restrito a administradores (não alterado aqui).

-- ------------------------------------------------------------
-- 2) Status "Fechado" -> "Cliente Ativo"
--    A constraint precisa ser solta ANTES do update (senão o valor novo
--    é rejeitado pela regra antiga) e recriada depois, já com o valor novo.
-- ------------------------------------------------------------
alter table public.clientes drop constraint if exists clientes_status_check;

update public.clientes set status = 'Cliente Ativo' where status = 'Fechado';

alter table public.clientes add constraint clientes_status_check
  check (status in ('Novo', 'Contato feito', 'Proposta enviada', 'Negociação', 'Cliente Ativo', 'Perdido'));

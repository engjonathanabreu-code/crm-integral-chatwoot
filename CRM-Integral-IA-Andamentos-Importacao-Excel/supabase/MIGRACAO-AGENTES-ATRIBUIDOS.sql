-- ============================================================
-- MIGRAÇÃO: clientes.agentes_atribuidos (múltiplos agentes)
-- ============================================================
--
-- Já aplicada em produção via apply_migration (Supabase MCP),
-- migração "adiciona_agentes_atribuidos_em_clientes". Este arquivo
-- documenta a mudança no histórico do repositório.
--
-- Pedido: "ao um agente fazer um registro de Atendimento, o cliente
-- também deve ficar atribuido a ele e ao agente comercial, um cliente
-- pode ficar atribuido a mais de um agente".
--
-- Novo campo, separado do "Dono do registro" (owner_id, único) e do
-- "Comercial" (comercial_id, único): uma lista de agentes atribuídos
-- ao cliente, que pode ter vários nomes.
alter table public.clientes
  add column if not exists agentes_atribuidos uuid[] not null default '{}'::uuid[];

create index if not exists clientes_agentes_atribuidos_gin
  on public.clientes using gin (agentes_atribuidos);

-- Implementado no app.js:
-- - attributeAgentToClient(clienteId): chamada depois de registrar um
--   Atendimento (saveTicket e saveStandaloneTicket) — adiciona quem
--   registrou + o comercial_id do cliente (se houver) à lista, sem
--   duplicar e sem apagar quem já estava lá.
-- - canManageAssignedAgents(client): mesma regra de
--   canAssignComercial — só Admin ou quem cadastrou o cliente pode
--   editar a lista manualmente.
-- - Novo campo "Agentes atribuídos" (multi-select) no formulário de
--   cliente, desabilitado para quem não pode editar.
-- - Exibido na ficha do cliente, logo abaixo de "Comercial".
-- - describeClientChanges() registra no histórico quando a lista
--   muda (nomes antes → depois).

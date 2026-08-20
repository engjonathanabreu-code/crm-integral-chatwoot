-- ============================================================
-- MIGRAÇÃO: papel "Comercial" e clientes.comercial_id
-- ============================================================
--
-- Já aplicada em produção via apply_migration (Supabase MCP),
-- migração "cria_papel_comercial_e_campo_comercial_id". Este arquivo
-- documenta a mudança no histórico do repositório.
--
-- Pedido: o Funil comercial não deve ser filtrado pelo "último
-- agente" que trocou mensagem no WhatsApp (ultimo_agente, que reflete
-- o Chatwoot e pode mudar a qualquer momento). Em vez disso, cada
-- cliente precisa ficar atrelado a um Comercial (agente comercial)
-- de forma persistente. O Comercial tem as mesmas permissões de um
-- usuário comum (mesma RLS) — é só um rótulo diferente, para
-- distinguir quem pode ser atribuído como responsável comercial de
-- um cliente. A atribuição só pode ser feita pelo Admin ou por quem
-- cadastrou o cliente (created_by).
--
-- Novo papel "comercial" (mesma capacidade de "usuario").
alter table public.profiles
  drop constraint if exists profiles_perfil_check;

alter table public.profiles
  add constraint profiles_perfil_check
  check (perfil = any (array['admin','usuario','marketing','comercial']));

-- Novo campo em clientes: comercial responsável, separado do "Dono
-- do registro" (owner_id).
alter table public.clientes
  add column if not exists comercial_id uuid references public.profiles(id);

create index if not exists clientes_comercial_id_idx
  on public.clientes (comercial_id);

-- Implementado no app.js:
-- - canAssignComercial(client): true se admin, ou se
--   client.created_by === usuário logado (ou cliente novo).
-- - Campo "Comercial" no formulário de cliente (select), desabilitado
--   quando o usuário não pode atribuir/trocar.
-- - clientHasComercial() (antes clientAssignedToHumanAgent, que
--   checava ultimo_agente) agora checa client.comercial_id — usado
--   para filtrar Funil comercial e Atendimentos.
-- - Novo filtro "Comercial" no Funil comercial (pipelineComercialFilter).
-- - "Comercial" adicionado como opção de perfil na tela Usuários e na
--   criação de usuário (Edge Function admin-create-user também
--   atualizada e redeployada para aceitar "comercial" no allowlist,
--   senão seria silenciosamente rebaixado para "usuario").

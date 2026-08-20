-- ============================================================
-- MIGRAÇÃO: padroniza capitalização de clientes.nome
-- ============================================================
--
-- Já aplicada em produção via apply_migration (Supabase MCP),
-- migração "padroniza_capitalizacao_nomes_clientes". Este arquivo
-- documenta a mudança no histórico do repositório.
--
-- Pedido: "padronize a forma como o nome é demonstrado, primeira
-- letra Maiúscula e demais minúscula".
--
-- 259 de 692 clientes tinham nome em CAIXA ALTA, minúsculo, ou
-- capitalização mista (ex.: "MARIA EUGÊNIA GEGE", "joão da silva").
-- Corrigido para "Maria Eugênia Gege" / "João Da Silva" usando
-- initcap(), que já lida bem com acentos, hífen e múltiplos nomes
-- separados por "; " (caso de beneficiários da importação de
-- Excel modelo NUI).
--
-- A mesma regra (primeira letra de cada palavra maiúscula, resto
-- minúsculo) foi implementada em código para ficar padronizada daqui
-- pra frente, em todos os pontos de entrada:
-- - app.js: titleCaseName() — aplicada na exibição (clientDisplayName,
--   usada em lista, kanban, ficha do cliente, buscas) e no salvamento
--   manual (saveClient) e na importação de Excel (ambos os modelos:
--   Documental GTB e Beneficiários/NUI).
-- - api/chatwoot-sync.js: titleCaseName() — aplicada em extractName(),
--   usada quando o cliente é criado/atualizado a partir do WhatsApp
--   (não afeta o fallback "Contato WhatsApp", que não é nome de pessoa).
--
-- Idempotente (só atualiza linhas que realmente mudam).

update public.clientes
set nome = initcap(nome)
where nome is not null
  and nome <> initcap(nome);

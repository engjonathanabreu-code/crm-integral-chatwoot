-- ============================================================
-- MIGRAÇÃO: clientes importados via Excel viram Cliente Ativo
-- ============================================================
--
-- Já aplicada em produção via apply_migration (Supabase MCP),
-- migração "marca_clientes_importados_excel_como_ativos". Este
-- arquivo documenta a mudança no histórico do repositório.
--
-- Pedido: sempre que um cliente for importado por planilha Excel,
-- ele deve entrar como "Cliente Ativo" (não "Contato feito", que é o
-- estágio de funil para leads via WhatsApp/cadastro manual — um
-- cliente vindo de planilha já é um cliente real da base, não um lead
-- em prospecção).
--
-- Backfill: 612 clientes já importados no passado (origem =
-- 'Importação Excel'), todos com status 'Contato feito', viraram
-- 'Cliente Ativo'.
update public.clientes
set status = 'Cliente Ativo'
where origem = 'Importação Excel'
  and status <> 'Cliente Ativo';

-- Implementado no app.js: importPayloadFromRow() agora usa
-- status: "Cliente Ativo" (antes "Contato feito") para todo cliente
-- novo criado pela importação de Excel, nos dois modelos (GTB e
-- Beneficiários/NUI).

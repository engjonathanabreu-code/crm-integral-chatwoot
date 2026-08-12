# Integração Chatwoot → CRM Integral

Esta versão já está preparada para receber eventos do Chatwoot em tempo real.

## 1. Banco de dados

Se o Supabase ainda não foi configurado, execute `supabase/schema.sql`.

Se o banco atual já existe, execute somente:

`supabase/MIGRACAO-CHATWOOT-CRM.sql`

## 2. Variáveis na Vercel

Configure no projeto do CRM:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRM_INTEGRATION_OWNER_ID`
- `CRM_CHATWOOT_SYNC_SECRET`

`CRM_INTEGRATION_OWNER_ID` deve ser o UUID de um usuário existente em `public.profiles`; contatos criados automaticamente pelo WhatsApp ficarão inicialmente vinculados a esse usuário.

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no navegador. Ela é usada apenas pela função `/api/chatwoot-sync`.

## 3. Endpoint de sincronização

Após publicar na Vercel:

`POST https://SEU-DOMINIO/api/chatwoot-sync`

Cabeçalho obrigatório:

`Authorization: Bearer <CRM_CHATWOOT_SYNC_SECRET>`

O body deve ser o payload recebido do webhook do Chatwoot.

## 4. O que é sincronizado

- Cliente localizado pelo telefone normalizado.
- Cliente criado automaticamente quando não existir.
- Nome e cidade coletados pela IA.
- Último setor e último agente.
- Atendimento vinculado ao `chatwoot_conversation_id`.
- Motivo do contato.
- Mensagens do cliente, IA e agentes na tabela `interacoes`.
- Deduplicação por `chatwoot_message_id`.
- Encerramento do atendimento quando a conversa é marcada como `resolved`.

## 5. Próxima etapa

No projeto do Agente IA, encaminhar o mesmo payload recebido em `/api/webhook/[token]` para `/api/chatwoot-sync` do CRM. Use o mesmo segredo configurado em `CRM_CHATWOOT_SYNC_SECRET`.

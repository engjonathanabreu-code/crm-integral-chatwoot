-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: MESCLA CLIENTES DUPLICADOS POR DDI
-- Já aplicada diretamente no Supabase de produção. Este arquivo
-- fica no repositório apenas como registro/auditoria. NÃO é
-- idempotente (mescla registros específicos por id) — não deve
-- ser reexecutada.
--
-- Contexto: telefone cadastrado no CRM sem o DDI "55" e o mesmo
-- cliente escrevendo depois pelo WhatsApp (que já manda com "55")
-- geravam DOIS clientes diferentes. 10 pares assim foram
-- encontrados na auditoria de 19/08/2026. Para cada par, o
-- registro com nome/dados reais foi mantido como principal; o
-- histórico (historico/atendimentos/interacoes/tarefas) do
-- registro "fantasma" criado pelo WhatsApp foi migrado pra ele,
-- o fantasma foi apagado, e o telefone do registro mantido foi
-- atualizado para incluir o DDI.
--
-- A causa raiz (telefone sem DDI) já foi corrigida no código
-- (api/chatwoot-sync.js e app.js), então não deve gerar novos
-- pares duplicados como esse.
-- ============================================================

-- Par 1: Ronaldo Mendes filho do Afrísio Mendes
update public.historico set cliente_id = '5947e113-ea15-469f-8079-6028e72855aa' where cliente_id = 'ccb8787f-1c13-4639-b328-78e1cfe13a66';
update public.atendimentos set cliente_id = '5947e113-ea15-469f-8079-6028e72855aa' where cliente_id = 'ccb8787f-1c13-4639-b328-78e1cfe13a66';
update public.interacoes set cliente_id = '5947e113-ea15-469f-8079-6028e72855aa' where cliente_id = 'ccb8787f-1c13-4639-b328-78e1cfe13a66';
update public.tarefas set cliente_id = '5947e113-ea15-469f-8079-6028e72855aa' where cliente_id = 'ccb8787f-1c13-4639-b328-78e1cfe13a66';
delete from public.clientes where id = 'ccb8787f-1c13-4639-b328-78e1cfe13a66';
update public.clientes set
  telefone = '+554789043607',
  telefone_normalizado = '554789043607',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:17:42.761+00'::timestamptz)
where id = '5947e113-ea15-469f-8079-6028e72855aa';

-- Par 2: Samara Beatriz Max (fantasma tinha vínculo com Chatwoot ativo)
update public.historico set cliente_id = 'ef09de91-fab9-45bb-9cf2-86f85c428d04' where cliente_id = '78dbe2ba-7b19-4e84-9db8-5c483485e4a0';
update public.atendimentos set cliente_id = 'ef09de91-fab9-45bb-9cf2-86f85c428d04' where cliente_id = '78dbe2ba-7b19-4e84-9db8-5c483485e4a0';
update public.interacoes set cliente_id = 'ef09de91-fab9-45bb-9cf2-86f85c428d04' where cliente_id = '78dbe2ba-7b19-4e84-9db8-5c483485e4a0';
update public.tarefas set cliente_id = 'ef09de91-fab9-45bb-9cf2-86f85c428d04' where cliente_id = '78dbe2ba-7b19-4e84-9db8-5c483485e4a0';
delete from public.clientes where id = '78dbe2ba-7b19-4e84-9db8-5c483485e4a0';
update public.clientes set
  telefone = '+554796151814',
  telefone_normalizado = '554796151814',
  chatwoot_contact_id = 11,
  chatwoot_last_conversation_id = 20,
  ultimo_setor = 'Comercial',
  ultimo_agente = 'Josimar ',
  canal = 'WhatsApp',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:52:47.584+00'::timestamptz)
where id = 'ef09de91-fab9-45bb-9cf2-86f85c428d04';

-- Par 3: Goretti Steinbach
update public.historico set cliente_id = '4ed2f11c-9e73-4fe4-a5ae-ffde6a240df6' where cliente_id = '37abb8d2-cd42-41fa-9253-a5ddefb2a99c';
update public.atendimentos set cliente_id = '4ed2f11c-9e73-4fe4-a5ae-ffde6a240df6' where cliente_id = '37abb8d2-cd42-41fa-9253-a5ddefb2a99c';
update public.interacoes set cliente_id = '4ed2f11c-9e73-4fe4-a5ae-ffde6a240df6' where cliente_id = '37abb8d2-cd42-41fa-9253-a5ddefb2a99c';
update public.tarefas set cliente_id = '4ed2f11c-9e73-4fe4-a5ae-ffde6a240df6' where cliente_id = '37abb8d2-cd42-41fa-9253-a5ddefb2a99c';
delete from public.clientes where id = '37abb8d2-cd42-41fa-9253-a5ddefb2a99c';
update public.clientes set
  telefone = '+5548984049219',
  telefone_normalizado = '5548984049219',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:13:49.626+00'::timestamptz)
where id = '4ed2f11c-9e73-4fe4-a5ae-ffde6a240df6';

-- Par 4: Cláudio Bernardino de Souza
update public.historico set cliente_id = 'e538c113-96ba-4f55-a966-4d999b3101ae' where cliente_id = 'fa97020d-eee6-49f2-a74c-9f0900f405f7';
update public.atendimentos set cliente_id = 'e538c113-96ba-4f55-a966-4d999b3101ae' where cliente_id = 'fa97020d-eee6-49f2-a74c-9f0900f405f7';
update public.interacoes set cliente_id = 'e538c113-96ba-4f55-a966-4d999b3101ae' where cliente_id = 'fa97020d-eee6-49f2-a74c-9f0900f405f7';
update public.tarefas set cliente_id = 'e538c113-96ba-4f55-a966-4d999b3101ae' where cliente_id = 'fa97020d-eee6-49f2-a74c-9f0900f405f7';
delete from public.clientes where id = 'fa97020d-eee6-49f2-a74c-9f0900f405f7';
update public.clientes set
  telefone = '+5548984102940',
  telefone_normalizado = '5548984102940',
  last_contact_at = greatest(last_contact_at, '2026-08-19 14:57:13.952+00'::timestamptz)
where id = 'e538c113-96ba-4f55-a966-4d999b3101ae';

-- Par 5: Marcos Antônio Coelho
update public.historico set cliente_id = '0e655eb2-f7df-478f-b64c-2dd87f7a4e5a' where cliente_id = '58d7de47-f477-4fcf-9906-e140d0da4071';
update public.atendimentos set cliente_id = '0e655eb2-f7df-478f-b64c-2dd87f7a4e5a' where cliente_id = '58d7de47-f477-4fcf-9906-e140d0da4071';
update public.interacoes set cliente_id = '0e655eb2-f7df-478f-b64c-2dd87f7a4e5a' where cliente_id = '58d7de47-f477-4fcf-9906-e140d0da4071';
update public.tarefas set cliente_id = '0e655eb2-f7df-478f-b64c-2dd87f7a4e5a' where cliente_id = '58d7de47-f477-4fcf-9906-e140d0da4071';
delete from public.clientes where id = '58d7de47-f477-4fcf-9906-e140d0da4071';
update public.clientes set
  telefone = '+5548984181239',
  telefone_normalizado = '5548984181239',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:12:05.296+00'::timestamptz)
where id = '0e655eb2-f7df-478f-b64c-2dd87f7a4e5a';

-- Par 6: Janice Kirchner Longen
update public.historico set cliente_id = '4ff22c9c-361a-414f-ad60-7df361e444c4' where cliente_id = 'fc17d906-994a-4958-a647-8e3cdf6ac75b';
update public.atendimentos set cliente_id = '4ff22c9c-361a-414f-ad60-7df361e444c4' where cliente_id = 'fc17d906-994a-4958-a647-8e3cdf6ac75b';
update public.interacoes set cliente_id = '4ff22c9c-361a-414f-ad60-7df361e444c4' where cliente_id = 'fc17d906-994a-4958-a647-8e3cdf6ac75b';
update public.tarefas set cliente_id = '4ff22c9c-361a-414f-ad60-7df361e444c4' where cliente_id = 'fc17d906-994a-4958-a647-8e3cdf6ac75b';
delete from public.clientes where id = 'fc17d906-994a-4958-a647-8e3cdf6ac75b';
update public.clientes set
  telefone = '+5548984486323',
  telefone_normalizado = '5548984486323',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:50:31.028+00'::timestamptz)
where id = '4ff22c9c-361a-414f-ad60-7df361e444c4';

-- Par 7: Valério Scheimann
update public.historico set cliente_id = 'f0f9b8b4-e1b8-44f4-9295-d96ccfb002a7' where cliente_id = 'b8c64ee8-d02b-4d7e-b829-300e37c07f28';
update public.atendimentos set cliente_id = 'f0f9b8b4-e1b8-44f4-9295-d96ccfb002a7' where cliente_id = 'b8c64ee8-d02b-4d7e-b829-300e37c07f28';
update public.interacoes set cliente_id = 'f0f9b8b4-e1b8-44f4-9295-d96ccfb002a7' where cliente_id = 'b8c64ee8-d02b-4d7e-b829-300e37c07f28';
update public.tarefas set cliente_id = 'f0f9b8b4-e1b8-44f4-9295-d96ccfb002a7' where cliente_id = 'b8c64ee8-d02b-4d7e-b829-300e37c07f28';
delete from public.clientes where id = 'b8c64ee8-d02b-4d7e-b829-300e37c07f28';
update public.clientes set
  telefone = '+5548991710227',
  telefone_normalizado = '5548991710227',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:49:32.219+00'::timestamptz)
where id = 'f0f9b8b4-e1b8-44f4-9295-d96ccfb002a7';

-- Par 8: Elidio Folster
update public.historico set cliente_id = '43a2d26a-21b9-408e-9e8e-9101a095e7a1' where cliente_id = 'c5ff7161-8228-4dd5-a875-50cf66bedc7c';
update public.atendimentos set cliente_id = '43a2d26a-21b9-408e-9e8e-9101a095e7a1' where cliente_id = 'c5ff7161-8228-4dd5-a875-50cf66bedc7c';
update public.interacoes set cliente_id = '43a2d26a-21b9-408e-9e8e-9101a095e7a1' where cliente_id = 'c5ff7161-8228-4dd5-a875-50cf66bedc7c';
update public.tarefas set cliente_id = '43a2d26a-21b9-408e-9e8e-9101a095e7a1' where cliente_id = 'c5ff7161-8228-4dd5-a875-50cf66bedc7c';
delete from public.clientes where id = 'c5ff7161-8228-4dd5-a875-50cf66bedc7c';
update public.clientes set
  telefone = '+5548998477374',
  telefone_normalizado = '5548998477374',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:49:12.577+00'::timestamptz)
where id = '43a2d26a-21b9-408e-9e8e-9101a095e7a1';

-- Par 9: Diego Garcia
update public.historico set cliente_id = '1ad08af0-2bce-4272-a156-c2429201e1b9' where cliente_id = '16b254e8-0112-41ef-9567-c3221887944c';
update public.atendimentos set cliente_id = '1ad08af0-2bce-4272-a156-c2429201e1b9' where cliente_id = '16b254e8-0112-41ef-9567-c3221887944c';
update public.interacoes set cliente_id = '1ad08af0-2bce-4272-a156-c2429201e1b9' where cliente_id = '16b254e8-0112-41ef-9567-c3221887944c';
update public.tarefas set cliente_id = '1ad08af0-2bce-4272-a156-c2429201e1b9' where cliente_id = '16b254e8-0112-41ef-9567-c3221887944c';
delete from public.clientes where id = '16b254e8-0112-41ef-9567-c3221887944c';
update public.clientes set
  telefone = '+5548999220066',
  telefone_normalizado = '5548999220066',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:48:48.449+00'::timestamptz)
where id = '1ad08af0-2bce-4272-a156-c2429201e1b9';

-- Par 10: Jose Roberto Jochem
update public.historico set cliente_id = 'b6261335-29b1-49c5-a22d-ff7096fabd69' where cliente_id = '165d984f-f32e-4162-808d-e7a101b04c0a';
update public.atendimentos set cliente_id = 'b6261335-29b1-49c5-a22d-ff7096fabd69' where cliente_id = '165d984f-f32e-4162-808d-e7a101b04c0a';
update public.interacoes set cliente_id = 'b6261335-29b1-49c5-a22d-ff7096fabd69' where cliente_id = '165d984f-f32e-4162-808d-e7a101b04c0a';
update public.tarefas set cliente_id = 'b6261335-29b1-49c5-a22d-ff7096fabd69' where cliente_id = '165d984f-f32e-4162-808d-e7a101b04c0a';
delete from public.clientes where id = '165d984f-f32e-4162-808d-e7a101b04c0a';
update public.clientes set
  telefone = '+5548999779122',
  telefone_normalizado = '5548999779122',
  last_contact_at = greatest(last_contact_at, '2026-08-19 16:07:05.07+00'::timestamptz)
where id = 'b6261335-29b1-49c5-a22d-ff7096fabd69';

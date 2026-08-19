-- ============================================================
-- CRM INTEGRAL — MIGRAÇÃO: UNIFICA MUNICÍPIO E DDI DE TELEFONE
-- Já aplicada diretamente no Supabase de produção. Este arquivo
-- fica no repositório apenas como registro/auditoria.
-- ============================================================

-- 1) Unifica as 4 grafias de "Itaiópolis" que fragmentavam a
--    listagem de clientes por município no CRM.
update public.clientes
set municipio = 'Itaiópolis',
    estado = coalesce(estado, 'SC')
where municipio in ('Itaiopolis', 'Itaiópolis', 'Itaiopolis - SC', 'Itaiópolis/SC');

-- 2) Preenche o DDI "55" nos telefones que estavam sem ele, para
--    parar de fragmentar o histórico quando o mesmo cliente escreve
--    pelo WhatsApp (que já manda o telefone com "55"). Excluídos os
--    10 casos que JÁ têm um registro duplicado com o DDI — esses
--    precisam de uma decisão de qual registro manter/mesclar antes
--    de mexer no telefone, para não colidir com a constraint única.
update public.clientes
set telefone_normalizado = '55' || telefone_normalizado
where telefone_normalizado is not null
  and length(telefone_normalizado) in (10, 11)
  and telefone_normalizado not in (
    '4796151814', '4789043607', '48999220066', '48998477374', '48984102940',
    '48999779122', '48984049219', '48991710227', '48984181239', '48984486323'
  );

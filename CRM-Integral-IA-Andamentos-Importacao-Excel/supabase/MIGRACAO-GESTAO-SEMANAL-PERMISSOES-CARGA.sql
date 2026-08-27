-- Gestão Semanal: permissões e carga inicial de municípios.
-- Aplicada no projeto CRM INTEGRAL OFICIAL.

-- Somente administradores podem executar DELETE direto na tabela.
-- Usuários do setor Pós-Protocolo usam o fluxo de solicitação/aprovação.
drop policy if exists pos_protocolo_municipios_delete on public.pos_protocolo_municipios;
create policy pos_protocolo_municipios_delete
  on public.pos_protocolo_municipios
  for delete
  to authenticated
  using (public.is_admin());

-- Exclusão administrativa controlada, mantendo auditoria no histórico do Projeto/Núcleo.
create or replace function public.excluir_card_gestao_semanal_admin(p_municipio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_municipio public.pos_protocolo_municipios%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir cards diretamente.';
  end if;

  select * into v_municipio
  from public.pos_protocolo_municipios
  where id = p_municipio_id and ativo = true
  for update;

  if not found then
    raise exception 'Município não encontrado ou já excluído.';
  end if;

  if v_municipio.projeto_id is not null then
    insert into public.andamentos (
      projeto_id, status, descricao_cliente, observacao_interna,
      visivel_ia, data_atualizacao, created_by, status_operacional, fonte
    ) values (
      v_municipio.projeto_id,
      'Outros',
      format('Gestão Semanal — o card do município %s/%s, vinculado à Semana %s, foi excluído por um administrador.', v_municipio.nome, v_municipio.estado, v_municipio.semana_padrao),
      format('Exclusão administrativa realizada em %s. Registro preservado para auditoria.', to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')),
      false,
      current_date,
      auth.uid(),
      'Concluído',
      'Gestão Semanal'
    );
  end if;

  update public.pos_protocolo_municipios
  set ativo = false, updated_at = now()
  where id = v_municipio.id;

  update public.pos_protocolo_exclusoes
  set status = 'aprovada', decidido_por = auth.uid(), decidido_em = now(), motivo_recusa = null
  where municipio_id = v_municipio.id and status = 'pendente';
end;
$$;

revoke all on function public.excluir_card_gestao_semanal_admin(uuid) from public;
revoke all on function public.excluir_card_gestao_semanal_admin(uuid) from anon;
grant execute on function public.excluir_card_gestao_semanal_admin(uuid) to authenticated;

-- A Gestão Semanal continua visível/editável somente para Admin e Pós-Protocolo
-- por meio de public.is_pos_protocolo_or_admin().

-- Carga inicial sem vínculo com Projeto/Núcleo ou Andamento.
do $$
declare
  v_admin uuid;
  r record;
begin
  select id into v_admin
  from public.profiles
  where perfil = 'admin' and ativo = true
  order by created_at
  limit 1;

  if v_admin is null then
    raise exception 'Nenhum administrador ativo encontrado para registrar a carga inicial.';
  end if;

  for r in
    select * from (values
      ('Araranguá','SC',1),
      ('Barracão','PR',1),
      ('Braço do Trombudo','SC',1),
      ('Chapadão do Lageado','SC',1),
      ('Ibirama','SC',1),
      ('Joinville','SC',1),
      ('José Boiteux','SC',1),
      ('Mafra','SC',1),
      ('Major Vieira','SC',1),
      ('Navegantes','SC',1),
      ('Salete','SC',1),
      ('Blumenau','SC',2),
      ('Camboriú','SC',2),
      ('Ilhota','SC',2),
      ('Mirim Doce','SC',2),
      ('Presidente Getúlio','SC',2),
      ('Presidente Nereu','SC',2),
      ('Rio do Campo','SC',2),
      ('São José do Ouro','RS',2),
      ('Vitor Meireles','SC',2),
      ('Witmarsum','SC',2),
      ('Águas Mornas','SC',3),
      ('Capão Bonito do Sul','RS',3),
      ('Caçapava','SP',3),
      ('Doutor Pedrinho','SC',3),
      ('Gaspar','SC',3),
      ('Guaratinguetá','SP',3),
      ('Guaratuba','PR',3),
      ('São João Batista','SC',3),
      ('Agrolândia','SC',3),
      ('São Simão','SP',3),
      ('Taió','SC',3),
      ('Aurora','SC',4),
      ('Imbuia','SC',4),
      ('Lontras','SC',4),
      ('Morro Agudo','SP',4),
      ('Rio do Sul','SC',4),
      ('Santa Terezinha','SC',4),
      ('Trombudo Central','SC',4)
    ) as seed(nome, estado, semana)
  loop
    if exists (
      select 1 from public.pos_protocolo_municipios m
      where lower(m.nome) = lower(r.nome) and upper(m.estado) = upper(r.estado)
    ) then
      update public.pos_protocolo_municipios
      set semana_padrao = r.semana,
          projeto_id = null,
          andamento_id = null,
          ativo = true,
          updated_at = now()
      where lower(nome) = lower(r.nome) and upper(estado) = upper(r.estado);
    else
      insert into public.pos_protocolo_municipios (
        nome, estado, semana_padrao, projeto_id, andamento_id,
        telefone, observacoes, ativo, created_by
      ) values (
        r.nome, r.estado, r.semana, null, null,
        null, null, true, v_admin
      );
    end if;
  end loop;
end $$;

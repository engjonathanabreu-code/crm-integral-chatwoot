create table if not exists public.pos_protocolo_exclusoes (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.pos_protocolo_municipios(id) on delete restrict,
  projeto_id uuid references public.projetos(id) on delete set null,
  municipio_nome text not null,
  estado text not null,
  semana integer not null check (semana between 1 and 4),
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  solicitado_por uuid not null references public.profiles(id) on delete restrict,
  solicitado_em timestamptz not null default now(),
  decidido_por uuid references public.profiles(id) on delete set null,
  decidido_em timestamptz,
  motivo_recusa text
);

create unique index if not exists pos_protocolo_exclusoes_pendente_uidx
  on public.pos_protocolo_exclusoes (municipio_id)
  where status = 'pendente';

alter table public.pos_protocolo_exclusoes enable row level security;

drop policy if exists pos_protocolo_exclusoes_select on public.pos_protocolo_exclusoes;
create policy pos_protocolo_exclusoes_select
  on public.pos_protocolo_exclusoes
  for select
  to authenticated
  using (public.is_pos_protocolo_or_admin());

create or replace function public.solicitar_exclusao_gestao_semanal(p_municipio_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_municipio public.pos_protocolo_municipios%rowtype;
  v_id uuid;
begin
  if not public.is_pos_protocolo_or_admin() then
    raise exception 'Sem permissão para solicitar exclusão.';
  end if;

  select * into v_municipio
  from public.pos_protocolo_municipios
  where id = p_municipio_id and ativo = true;

  if not found then
    raise exception 'Município não encontrado ou já excluído.';
  end if;

  if exists (
    select 1 from public.pos_protocolo_exclusoes
    where municipio_id = p_municipio_id and status = 'pendente'
  ) then
    raise exception 'Já existe uma solicitação de exclusão pendente para este município.';
  end if;

  insert into public.pos_protocolo_exclusoes (
    municipio_id, projeto_id, municipio_nome, estado, semana, solicitado_por
  ) values (
    v_municipio.id, v_municipio.projeto_id, v_municipio.nome, v_municipio.estado,
    v_municipio.semana_padrao, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.aprovar_exclusao_gestao_semanal(p_solicitacao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.pos_protocolo_exclusoes%rowtype;
  v_municipio public.pos_protocolo_municipios%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem aprovar exclusões.';
  end if;

  select * into v_req
  from public.pos_protocolo_exclusoes
  where id = p_solicitacao_id and status = 'pendente'
  for update;

  if not found then
    raise exception 'Solicitação não encontrada ou já analisada.';
  end if;

  select * into v_municipio
  from public.pos_protocolo_municipios
  where id = v_req.municipio_id
  for update;

  if not found then
    raise exception 'Município não encontrado.';
  end if;

  if v_municipio.projeto_id is not null then
    insert into public.andamentos (
      projeto_id, status, descricao_cliente, observacao_interna,
      visivel_ia, data_atualizacao, created_by, status_operacional, fonte
    ) values (
      v_municipio.projeto_id,
      'Outros',
      format('Gestão Semanal — o card do município %s/%s, vinculado à Semana %s, foi excluído após aprovação administrativa.', v_municipio.nome, v_municipio.estado, v_municipio.semana_padrao),
      format('Exclusão solicitada em %s e aprovada em %s. Registro preservado para auditoria.', to_char(v_req.solicitado_em at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'), to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')),
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
  where id = v_req.id;
end;
$$;

create or replace function public.recusar_exclusao_gestao_semanal(p_solicitacao_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem recusar exclusões.';
  end if;

  update public.pos_protocolo_exclusoes
  set status = 'recusada', decidido_por = auth.uid(), decidido_em = now(), motivo_recusa = nullif(trim(p_motivo), '')
  where id = p_solicitacao_id and status = 'pendente';

  if not found then
    raise exception 'Solicitação não encontrada ou já analisada.';
  end if;
end;
$$;

revoke all on function public.solicitar_exclusao_gestao_semanal(uuid) from public, anon;
revoke all on function public.aprovar_exclusao_gestao_semanal(uuid) from public, anon;
revoke all on function public.recusar_exclusao_gestao_semanal(uuid, text) from public, anon;

grant execute on function public.solicitar_exclusao_gestao_semanal(uuid) to authenticated;
grant execute on function public.aprovar_exclusao_gestao_semanal(uuid) to authenticated;
grant execute on function public.recusar_exclusao_gestao_semanal(uuid, text) to authenticated;

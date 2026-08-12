-- CRM Integral — Andamentos consultáveis pelo Agente IA

alter table public.andamentos add column if not exists status_operacional text not null default 'Em andamento';
alter table public.andamentos add column if not exists previsao date;
alter table public.andamentos add column if not exists orientacao_ia text;
alter table public.andamentos add column if not exists fonte text not null default 'CRM';

create index if not exists andamentos_projeto_visivel_data_idx
  on public.andamentos(projeto_id, visivel_ia, data_atualizacao desc, created_at desc);

comment on column public.andamentos.descricao_cliente is 'Texto factual que pode ser apresentado ao cliente.';
comment on column public.andamentos.observacao_interna is 'Informação interna; nunca deve ser exposta pelo agente IA.';
comment on column public.andamentos.orientacao_ia is 'Orientação complementar para a IA explicar o andamento sem inventar dados.';
comment on column public.andamentos.visivel_ia is 'Se false, o registro não pode ser usado nas respostas do agente IA.';
comment on column public.andamentos.previsao is 'Previsão oficial quando houver; nulo significa que não há previsão registrada.';

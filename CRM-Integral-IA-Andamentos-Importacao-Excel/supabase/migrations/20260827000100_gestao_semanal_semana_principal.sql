alter table public.pos_protocolo_municipios
  add column if not exists semana_padrao integer,
  add column if not exists andamento_id uuid references public.andamentos(id) on delete set null;

update public.pos_protocolo_municipios m
set semana_padrao = coalesce((select min(s.semana) from public.pos_protocolo_semanas s where s.municipio_id = m.id), 1)
where semana_padrao is null;

alter table public.pos_protocolo_municipios alter column semana_padrao set not null;

do $$ begin
  alter table public.pos_protocolo_municipios add constraint pos_protocolo_municipios_semana_padrao_check check (semana_padrao between 1 and 4);
exception when duplicate_object then null;
end $$;

create index if not exists pos_protocolo_municipios_semana_idx on public.pos_protocolo_municipios (semana_padrao, ativo);
create index if not exists pos_protocolo_municipios_andamento_idx on public.pos_protocolo_municipios (andamento_id);

create table if not exists public.pos_protocolo_arquivos (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.pos_protocolo_semanas(id) on delete cascade,
  municipio_id uuid not null references public.pos_protocolo_municipios(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text not null unique,
  mime_type text,
  tamanho bigint,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists pos_protocolo_arquivos_semana_idx on public.pos_protocolo_arquivos (semana_id, created_at desc);
create index if not exists pos_protocolo_arquivos_municipio_idx on public.pos_protocolo_arquivos (municipio_id, created_at desc);

alter table public.pos_protocolo_arquivos enable row level security;

drop policy if exists pos_protocolo_arquivos_select on public.pos_protocolo_arquivos;
create policy pos_protocolo_arquivos_select on public.pos_protocolo_arquivos for select using (public.is_pos_protocolo_or_admin());
drop policy if exists pos_protocolo_arquivos_insert on public.pos_protocolo_arquivos;
create policy pos_protocolo_arquivos_insert on public.pos_protocolo_arquivos for insert with check (public.is_pos_protocolo_or_admin() and created_by = auth.uid());
drop policy if exists pos_protocolo_arquivos_delete on public.pos_protocolo_arquivos;
create policy pos_protocolo_arquivos_delete on public.pos_protocolo_arquivos for delete using (public.is_pos_protocolo_or_admin());

grant select, insert, delete on public.pos_protocolo_arquivos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('gestao-semanal','gestao-semanal',false,20971520)
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit;

drop policy if exists gestao_semanal_storage_select on storage.objects;
create policy gestao_semanal_storage_select on storage.objects for select to authenticated using (bucket_id='gestao-semanal' and public.is_pos_protocolo_or_admin());
drop policy if exists gestao_semanal_storage_insert on storage.objects;
create policy gestao_semanal_storage_insert on storage.objects for insert to authenticated with check (bucket_id='gestao-semanal' and public.is_pos_protocolo_or_admin());
drop policy if exists gestao_semanal_storage_delete on storage.objects;
create policy gestao_semanal_storage_delete on storage.objects for delete to authenticated using (bucket_id='gestao-semanal' and public.is_pos_protocolo_or_admin());

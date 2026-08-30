-- =====================================================================
-- Sistema de Gestao de Notas Fiscais Doadas
-- ONG Natureza em Forma
-- Banco: PostgreSQL (Supabase)
--
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) usuarios - quem opera o sistema (voluntarios e administradores)
-- ---------------------------------------------------------------------
create table if not exists public.usuarios (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  senha_hash  text not null,
  nome        text not null,
  role        text not null default 'voluntario'
              check (role in ('admin', 'voluntario', 'leitura')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

comment on table public.usuarios is 'Operadores do sistema. senha_hash nunca guarda senha em texto puro.';

-- ---------------------------------------------------------------------
-- 2) notas_fiscais - o coracao do sistema
-- ---------------------------------------------------------------------
create table if not exists public.notas_fiscais (
  id              uuid primary key default gen_random_uuid(),
  chave_nfc       text unique,                       -- 44 digitos da NFC-e/NF-e
  cnpj            text,                              -- CNPJ do estabelecimento (so digitos)
  estabelecimento text,                              -- nome / razao social
  data_emissao    date,                              -- data da compra
  valor           numeric(12,2) not null default 0,  -- valor total da nota
  status          text not null default 'novo'
                  check (status in ('novo', 'a_cadastrar', 'cadastrado', 'duplicado', 'revisao')),
  origem          text not null default 'manual'
                  check (origem in ('manual', 'scanner', 'importacao')),
  doador_nome     text,                              -- quem doou a nota
  doador_contato  text,                              -- telefone / email do doador
  prazo_cadastro  date,                              -- limite NFP: dia 20 do mes seguinte
  cadastrado_em   timestamptz,                       -- quando foi lancada no portal NFP
  observacoes     text,
  criado_por      uuid references public.usuarios(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

comment on column public.notas_fiscais.prazo_cadastro is
  'Prazo da Nota Fiscal Paulista: ate o dia 20 do mes seguinte a emissao.';

-- Preenche o prazo automaticamente a partir da data de emissao
create or replace function public.fn_prazo_cadastro()
returns trigger
language plpgsql
as $$
begin
  if new.data_emissao is not null and new.prazo_cadastro is null then
    new.prazo_cadastro := (date_trunc('month', new.data_emissao) + interval '1 month')::date + 19;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_prazo_cadastro on public.notas_fiscais;
create trigger trg_prazo_cadastro
  before insert or update on public.notas_fiscais
  for each row execute function public.fn_prazo_cadastro();

-- ---------------------------------------------------------------------
-- 3) logs - auditoria de tudo que acontece
-- ---------------------------------------------------------------------
create table if not exists public.logs (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  acao       text not null,        -- ex: nota_criada, status_alterado, duplicidade_detectada
  entidade   text not null default 'nota_fiscal',
  entidade_id uuid,
  detalhes   jsonb,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4) Indices para performance
-- ---------------------------------------------------------------------
create unique index if not exists idx_notas_chave      on public.notas_fiscais (chave_nfc) where chave_nfc is not null;
create index if not exists        idx_notas_status     on public.notas_fiscais (status);
create index if not exists        idx_notas_prazo      on public.notas_fiscais (prazo_cadastro);
create index if not exists        idx_notas_emissao    on public.notas_fiscais (data_emissao desc);
create index if not exists        idx_notas_cnpj       on public.notas_fiscais (cnpj);
create index if not exists        idx_logs_entidade    on public.logs (entidade, entidade_id);
create index if not exists        idx_logs_criado_em   on public.logs (criado_em desc);
create index if not exists        idx_usuarios_email   on public.usuarios (email);

-- ---------------------------------------------------------------------
-- 5) Seguranca (RLS)
--
-- MVP: as politicas abaixo liberam leitura e escrita para a chave anon,
-- para o sistema funcionar sem login. Antes de colocar dados reais em
-- producao, troque por politicas baseadas em auth.uid().
-- ---------------------------------------------------------------------
alter table public.notas_fiscais enable row level security;
alter table public.logs          enable row level security;
alter table public.usuarios      enable row level security;

drop policy if exists notas_acesso_mvp on public.notas_fiscais;
create policy notas_acesso_mvp on public.notas_fiscais
  for all to anon, authenticated using (true) with check (true);

drop policy if exists logs_acesso_mvp on public.logs;
create policy logs_acesso_mvp on public.logs
  for all to anon, authenticated using (true) with check (true);

-- usuarios fica fechado: nenhuma politica = ninguem le pela chave anon

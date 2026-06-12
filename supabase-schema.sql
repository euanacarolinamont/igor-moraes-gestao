-- =============================================
-- Igor Moraes Gestão — Supabase Schema
-- Execute este script no SQL Editor do Supabase
-- =============================================

-- Alunos
create table if not exists alunos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  sobrenome text not null default '',
  cpf text default '',
  telefone text default '',
  email text default '',
  genero text default 'Masculino',
  data_nascimento text default '',
  foto_url text,
  servico_contratado text default '',
  status text default 'Ativo',
  data_inicio text default '',
  data_vencimento text default '',
  observacoes text,
  created_at timestamptz default now()
);

-- Agendamentos
create table if not exists agendamentos (
  id uuid default gen_random_uuid() primary key,
  aluno_id uuid references alunos(id) on delete cascade,
  data text not null,
  horario text not null,
  servico text default '',
  sinal_valor numeric default 0,
  sinal_status text default 'Aguardando Pagamento',
  created_at timestamptz default now()
);

-- Receitas
create table if not exists financeiro_receitas (
  id uuid default gen_random_uuid() primary key,
  aluno_id uuid references alunos(id) on delete set null,
  agendamento_id uuid references agendamentos(id) on delete set null,
  tipo text default 'manual',
  servico text default '',
  descricao text default '',
  valor numeric default 0,
  status text default 'A receber',
  data_vencimento text not null,
  data_pagamento text,
  created_at timestamptz default now()
);

-- Despesas
create table if not exists financeiro_despesas (
  id uuid default gen_random_uuid() primary key,
  categoria text not null,
  descricao text default '',
  valor numeric default 0,
  status text default 'A pagar',
  data_vencimento text not null,
  data_pagamento text,
  created_at timestamptz default now()
);

-- Categorias personalizadas
create table if not exists financeiro_categorias (
  id uuid default gen_random_uuid() primary key,
  nome text not null unique,
  created_at timestamptz default now()
);

-- CRM Cards
create table if not exists crm_cards (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  telefone text default '',
  servico_interesse text default '',
  observacoes text,
  coluna text default 'novo_lead',
  aluno_id uuid references alunos(id) on delete set null,
  convertido boolean,
  servico_convertido text,
  valor_convertido numeric,
  created_at timestamptz default now()
);

-- RLS (Row Level Security) — habilitar para todas as tabelas
alter table alunos enable row level security;
alter table agendamentos enable row level security;
alter table financeiro_receitas enable row level security;
alter table financeiro_despesas enable row level security;
alter table financeiro_categorias enable row level security;
alter table crm_cards enable row level security;

-- Políticas: usuários autenticados têm acesso total
create policy "Authenticated users can do anything on alunos"
  on alunos for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do anything on agendamentos"
  on agendamentos for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do anything on financeiro_receitas"
  on financeiro_receitas for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do anything on financeiro_despesas"
  on financeiro_despesas for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do anything on financeiro_categorias"
  on financeiro_categorias for all using (auth.role() = 'authenticated');

create policy "Authenticated users can do anything on crm_cards"
  on crm_cards for all using (auth.role() = 'authenticated');

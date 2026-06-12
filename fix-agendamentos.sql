-- Adiciona colunas necessárias na tabela agendamentos (se não existirem)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS data text default '';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS horario text default '';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS servico text default '';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sinal_valor numeric default 0;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sinal_status text default 'Aguardando Pagamento';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor_total numeric default 0;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS observacoes text default '';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status text default 'ativo';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS motivo_fechamento text default '';

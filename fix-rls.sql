ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can do anything on alunos" ON alunos;
CREATE POLICY "Enable all for authenticated users" ON alunos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE crm_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can do anything on crm_cards" ON crm_cards;
CREATE POLICY "Enable all for authenticated users" ON crm_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE financeiro_receitas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can do anything on financeiro_receitas" ON financeiro_receitas;
CREATE POLICY "Enable all for authenticated users" ON financeiro_receitas FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can do anything on agendamentos" ON agendamentos;
CREATE POLICY "Enable all for authenticated users" ON agendamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE financeiro_despesas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can do anything on financeiro_despesas" ON financeiro_despesas;
CREATE POLICY "Enable all for authenticated users" ON financeiro_despesas FOR ALL TO authenticated USING (true) WITH CHECK (true);

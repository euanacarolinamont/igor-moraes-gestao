import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      alunos: {
        Row: Aluno
        Insert: Omit<Aluno, 'id' | 'created_at'>
        Update: Partial<Omit<Aluno, 'id' | 'created_at'>>
      }
      agendamentos: {
        Row: Agendamento
        Insert: Omit<Agendamento, 'id' | 'created_at'>
        Update: Partial<Omit<Agendamento, 'id' | 'created_at'>>
      }
      financeiro_receitas: {
        Row: Receita
        Insert: Omit<Receita, 'id' | 'created_at'>
        Update: Partial<Omit<Receita, 'id' | 'created_at'>>
      }
      financeiro_despesas: {
        Row: Despesa
        Insert: Omit<Despesa, 'id' | 'created_at'>
        Update: Partial<Omit<Despesa, 'id' | 'created_at'>>
      }
      financeiro_categorias: {
        Row: Categoria
        Insert: Omit<Categoria, 'id' | 'created_at'>
        Update: Partial<Omit<Categoria, 'id' | 'created_at'>>
      }
      crm_cards: {
        Row: CrmCard
        Insert: Omit<CrmCard, 'id' | 'created_at'>
        Update: Partial<Omit<CrmCard, 'id' | 'created_at'>>
      }
    }
  }
}

export interface Aluno {
  id: string
  nome: string
  sobrenome: string
  cpf: string
  telefone: string
  email: string
  genero: 'Masculino' | 'Feminino' | 'Prefiro não informar'
  data_nascimento: string
  foto_url: string | null
  servico_contratado: string
  status: 'Ativo' | 'Inativo' | 'Vencido' | 'Cancelado'
  data_inicio: string
  data_vencimento: string
  observacoes: string | null
  created_at: string
}

export interface Agendamento {
  id: string
  aluno_id: string
  data: string
  horario: string
  servico: string
  sinal_valor: number
  sinal_status: 'Aguardando Pagamento' | 'Pago'
  created_at: string
  aluno?: Aluno
}

export interface Receita {
  id: string
  aluno_id: string | null
  agendamento_id: string | null
  tipo: 'sinal' | 'restante' | 'manual'
  servico: string
  descricao: string
  valor: number
  status: 'Recebido' | 'A receber'
  data_vencimento: string
  data_pagamento: string | null
  created_at: string
  aluno?: Aluno
}

export interface Despesa {
  id: string
  categoria: string
  descricao: string
  valor: number
  status: 'Pago' | 'A pagar'
  data_vencimento: string
  data_pagamento: string | null
  created_at: string
}

export interface Categoria {
  id: string
  nome: string
  created_at: string
}

export interface CrmCard {
  id: string
  nome: string
  telefone: string
  servico_interesse: string
  observacoes: string | null
  coluna: 'novo_lead' | 'em_nutricao' | 'proposta_enviada' | 'renovacao' | 'finalizado'
  aluno_id: string | null
  convertido: boolean | null
  servico_convertido: string | null
  valor_convertido: number | null
  created_at: string
  aluno?: Aluno
}

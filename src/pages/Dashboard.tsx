import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Receita, Aluno, Agendamento } from '../lib/supabase'
import {
  format, differenceInCalendarDays, parseISO, addDays, startOfMonth, endOfMonth,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Users, AlertCircle, TrendingUp, CalendarDays, CheckCircle, Download,
} from 'lucide-react'
import Modal from '../components/Modal'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

interface Metrics {
  ativos: number
  total: number
  renov45: number
  renov30: number
  vencidos: number
  inativos: number
  receitaPeriodo: number
  avalAgendadas: number
  avalRealizadas: number
  consultorias: number
}

function DayBadge({ days, vencido }: { days: number; vencido?: boolean }) {
  if (vencido) {
    return <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 rounded px-2 py-0.5 font-bold">{Math.abs(days)}D VENCIDO</span>
  }
  const color = days <= 15 ? 'bg-red-900/40 text-red-400 border-red-800' : 'bg-yellow-900/40 text-yellow-400 border-yellow-800'
  return <span className={`text-xs ${color} border rounded px-2 py-0.5 font-bold`}>{days}D</span>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [metrics, setMetrics] = useState<Metrics>({
    ativos: 0, total: 0, renov45: 0, renov30: 0, vencidos: 0, inativos: 0,
    receitaPeriodo: 0, avalAgendadas: 0, avalRealizadas: 0, consultorias: 0,
  })
  const [alertasSaldo, setAlertasSaldo] = useState<(Receita & { aluno?: Aluno })[]>([])
  const [alertasRenovacao, setAlertasRenovacao] = useState<Aluno[]>([])
  const [renovacoesProximas, setRenovacoesProximas] = useState<Aluno[]>([])
  const [vencidosLista, setVencidosLista] = useState<Aluno[]>([])
  const [agendaHoje, setAgendaHoje] = useState<(Agendamento & { aluno?: Aluno })[]>([])
  const [loading, setLoading] = useState(true)

  // Modal confirmar saldo
  const [confirmModal, setConfirmModal] = useState(false)
  const [confirmReceita, setConfirmReceita] = useState<(Receita & { aluno?: Aluno }) | null>(null)
  const [saving, setSaving] = useState(false)

  // Modal exportar PDF renovações
  const [exportModal, setExportModal] = useState(false)
  const [exportMes, setExportMes] = useState<'atual' | 'proximo' | 'anterior'>('proximo')

  const today = format(new Date(), 'yyyy-MM-dd')
  const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd')
  const in45 = format(addDays(new Date(), 45), 'yyyy-MM-dd')

  useEffect(() => { fetchAll() }, [location.key])

  async function fetchAll() {
    setLoading(true)
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

    const [
      alunosRes, receitasRes, agendRes, saldosRes, futurosRes,
    ] = await Promise.all([
      supabase.from('alunos').select('*'),
      supabase.from('financeiro_receitas')
        .select('*, aluno:alunos(nome, sobrenome)')
        .gte('data_vencimento', monthStart).lte('data_vencimento', monthEnd)
        .eq('status', 'Recebido'),
      supabase.from('agendamentos')
        .select('*, aluno:alunos(nome, sobrenome)')
        .eq('data', today),
      supabase.from('financeiro_receitas')
        .select('*, aluno:alunos(nome, sobrenome, data_inicio)')
        .eq('tipo', 'restante')
        .eq('status', 'A receber'),
      supabase.from('agendamentos')
        .select('aluno_id')
        .gte('data', today),
    ])

    const alunos: Aluno[] = alunosRes.data ?? []
    const receitas = receitasRes.data ?? []
    const agends = (agendRes.data ?? []) as (Agendamento & { aluno?: Aluno })[]
    const saldosPendentes = (saldosRes.data ?? []) as (Receita & { aluno?: Aluno })[]

    const ativos = alunos.filter(a => a.status === 'Ativo')
    const vencidos = alunos.filter(a => a.data_vencimento && a.data_vencimento < today)

    // Alunos com agendamento futuro (data >= hoje) — excluídos das renovações
    const alunosComAgendFuturo = new Set(
      (futurosRes.data ?? []).map(a => a.aluno_id).filter(Boolean) as string[]
    )

    const renov45 = ativos.filter(a =>
      a.data_vencimento && a.data_vencimento >= today && a.data_vencimento <= in45 &&
      !alunosComAgendFuturo.has(a.id)
    )
    const renov30 = ativos.filter(a =>
      a.data_vencimento && a.data_vencimento >= today && a.data_vencimento <= in30 &&
      !alunosComAgendFuturo.has(a.id)
    )

    const receitaPeriodo = receitas.reduce((s, r) => s + (r.valor ?? 0), 0)

    const avalAgendadas = agends.filter(a =>
      a.servico?.toLowerCase().includes('avaliação') || a.servico?.toLowerCase().includes('avaliacao')
    ).length
    const avalRealizadas = agends.filter(a =>
      (a.servico?.toLowerCase().includes('avaliação') || a.servico?.toLowerCase().includes('avaliacao')) && a.sinal_status === 'Pago'
    ).length
    const consultorias = agends.filter(a => a.servico?.toLowerCase().includes('consultoria')).length

    setMetrics({
      ativos: ativos.length,
      total: alunos.length,
      renov45: renov45.length,
      renov30: renov30.length,
      vencidos: vencidos.length,
      inativos: alunos.filter(a => a.status === 'Inativo').length,
      receitaPeriodo,
      avalAgendadas,
      avalRealizadas,
      consultorias,
    })

    // Alertas de saldo — filtra apenas os que têm sinal já recebido (agendamento_id com sinal Pago)
    const saldosComAlerta = await Promise.all(saldosPendentes.map(async (s) => {
      if (!s.agendamento_id) return null
      const { data: agend } = await supabase.from('agendamentos').select('sinal_status, data').eq('id', s.agendamento_id).single()
      if (!agend || agend.sinal_status !== 'Pago') return null
      return { ...s, _agendData: agend.data } as (Receita & { aluno?: Aluno; _agendData?: string })
    }))
    setAlertasSaldo(saldosComAlerta.filter(Boolean) as (Receita & { aluno?: Aluno })[])
    setAlertasRenovacao(renov30)
    setRenovacoesProximas(renov45.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)))
    setVencidosLista(vencidos.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)))
    setAgendaHoje(agends)
    setLoading(false)
  }

  async function confirmarSaldo() {
    if (!confirmReceita) return
    setSaving(true)
    await supabase.from('financeiro_receitas').update({
      status: 'Recebido',
      data_pagamento: today,
    }).eq('id', confirmReceita.id)
    setConfirmModal(false)
    setAlertasSaldo(prev => prev.filter(a => a.id !== confirmReceita.id))
    setSaving(false)
  }

  function exportPDF() {
    const now = new Date()
    let targetMonth: Date
    if (exportMes === 'atual') targetMonth = now
    else if (exportMes === 'anterior') targetMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    else targetMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const monthStart = format(startOfMonth(targetMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(targetMonth), 'yyyy-MM-dd')
    const alunos = renovacoesProximas.filter(a => a.data_vencimento >= monthStart && a.data_vencimento <= monthEnd)

    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Renovações — ${format(targetMonth, 'MMMM yyyy', { locale: ptBR })}`, 14, 18)
    ;(doc as any).autoTable({
      startY: 28,
      head: [['Aluno', 'Último Serviço', 'Vencimento', 'Dias Restantes']],
      body: alunos.map(a => [
        `${a.nome} ${a.sobrenome}`,
        a.servico_contratado,
        a.data_vencimento,
        `${differenceInCalendarDays(parseISO(a.data_vencimento), new Date())}d`,
      ]),
      styles: { fontSize: 9 },
    })
    doc.save(`renovacoes-${format(targetMonth, 'yyyy-MM')}.pdf`)
    setExportModal(false)
  }

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-white tracking-wide">DASHBOARD</h1>
          <p className="text-gray-500 text-sm capitalize">{format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <button onClick={() => setExportModal(true)} className="btn-secondary text-sm">
          <Download size={14} /> Exportar Renovações
        </button>
      </div>

      {/* Alertas de saldo pendente */}
      {alertasSaldo.length > 0 && (
        <div className="space-y-2">
          {alertasSaldo.map(s => {
            const diasSinal = (s as any)._agendData
              ? differenceInCalendarDays(new Date(), parseISO((s as any)._agendData))
              : 0
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg px-4 py-3" style={{ background: '#1a1200', border: '1px solid #713f12' }}>
                <div className="flex items-center gap-3">
                  <AlertCircle size={16} className="text-yellow-400 flex-shrink-0" />
                  <p className="text-yellow-200 text-sm">
                    <span className="font-semibold">{(s.aluno as any)?.nome} {(s.aluno as any)?.sobrenome}</span>
                    {' '}— sinal recebido há {diasSinal} dia(s). Confirme o pagamento do saldo de{' '}
                    <span className="font-bold text-yellow-300">{fmt(s.valor)}</span>
                  </p>
                </div>
                <button
                  onClick={() => { setConfirmReceita(s); setConfirmModal(true) }}
                  className="text-xs bg-yellow-900/60 hover:bg-yellow-900 text-yellow-300 border border-yellow-700 rounded px-3 py-1.5 transition-colors flex-shrink-0"
                >
                  Atualizar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Aviso de renovações em 30 dias */}
      {alertasRenovacao.length > 0 && (
        <div className="rounded-lg px-4 py-3 flex items-start gap-3" style={{ background: '#1a0a14', border: '1px solid #831843' }}>
          <AlertCircle size={16} className="text-pink-400 mt-0.5 flex-shrink-0" />
          <p className="text-pink-200 text-sm">
            <span className="font-semibold">{alertasRenovacao.length} aluno(s)</span> com renovação em até 30 dias:{' '}
            {alertasRenovacao.map(a => `${a.nome} ${a.sobrenome}`).join(', ')}
          </p>
        </div>
      )}

      {/* Cards métricas principais */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-green-700 flex items-center justify-center flex-shrink-0">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Alunos Ativos</p>
              <p className="text-white text-2xl font-bold">{metrics.ativos}</p>
            </div>
          </div>
          <p className="text-gray-600 text-xs mt-1">{metrics.total} total cadastrado(s)</p>
        </div>

        <div className="card cursor-pointer hover:border-primary transition-colors" onClick={() => navigate(`/alunos?vencDe=${today}&vencAte=${in45}`)}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-yellow-700 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={18} className="text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Renovações em 45d</p>
              <p className="text-white text-2xl font-bold">{metrics.renov45}</p>
            </div>
          </div>
          <p className="text-primary text-xs mt-1">ver lista →</p>
        </div>

        <div className="card cursor-pointer hover:border-primary transition-colors" onClick={() => navigate(`/alunos?vencDe=${today}&vencAte=${in30}`)}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-red-700 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={18} className="text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Renovações em 30d</p>
              <p className="text-white text-2xl font-bold">{metrics.renov30}</p>
            </div>
          </div>
          <p className="text-primary text-xs mt-1">ver lista →</p>
        </div>

        <div className="card cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/alunos?status=Vencido')}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-red-900 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={18} className="text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Vencidos Acumulado</p>
              <p className="text-white text-2xl font-bold">{metrics.vencidos}</p>
            </div>
          </div>
          <p className="text-primary text-xs mt-1">ver lista →</p>
        </div>

        <div className="card cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/alunos?status=Inativo')}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Alunos Inativos</p>
              <p className="text-white text-2xl font-bold">{metrics.inativos}</p>
            </div>
          </div>
          <p className="text-primary text-xs mt-1">ver lista →</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-green-800 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={18} className="text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Receita do Período</p>
              <p className="text-white text-xl font-bold">{fmt(metrics.receitaPeriodo)}</p>
            </div>
          </div>
          <p className="text-gray-600 text-xs mt-1 capitalize">{format(new Date(), 'MMMM yyyy', { locale: ptBR })}</p>
        </div>
      </div>

      {/* Cards secundários */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <CalendarDays size={20} className="text-primary mx-auto mb-2" />
          <p className="text-gray-400 text-xs mb-1">Avaliações Agendadas</p>
          <p className="text-white text-2xl font-bold">{metrics.avalAgendadas}</p>
          <p className="text-gray-600 text-xs">no período</p>
        </div>
        <div className="card text-center">
          <CheckCircle size={20} className="text-green-400 mx-auto mb-2" />
          <p className="text-gray-400 text-xs mb-1">Avaliações Realizadas</p>
          <p className="text-white text-2xl font-bold">{metrics.avalRealizadas}</p>
          <p className="text-gray-600 text-xs">sinal confirmado</p>
        </div>
        <div className="card text-center">
          <CheckCircle size={20} className="text-blue-400 mx-auto mb-2" />
          <p className="text-gray-400 text-xs mb-1">Consultorias</p>
          <p className="text-white text-2xl font-bold">{metrics.consultorias}</p>
          <p className="text-gray-600 text-xs">no período</p>
        </div>
      </div>

      {/* Tabelas lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Renovações próximas */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2">
            <p className="text-white text-sm font-semibold">Renovações Próximas</p>
            <p className="text-gray-500 text-xs">Próximos 45 dias</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Aluno</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Serviço</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Vencimento</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {renovacoesProximas.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-600 text-sm">Nenhuma renovação nos próximos 45 dias</td></tr>
                ) : renovacoesProximas.map(a => {
                  const dias = differenceInCalendarDays(parseISO(a.data_vencimento || today), new Date())
                  return (
                    <tr key={a.id} className="border-b border-border hover:bg-surface-2 cursor-pointer" onClick={() => navigate(`/alunos/${a.id}`)}>
                      <td className="px-4 py-2.5 text-white text-sm">{a.nome} {a.sobrenome}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded px-1.5 py-0.5 truncate block max-w-[110px]">
                          {a.servico_contratado}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{a.data_vencimento}</td>
                      <td className="px-4 py-2.5"><DayBadge days={dias} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vencidos */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-semibold">Vencidos Acumulado</p>
              <p className="text-gray-500 text-xs">Todos os alunos vencidos</p>
            </div>
            <button onClick={() => navigate('/alunos')} className="text-primary text-xs hover:underline">Ver Todos</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Aluno</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Serviço</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Vencimento</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {vencidosLista.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-600 text-sm">Nenhum aluno vencido</td></tr>
                ) : vencidosLista.slice(0, 8).map(a => {
                  const dias = differenceInCalendarDays(new Date(), parseISO(a.data_vencimento || today))
                  return (
                    <tr key={a.id} className="border-b border-border hover:bg-surface-2 cursor-pointer" onClick={() => navigate(`/alunos/${a.id}`)}>
                      <td className="px-4 py-2.5 text-white text-sm">{a.nome} {a.sobrenome}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded px-1.5 py-0.5 truncate block max-w-[110px]">
                          {a.servico_contratado}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{a.data_vencimento}</td>
                      <td className="px-4 py-2.5"><DayBadge days={dias} vencido /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Agenda de hoje */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-2">
          <p className="text-white text-sm font-semibold">Agenda de Hoje</p>
          <p className="text-gray-500 text-xs">{today}</p>
        </div>
        {agendaHoje.length === 0 ? (
          <p className="text-center py-8 text-gray-600 text-sm">Nenhum agendamento hoje</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Hora</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Aluno</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Tipo</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium text-xs">Pgto Sinal</th>
              </tr>
            </thead>
            <tbody>
              {agendaHoje.map(a => (
                <tr key={a.id} className="border-b border-border">
                  <td className="px-4 py-2.5 text-primary font-bold">{a.horario}</td>
                  <td className="px-4 py-2.5 text-white">{(a.aluno as any)?.nome} {(a.aluno as any)?.sobrenome}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded px-1.5 py-0.5">{a.servico}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs rounded px-2 py-0.5 font-semibold ${a.sinal_status === 'Pago' ? 'bg-green-900/40 text-green-400 border border-green-800' : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800'}`}>
                      {a.sinal_status === 'Pago' ? 'PAGO' : 'AGUARD.'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal confirmar saldo */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="CONFIRMAR PAGAMENTO">
        {confirmReceita && (
          <div className="space-y-4">
            <p className="text-gray-300 text-sm">
              Confirmar recebimento do saldo de{' '}
              <span className="text-white font-bold">{fmt(confirmReceita.valor)}</span>{' '}
              de <span className="text-white font-bold">{(confirmReceita.aluno as any)?.nome} {(confirmReceita.aluno as any)?.sobrenome}</span>?
            </p>
            <p className="text-gray-500 text-xs">Data de pagamento será registrada como hoje ({today}).</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={confirmarSaldo} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">
                {saving ? 'Confirmando...' : 'Confirmar Recebimento'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal exportar PDF renovações */}
      <Modal open={exportModal} onClose={() => setExportModal(false)} title="EXPORTAR RENOVAÇÕES">
        <div className="space-y-4">
          <div>
            <label className="label">Período</label>
            <select className="input" value={exportMes} onChange={e => setExportMes(e.target.value as 'atual' | 'proximo' | 'anterior')}>
              <option value="anterior">Mês anterior</option>
              <option value="atual">Mês atual</option>
              <option value="proximo">Próximo mês</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setExportModal(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={exportPDF} className="btn-primary flex-1 justify-center">
              <Download size={14} /> Gerar PDF
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

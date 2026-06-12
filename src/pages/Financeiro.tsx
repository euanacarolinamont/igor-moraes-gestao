import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Receita, Despesa, Aluno, Categoria } from '../lib/supabase'
import { Plus, Download, TrendingUp, Clock, DollarSign, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '../components/Modal'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const SERVICOS = [
  'Consultoria Online', 'Avaliação Física', 'Avaliação Física + Consultoria', 'Personal Trainer', 'Assinatura do Aplicativo',
]
const CATEGORIAS_PADRAO = ['Marketing', 'Software', 'Locação de Sala', 'Estagiário']
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

interface ReceitaRow extends Receita {
  aluno?: Aluno
}

function MetCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType; label: string; value: string; color: string; sub?: string
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-white text-lg font-bold mt-0.5">{value}</p>
        {sub && <p className="text-gray-500 text-xs">{sub}</p>}
      </div>
    </div>
  )
}

export default function Financeiro() {
  const [receitas, setReceitas] = useState<ReceitaRow[]>([])
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [filterReceita, setFilterReceita] = useState('todos')
  const [chartData, setChartData] = useState<{ mes: string; valor: number }[]>([])

  // Modais
  const [modalReceita, setModalReceita] = useState(false)
  const [modalDespesa, setModalDespesa] = useState(false)
  const [modalCategoria, setModalCategoria] = useState(false)
  const [modalEditReceita, setModalEditReceita] = useState(false)
  const [modalEditDespesa, setModalEditDespesa] = useState(false)
  const [editReceita, setEditReceita] = useState<ReceitaRow | null>(null)
  const [editDespesa, setEditDespesa] = useState<Despesa | null>(null)
  const [novaCategoria, setNovaCategoria] = useState('')
  const [saving, setSaving] = useState(false)
  const [receitaError, setReceitaError] = useState('')

  const makeFormReceita = () => ({
    aluno_id: '', servico: SERVICOS[0], descricao: '', valor: '', status: 'Recebido', data_vencimento: format(new Date(), 'yyyy-MM-dd'),
  })
  const [formReceita, setFormReceita] = useState(makeFormReceita())
  const [formDespesa, setFormDespesa] = useState({
    categoria: CATEGORIAS_PADRAO[0], descricao: '', valor: '', status: 'Pago', data_vencimento: format(new Date(), 'yyyy-MM-dd'),
  })

  useEffect(() => { fetchData() }, [currentMonth])

  async function fetchData() {
    setLoading(true)
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const [rRes, dRes, aRes, catRes] = await Promise.all([
      supabase.from('financeiro_receitas').select('*, aluno:alunos(id, nome, sobrenome)')
        .gte('data_vencimento', monthStart).lte('data_vencimento', monthEnd)
        .order('data_vencimento', { ascending: false }),
      supabase.from('financeiro_despesas').select('*')
        .gte('data_vencimento', monthStart).lte('data_vencimento', monthEnd)
        .order('data_vencimento', { ascending: false }),
      supabase.from('alunos').select('id, nome, sobrenome').eq('status', 'Ativo') as any,
      supabase.from('financeiro_categorias').select('*').order('nome'),
    ])
    setReceitas((rRes.data ?? []) as ReceitaRow[])
    setDespesas(dRes.data ?? [])
    setAlunos((aRes.data ?? []) as Aluno[])
    setCategorias(catRes.data ?? [])

    // Gráfico últimos 8 meses
    await fetchChartData()
    setLoading(false)
  }

  async function fetchChartData() {
    const months = Array.from({ length: 8 }, (_, i) => subMonths(new Date(), 7 - i))
    const data = await Promise.all(months.map(async (m) => {
      const start = format(startOfMonth(m), 'yyyy-MM-dd')
      const end = format(endOfMonth(m), 'yyyy-MM-dd')
      const { data } = await supabase.from('financeiro_receitas')
        .select('valor, status').gte('data_vencimento', start).lte('data_vencimento', end).eq('status', 'Recebido')
      const total = (data ?? []).reduce((s, r) => s + (r.valor ?? 0), 0)
      return { mes: format(m, 'MMM', { locale: ptBR }), valor: total }
    }))
    setChartData(data)
  }

  // Métricas gerais
  const totalRecebido = receitas.filter(r => r.status === 'Recebido').reduce((s, r) => s + r.valor, 0)
  const aguardando = receitas.filter(r => r.status === 'A receber').reduce((s, r) => s + r.valor, 0)
  const totalPeriodo = totalRecebido + aguardando

  // Cards por serviço (apenas receitas recebidas)
  const servicoStats = [
    { label: 'Av. Física', key: 'Avaliação Física' },
    { label: 'Consultoria', key: 'Consultoria Online' },
    { label: 'Av. + Consult.', key: 'Avaliação Física + Consultoria' },
    { label: 'Personal', key: 'Personal Trainer' },
  ].map(s => {
    const rows = receitas.filter(r => r.servico === s.key && r.status === 'Recebido')
    const valor = rows.reduce((sum, r) => sum + r.valor, 0)
    const qty = new Set(rows.map(r => r.agendamento_id).filter(Boolean)).size || rows.length
    return { ...s, valor, qty }
  })

  // Filtro receitas
  const filteredReceitas = receitas.filter(r => {
    if (filterReceita === 'sinal_pago') return r.tipo === 'sinal' && r.status === 'Recebido'
    if (filterReceita === 'saldo_pendente') return r.tipo === 'restante' && r.status === 'A receber'
    if (filterReceita === 'recebido') return r.status === 'Recebido'
    return true
  })

  const todasCategorias = [...CATEGORIAS_PADRAO, ...categorias.map(c => c.nome)]

  // CRUD Receita
  async function handleSaveReceita() {
    setSaving(true)
    setReceitaError('')
    const { error } = await supabase.from('financeiro_receitas').insert({
      aluno_id: formReceita.aluno_id || null,
      agendamento_id: null,
      tipo: 'manual',
      servico: formReceita.servico,
      descricao: formReceita.descricao,
      valor: parseFloat(formReceita.valor) || 0,
      status: formReceita.status as Receita['status'],
      data_vencimento: formReceita.data_vencimento,
      data_pagamento: formReceita.status === 'Recebido' ? formReceita.data_vencimento : null,
    })
    if (error) {
      console.error('Erro ao salvar receita:', error)
      setReceitaError(error.message)
    } else {
      setModalReceita(false)
      setFormReceita(makeFormReceita())
      fetchData()
    }
    setSaving(false)
  }

  async function handleEditReceita() {
    if (!editReceita) return
    setSaving(true)
    await supabase.from('financeiro_receitas').update({
      descricao: editReceita.descricao,
      valor: editReceita.valor,
      status: editReceita.status,
      data_vencimento: editReceita.data_vencimento,
      data_pagamento: editReceita.status === 'Recebido' ? (editReceita.data_pagamento || format(new Date(), 'yyyy-MM-dd')) : null,
    }).eq('id', editReceita.id)
    setModalEditReceita(false)
    fetchData()
    setSaving(false)
  }

  async function handleDeleteReceita(id: string) {
    await supabase.from('financeiro_receitas').delete().eq('id', id)
    fetchData()
  }

  // CRUD Despesa
  async function handleSaveDespesa() {
    setSaving(true)
    await supabase.from('financeiro_despesas').insert({
      categoria: formDespesa.categoria,
      descricao: formDespesa.descricao,
      valor: parseFloat(formDespesa.valor) || 0,
      status: formDespesa.status as Despesa['status'],
      data_vencimento: formDespesa.data_vencimento,
      data_pagamento: formDespesa.status === 'Pago' ? formDespesa.data_vencimento : null,
    })
    setModalDespesa(false)
    fetchData()
    setSaving(false)
  }

  async function handleEditDespesa() {
    if (!editDespesa) return
    setSaving(true)
    await supabase.from('financeiro_despesas').update({
      categoria: editDespesa.categoria,
      descricao: editDespesa.descricao,
      valor: editDespesa.valor,
      status: editDespesa.status,
      data_vencimento: editDespesa.data_vencimento,
    }).eq('id', editDespesa.id)
    setModalEditDespesa(false)
    fetchData()
    setSaving(false)
  }

  async function handleDeleteDespesa(id: string) {
    await supabase.from('financeiro_despesas').delete().eq('id', id)
    fetchData()
  }

  async function handleSaveCategoria() {
    if (!novaCategoria.trim()) return
    setSaving(true)
    const { data } = await supabase.from('financeiro_categorias').insert({ nome: novaCategoria.trim() }).select().single()
    if (data) setCategorias(prev => [...prev, data])
    setNovaCategoria('')
    setModalCategoria(false)
    setSaving(false)
  }

  // Exportações
  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const wsR = XLSX.utils.json_to_sheet(filteredReceitas.map(r => ({
      Data: r.data_vencimento,
      Aluno: (r.aluno as any) ? `${(r.aluno as any).nome} ${(r.aluno as any).sobrenome}` : '—',
      Serviço: r.servico, Descrição: r.descricao, Valor: r.valor, Status: r.status,
    })))
    const wsD = XLSX.utils.json_to_sheet(despesas.map(d => ({
      Data: d.data_vencimento, Categoria: d.categoria, Descrição: d.descricao, Valor: d.valor, Status: d.status,
    })))
    XLSX.utils.book_append_sheet(wb, wsR, 'Receitas')
    XLSX.utils.book_append_sheet(wb, wsD, 'Despesas')
    XLSX.writeFile(wb, `financeiro-${format(currentMonth, 'yyyy-MM')}.xlsx`)
  }

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Financeiro — ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, 14, 18)
    doc.setFontSize(11)
    doc.text(`Total Recebido: ${fmt(totalRecebido)}   Aguardando: ${fmt(aguardando)}`, 14, 28)
    ;(doc as any).autoTable({
      startY: 35,
      head: [['Data', 'Aluno', 'Serviço', 'Descrição', 'Valor', 'Status']],
      body: filteredReceitas.map(r => [
        r.data_vencimento,
        (r.aluno as any) ? `${(r.aluno as any).nome}` : '—',
        r.servico, r.descricao, fmt(r.valor), r.status,
      ]),
      styles: { fontSize: 8 },
    })
    const y = (doc as any).lastAutoTable.finalY + 10
    doc.text('Despesas', 14, y)
    ;(doc as any).autoTable({
      startY: y + 5,
      head: [['Data', 'Categoria', 'Descrição', 'Valor', 'Status']],
      body: despesas.map(d => [d.data_vencimento, d.categoria, d.descricao, fmt(d.valor), d.status]),
      styles: { fontSize: 8 },
    })
    doc.save(`financeiro-${format(currentMonth, 'yyyy-MM')}.pdf`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl text-white tracking-wide">FINANCEIRO</h1>
          <p className="text-gray-500 text-sm capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} className="btn-secondary text-sm"><Download size={14} /> Excel</button>
          <button onClick={exportPDF} className="btn-secondary text-sm"><Download size={14} /> PDF</button>
        </div>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetCard icon={TrendingUp} label="Total Recebido no Período" value={fmt(totalRecebido)} color="bg-green-700" />
        <MetCard icon={Clock} label="Aguardando Pagamento" value={fmt(aguardando)} color="bg-yellow-700" />
        <MetCard icon={DollarSign} label="Total do Período" value={fmt(totalPeriodo)} color="bg-blue-700" />
      </div>

      {/* Cards por serviço */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {servicoStats.map(s => (
          <div key={s.key} className="card">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">{s.label}</p>
            <p className="text-white text-lg font-bold">{fmt(s.valor)}</p>
            <p className="text-gray-500 text-xs mt-1">{s.qty} atendimento(s)</p>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="card">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">Receita Mensal — Últimos 8 Meses</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="mes" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6 }}
              labelStyle={{ color: '#fff' }}
              formatter={(v: any) => [fmt(Number(v) || 0), 'Receita']}
            />
            <Bar dataKey="valor" fill="#C8102E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela Receitas */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-1.5 rounded bg-surface-2 hover:bg-border text-gray-400 hover:text-white transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-white text-sm font-medium w-32 text-center capitalize">
              {format(currentMonth, 'MMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentMonth(m => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n })} className="p-1.5 rounded bg-surface-2 hover:bg-border text-gray-400 hover:text-white transition-colors">
              <ChevronRight size={15} />
            </button>
            <select value={filterReceita} onChange={e => setFilterReceita(e.target.value)} className="input w-48 ml-2">
              <option value="todos">Todos</option>
              <option value="sinal_pago">Sinal Pago</option>
              <option value="saldo_pendente">Saldo Pendente</option>
              <option value="recebido">Recebido</option>
            </select>
          </div>
          <button onClick={() => { setModalReceita(true); setReceitaError(''); setFormReceita(makeFormReceita()) }} className="btn-primary text-sm"><Plus size={14} /> Nova Receita</button>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2 bg-surface-2 border-b border-border">
            <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Receitas</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Aluno</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Serviço</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Descrição</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-gray-400 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredReceitas.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-500">Nenhuma receita encontrada</td></tr>
                ) : filteredReceitas.map(r => (
                  <tr key={r.id} className="border-b border-border hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{r.data_vencimento}</td>
                    <td className="px-4 py-3 text-white">
                      {(r.aluno as any) ? `${(r.aluno as any).nome} ${(r.aluno as any).sobrenome}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-primary/20 text-primary border border-primary/40 rounded px-1.5 py-0.5 truncate max-w-[120px] block">
                        {r.servico}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-[180px] truncate">{r.descricao}</td>
                    <td className="px-4 py-3 text-white text-right font-medium whitespace-nowrap">{fmt(r.valor)}</td>
                    <td className="px-4 py-3">
                      {r.tipo === 'sinal' ? (
                        <span className={`text-xs rounded px-2 py-0.5 font-semibold ${r.status === 'Recebido' ? 'bg-green-900/40 text-green-400 border border-green-800' : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800'}`}>
                          {r.status === 'Recebido' ? 'SINAL PAGO' : 'AGUARD. SINAL'}
                        </span>
                      ) : r.tipo === 'restante' ? (
                        <span className={`text-xs rounded px-2 py-0.5 font-semibold ${r.status === 'Recebido' ? 'bg-green-900/40 text-green-400 border border-green-800' : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800'}`}>
                          {r.status === 'Recebido' ? 'PAGO' : 'PENDENTE'}
                        </span>
                      ) : (
                        <span className={r.status === 'Recebido' ? 'badge-ativo' : 'badge-vencido'}>{r.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditReceita(r); setModalEditReceita(true) }} className="p-1 rounded text-gray-500 hover:text-white hover:bg-surface-2 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteReceita(r.id)} className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-surface-2 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tabela Despesas */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Despesas & Reembolsos</p>
          <div className="flex gap-2">
            <button onClick={() => setModalCategoria(true)} className="btn-secondary text-sm"><Plus size={14} /> Nova Categoria</button>
            <button onClick={() => setModalDespesa(true)} className="btn-primary text-sm"><Plus size={14} /> Nova Despesa</button>
          </div>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Descrição</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {despesas.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-500">Nenhuma despesa</td></tr>
                ) : despesas.map(d => (
                  <tr key={d.id} className="border-b border-border hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{d.data_vencimento}</td>
                    <td className="px-4 py-3 text-white">{d.categoria}</td>
                    <td className="px-4 py-3 text-gray-400">{d.descricao}</td>
                    <td className="px-4 py-3 text-white text-right font-medium">{fmt(d.valor)}</td>
                    <td className="px-4 py-3">
                      <span className={d.status === 'Pago' ? 'badge-ativo' : 'badge-vencido'}>{d.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditDespesa(d); setModalEditDespesa(true) }} className="p-1 rounded text-gray-500 hover:text-white hover:bg-surface-2 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteDespesa(d.id)} className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-surface-2 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Nova Receita */}
      <Modal open={modalReceita} onClose={() => setModalReceita(false)} title="NOVA RECEITA">
        <div className="space-y-4">
          <div>
            <label className="label">Aluno</label>
            <select className="input" value={formReceita.aluno_id} onChange={e => setFormReceita(f => ({ ...f, aluno_id: e.target.value }))}>
              <option value="">Nenhum</option>
              {alunos.map(a => <option key={a.id} value={a.id}>{a.nome} {a.sobrenome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Serviço</label>
            <select className="input" value={formReceita.servico} onChange={e => setFormReceita(f => ({ ...f, servico: e.target.value }))}>
              {SERVICOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={formReceita.descricao} onChange={e => setFormReceita(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input className="input" type="number" value={formReceita.valor} onChange={e => setFormReceita(f => ({ ...f, valor: e.target.value }))} />
            </div>
            <div>
              <label className="label">Data</label>
              <input className="input" type="date" value={formReceita.data_vencimento} onChange={e => setFormReceita(f => ({ ...f, data_vencimento: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={formReceita.status} onChange={e => setFormReceita(f => ({ ...f, status: e.target.value }))}>
              <option>Recebido</option><option>A receber</option>
            </select>
          </div>
          {receitaError && (
            <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{receitaError}</div>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setModalReceita(false); setReceitaError('') }} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={handleSaveReceita} disabled={saving || !formReceita.valor} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      {/* Modal Editar Receita */}
      <Modal open={modalEditReceita} onClose={() => setModalEditReceita(false)} title="EDITAR RECEITA">
        {editReceita && (
          <div className="space-y-4">
            <div>
              <label className="label">Descrição</label>
              <input className="input" value={editReceita.descricao} onChange={e => setEditReceita(r => r ? { ...r, descricao: e.target.value } : r)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" type="number" value={editReceita.valor} onChange={e => setEditReceita(r => r ? { ...r, valor: parseFloat(e.target.value) || 0 } : r)} />
              </div>
              <div>
                <label className="label">Data</label>
                <input className="input" type="date" value={editReceita.data_vencimento} onChange={e => setEditReceita(r => r ? { ...r, data_vencimento: e.target.value } : r)} />
              </div>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={editReceita.status} onChange={e => setEditReceita(r => r ? { ...r, status: e.target.value as Receita['status'] } : r)}>
                <option>Recebido</option><option>A receber</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalEditReceita(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={handleEditReceita} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Nova Despesa */}
      <Modal open={modalDespesa} onClose={() => setModalDespesa(false)} title="NOVA DESPESA / REEMBOLSO">
        <div className="space-y-4">
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={formDespesa.categoria} onChange={e => setFormDespesa(f => ({ ...f, categoria: e.target.value }))}>
              {todasCategorias.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={formDespesa.descricao} onChange={e => setFormDespesa(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input className="input" type="number" value={formDespesa.valor} onChange={e => setFormDespesa(f => ({ ...f, valor: e.target.value }))} />
            </div>
            <div>
              <label className="label">Data</label>
              <input className="input" type="date" value={formDespesa.data_vencimento} onChange={e => setFormDespesa(f => ({ ...f, data_vencimento: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={formDespesa.status} onChange={e => setFormDespesa(f => ({ ...f, status: e.target.value }))}>
              <option>Pago</option><option>A pagar</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setModalDespesa(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={handleSaveDespesa} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      {/* Modal Editar Despesa */}
      <Modal open={modalEditDespesa} onClose={() => setModalEditDespesa(false)} title="EDITAR DESPESA">
        {editDespesa && (
          <div className="space-y-4">
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={editDespesa.categoria} onChange={e => setEditDespesa(d => d ? { ...d, categoria: e.target.value } : d)}>
                {todasCategorias.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Descrição</label>
              <input className="input" value={editDespesa.descricao} onChange={e => setEditDespesa(d => d ? { ...d, descricao: e.target.value } : d)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" type="number" value={editDespesa.valor} onChange={e => setEditDespesa(d => d ? { ...d, valor: parseFloat(e.target.value) || 0 } : d)} />
              </div>
              <div>
                <label className="label">Data</label>
                <input className="input" type="date" value={editDespesa.data_vencimento} onChange={e => setEditDespesa(d => d ? { ...d, data_vencimento: e.target.value } : d)} />
              </div>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={editDespesa.status} onChange={e => setEditDespesa(d => d ? { ...d, status: e.target.value as Despesa['status'] } : d)}>
                <option>Pago</option><option>A pagar</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalEditDespesa(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={handleEditDespesa} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Nova Categoria */}
      <Modal open={modalCategoria} onClose={() => setModalCategoria(false)} title="NOVA CATEGORIA">
        <div className="space-y-4">
          <div>
            <label className="label">Nome da Categoria</label>
            <input className="input" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Ex: Transporte" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setModalCategoria(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={handleSaveCategoria} disabled={saving || !novaCategoria} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? 'Criando...' : 'Criar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

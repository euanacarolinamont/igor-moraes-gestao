import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Agendamento, Aluno } from '../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, getDay, parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react'
import Modal from '../components/Modal'

const SERVICOS = [
  'Consultoria Online',
  'Avaliação Física',
  'Avaliação Física + Consultoria',
  'Personal Trainer',
  'Assinatura do Aplicativo',
]

// quinta=4, sábado=6
const DIAS_FIXOS = [4, 6]
const HORARIOS: Record<number, string[]> = {
  4: ['07:00', '09:00'],
  6: ['08:00', '10:00'],
}
const DIA_LABEL: Record<number, string> = { 4: 'QUINTA-FEIRA', 6: 'SÁBADO' }

type SlotEstado = 'livre' | 'ocupado' | 'indisponivel'

interface Slot {
  data: string
  horario: string
  diaSemana: number
  agendamento?: Agendamento & { aluno?: Aluno }
  estado: SlotEstado
  observacao?: string
}

const emptyForm = {
  aluno_id: '',
  servico: SERVICOS[0],
  sinal_status: 'Aguardando Pagamento' as Agendamento['sinal_status'],
  sinal_valor: '',
  valor_total: '',
  observacoes: '',
}

export default function Agenda() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [agendamentos, setAgendamentos] = useState<(Agendamento & { aluno?: Aluno })[]>([])
  const [indisponiveis, setIndisponiveis] = useState<{ data: string; horario: string; observacao: string }[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [slots, setSlots] = useState<Slot[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ data: string; horario: string; diaSemana: number } | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [alunoSearch, setAlunoSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [fecharObs, setFecharObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [agendError, setAgendError] = useState('')

  const [editModal, setEditModal] = useState(false)
  const [editAgend, setEditAgend] = useState<(Agendamento & { aluno?: Aluno }) | null>(null)
  const [editForm, setEditForm] = useState({ sinal_status: 'Aguardando Pagamento' as Agendamento['sinal_status'], sinal_valor: '', servico: '' })

  // Edit/reactivate indisponivel
  const [editIndispModal, setEditIndispModal] = useState(false)
  const [editIndispSlot, setEditIndispSlot] = useState<{ data: string; horario: string; observacao: string } | null>(null)
  const [editIndispObs, setEditIndispObs] = useState('')

  useEffect(() => { fetchData() }, [currentMonth])

  async function fetchData() {
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const [agendRes, alunosRes] = await Promise.all([
      supabase.from('agendamentos').select('*').gte('data', monthStart).lte('data', monthEnd),
      supabase.from('alunos').select('id, nome, sobrenome, telefone, servico_contratado').eq('status', 'Ativo').order('nome'),
    ])

    if (agendRes.error) {
      console.error('[Agenda] Erro ao buscar agendamentos:', agendRes.error)
    } else {
      const alunosList = (alunosRes.data ?? []) as Aluno[]
      const agends = (agendRes.data ?? []).map(a => ({
        ...a,
        aluno: alunosList.find(al => al.id === a.aluno_id),
      })) as (Agendamento & { aluno?: Aluno })[]
      setAgendamentos(agends)
      buildSlots(agends)
    }
    if (!alunosRes.error) {
      setAlunos((alunosRes.data ?? []) as Aluno[])
    }
  }

  function buildSlots(agends: (Agendamento & { aluno?: Aluno })[]) {
    const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
    const result: Slot[] = []
    for (const day of days) {
      const dow = getDay(day)
      if (!DIAS_FIXOS.includes(dow)) continue
      const horarios = HORARIOS[dow]
      const dateStr = format(day, 'yyyy-MM-dd')
      for (const horario of horarios) {
        // Normaliza valores vindos do banco: coluna date→'yyyy-MM-dd', time→'HH:mm:ss'
        // Usa slice(0,10) para data e slice(0,5) para horario para suportar ambos os tipos
        const agend = agends.find(a =>
          (a.data ?? '').slice(0, 10) === dateStr &&
          (a.horario ?? '').slice(0, 5) === horario
        )
        const indisp = indisponiveis.find(i => i.data === dateStr && i.horario === horario)
        result.push({
          data: dateStr,
          horario,
          diaSemana: dow,
          agendamento: agend,
          estado: agend ? 'ocupado' : indisp ? 'indisponivel' : 'livre',
          observacao: indisp?.observacao,
        })
      }
    }
    setSlots(result)
  }

  useEffect(() => { buildSlots(agendamentos) }, [indisponiveis])

  function openSlot(slot: Slot) {
    if (slot.estado !== 'livre') return
    setSelectedSlot({ data: slot.data, horario: slot.horario, diaSemana: slot.diaSemana })
    setForm(emptyForm)
    setAlunoSearch('')
    setFecharObs('')
    setShowDropdown(false)
    setAgendError('')
    setModalOpen(true)
  }

  async function handleSalvarAgendamento() {
    if (!selectedSlot || !form.aluno_id) return
    setSaving(true)
    setAgendError('')
    const aluno = alunos.find(a => a.id === form.aluno_id)
    const sinalValor = parseFloat(form.sinal_valor) || 0
    const valorTotal = parseFloat(form.valor_total) || 0
    const saldoValor = Math.max(0, valorTotal - sinalValor)

    const { data: agend, error: agendInsertError } = await supabase.from('agendamentos').insert({
      aluno_id: form.aluno_id,
      data: selectedSlot.data,
      horario: selectedSlot.horario,
      servico: form.servico,
      sinal_valor: sinalValor,
      sinal_status: form.sinal_status,
    }).select().single()

    if (agendInsertError || !agend) {
      console.error('Erro ao salvar agendamento:', agendInsertError)
      setAgendError(agendInsertError?.message ?? 'Erro desconhecido ao salvar agendamento.')
      setSaving(false)
      return
    }

    const alunoInfo = alunos.find(a => a.id === form.aluno_id)
    const newAgend: Agendamento & { aluno?: Aluno } = { ...agend, aluno: alunoInfo }

    await supabase.from('financeiro_receitas').insert([
      {
        aluno_id: form.aluno_id,
        agendamento_id: agend.id,
        tipo: 'sinal',
        servico: form.servico,
        descricao: `Sinal — ${aluno?.nome} ${aluno?.sobrenome} — ${selectedSlot.data} ${selectedSlot.horario}`,
        valor: sinalValor,
        status: form.sinal_status === 'Pago' ? 'Recebido' : 'A receber',
        data_vencimento: selectedSlot.data,
        data_pagamento: form.sinal_status === 'Pago' ? selectedSlot.data : null,
      },
      {
        aluno_id: form.aluno_id,
        agendamento_id: agend.id,
        tipo: 'restante',
        servico: form.servico,
        descricao: `Saldo — ${aluno?.nome} ${aluno?.sobrenome}`,
        valor: saldoValor,
        status: 'A receber',
        data_vencimento: selectedSlot.data,
        data_pagamento: null,
      },
    ])
    await supabase.from('alunos').update({ servico_contratado: form.servico }).eq('id', form.aluno_id)

    // Atualiza slot diretamente — não depende da cadeia setAgendamentos → useEffect → buildSlots
    setSlots(prev => prev.map(s =>
      s.data === selectedSlot!.data && s.horario === selectedSlot!.horario
        ? { ...s, agendamento: newAgend, estado: 'ocupado' as Slot['estado'] }
        : s
    ))
    setAgendamentos(prev => [...prev, newAgend])
    setModalOpen(false)
    setSaving(false)
    fetchData()
  }

  async function handleFecharData() {
    if (!selectedSlot) return
    setSaving(true)
    setIndisponiveis(prev => [...prev, { data: selectedSlot.data, horario: selectedSlot.horario, observacao: fecharObs }])
    setModalOpen(false)
    setSaving(false)
  }

  function openEditIndisp(slot: Slot) {
    const indisp = indisponiveis.find(i => i.data === slot.data && i.horario === slot.horario)
    if (!indisp) return
    setEditIndispSlot(indisp)
    setEditIndispObs(indisp.observacao)
    setEditIndispModal(true)
  }

  function handleSaveIndisp() {
    if (!editIndispSlot) return
    setIndisponiveis(prev => prev.map(i =>
      i.data === editIndispSlot.data && i.horario === editIndispSlot.horario
        ? { ...i, observacao: editIndispObs }
        : i
    ))
    setEditIndispModal(false)
  }

  function handleReativarSlot() {
    if (!editIndispSlot) return
    setIndisponiveis(prev => prev.filter(i =>
      !(i.data === editIndispSlot.data && i.horario === editIndispSlot.horario)
    ))
    setEditIndispModal(false)
  }

  async function handleDeleteAgend(id: string) {
    await supabase.from('agendamentos').delete().eq('id', id)
    await supabase.from('financeiro_receitas').delete().eq('agendamento_id', id)
    fetchData()
  }

  function openEdit(agend: Agendamento & { aluno?: Aluno }) {
    setEditAgend(agend)
    setEditForm({ sinal_status: agend.sinal_status, sinal_valor: String(agend.sinal_valor), servico: agend.servico })
    setEditModal(true)
  }

  async function handleSaveEdit() {
    if (!editAgend) return
    setSaving(true)
    const sinalValor = parseFloat(editForm.sinal_valor) || 0
    await supabase.from('agendamentos').update({
      sinal_status: editForm.sinal_status,
      sinal_valor: sinalValor,
      servico: editForm.servico,
    }).eq('id', editAgend.id)

    await supabase.from('financeiro_receitas').update({
      status: editForm.sinal_status === 'Pago' ? 'Recebido' : 'A receber',
      valor: sinalValor,
      data_pagamento: editForm.sinal_status === 'Pago' ? format(new Date(), 'yyyy-MM-dd') : null,
    }).eq('agendamento_id', editAgend.id).eq('tipo', 'sinal')

    setEditModal(false)
    fetchData()
    setSaving(false)
  }

  const filteredAlunos = alunos.filter(a =>
    !alunoSearch || `${a.nome} ${a.sobrenome}`.toLowerCase().includes(alunoSearch.toLowerCase())
  )

  const selectedAluno = alunos.find(a => a.id === form.aluno_id)

  // Group slots by date for 2-column grid layout
  const slotsByDate = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    if (!acc[s.data]) acc[s.data] = []
    acc[s.data].push(s)
    return acc
  }, {})
  const sortedDates = Object.keys(slotsByDate).sort()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-white tracking-wide">AGENDA</h1>
          <p className="text-gray-500 text-sm">Quintas: 07h e 09h · Sábados: 08h e 10h</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 rounded bg-surface-2 hover:bg-border text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-white font-semibold w-44 text-center capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 rounded bg-surface-2 hover:bg-border text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Slots grid */}
      {sortedDates.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">Nenhum slot neste mês</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedDates.map(date => (
            slotsByDate[date].map(slot => {
              const dow = slot.diaSemana
              const dateLabel = format(parseISO(slot.data), "dd/MM/yyyy")

              if (slot.estado === 'livre') {
                return (
                  <button
                    key={`${slot.data}-${slot.horario}`}
                    onClick={() => openSlot(slot)}
                    className="text-left rounded-lg p-4 transition-all hover:border-primary"
                    style={{ background: '#1a1a1a', border: '1.5px dashed #C8102E' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-primary text-xs font-bold tracking-widest">{DIA_LABEL[dow]}</span>
                      <span className="text-gray-500 text-xs">{dateLabel}</span>
                    </div>
                    <p className="font-heading text-4xl text-primary tracking-wider">{slot.horario}</p>
                    <p className="text-gray-500 text-sm italic mt-2">+ Disponível — clique para agendar</p>
                  </button>
                )
              }

              if (slot.estado === 'indisponivel') {
                return (
                  <div
                    key={`${slot.data}-${slot.horario}`}
                    className="rounded-lg p-4 group"
                    style={{ background: '#111', border: '1.5px solid #2a2a2a' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-600 text-xs font-bold tracking-widest">{DIA_LABEL[dow]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs">{dateLabel}</span>
                        <button
                          onClick={() => openEditIndisp(slot)}
                          className="p-1 rounded bg-surface-2 hover:bg-border text-gray-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                          title="Editar / Reativar slot"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="font-heading text-4xl text-gray-600 tracking-wider">{slot.horario}</p>
                    <p className="text-gray-600 text-sm mt-2">Indisponível</p>
                    {slot.observacao && <p className="text-gray-700 text-xs mt-1 italic">{slot.observacao}</p>}
                  </div>
                )
              }

              // ocupado
              const agend = slot.agendamento!
              const isPago = agend.sinal_status === 'Pago'
              return (
                <div
                  key={`${slot.data}-${slot.horario}`}
                  className="rounded-lg p-4 relative group"
                  style={{ background: '#1a0a0a', border: '1.5px solid #C8102E' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-primary text-xs font-bold tracking-widest">{DIA_LABEL[dow]}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs">{dateLabel}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(agend)}
                          className="p-1 rounded bg-surface-2 hover:bg-border text-gray-400 hover:text-white transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteAgend(agend.id)}
                          className="p-1 rounded bg-surface-2 hover:bg-red-900 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="font-heading text-4xl text-primary tracking-wider">{slot.horario}</p>
                  <p className="text-white font-bold text-lg mt-2">{(agend.aluno as any)?.nome} {(agend.aluno as any)?.sobrenome}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-primary/20 text-primary border border-primary/40 rounded px-2 py-0.5 truncate max-w-[160px]">
                      {agend.servico}
                    </span>
                    <span className={`text-xs rounded px-2 py-0.5 font-semibold ${isPago ? 'bg-green-900/40 text-green-400 border border-green-800' : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800'}`}>
                      {isPago ? 'SINAL PAGO' : 'AGUARD. SINAL'}
                    </span>
                  </div>
                </div>
              )
            })
          ))}
        </div>
      )}

      {/* Modal Agendamento */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedSlot ? `AGENDAR — ${DIA_LABEL[selectedSlot.diaSemana]?.slice(0, 3)}, ${selectedSlot.data ? format(parseISO(selectedSlot.data), 'dd/MM/yyyy') : ''} ÀS ${selectedSlot.horario}` : 'AGENDAR'}
      >
        {selectedSlot && (
          <div className="space-y-4">
            {/* Aluno search */}
            <div>
              <label className="label">Aluno *</label>
              <div className="relative">
                <input
                  className="input"
                  value={selectedAluno ? `${selectedAluno.nome} ${selectedAluno.sobrenome}` : alunoSearch}
                  onChange={e => {
                    setAlunoSearch(e.target.value)
                    setForm(f => ({ ...f, aluno_id: '' }))
                    setShowDropdown(true)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Digite o nome do aluno..."
                />
                {form.aluno_id && (
                  <button onClick={() => { setForm(f => ({ ...f, aluno_id: '' })); setAlunoSearch('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
              {showDropdown && !form.aluno_id && (
                <div className="bg-surface-2 border border-border rounded mt-1 max-h-40 overflow-y-auto">
                  {filteredAlunos.length === 0 ? (
                    <p className="text-gray-500 text-sm p-3">Nenhum aluno</p>
                  ) : filteredAlunos.slice(0, 8).map(a => (
                    <button key={a.id} onClick={() => { setForm(f => ({ ...f, aluno_id: a.id })); setAlunoSearch(''); setShowDropdown(false) }}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-border transition-colors">
                      {a.nome} {a.sobrenome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">Tipo de Serviço</label>
              <select className="input" value={form.servico} onChange={e => setForm(f => ({ ...f, servico: e.target.value }))}>
                {SERVICOS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Valor do Sinal (R$) *</label>
                <input className="input" type="number" value={form.sinal_valor} onChange={e => setForm(f => ({ ...f, sinal_valor: e.target.value }))} placeholder="0,00" />
              </div>
              <div>
                <label className="label">Valor Total (R$)</label>
                <input className="input" type="number" value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} placeholder="0,00" />
              </div>
            </div>

            <div>
              <label className="label">Status do Sinal *</label>
              <select className="input" value={form.sinal_status} onChange={e => setForm(f => ({ ...f, sinal_status: e.target.value as Agendamento['sinal_status'] }))}>
                <option value="Aguardando Pagamento">Aguardando Sinal</option>
                <option value="Pago">Sinal Pago</option>
              </select>
            </div>

            <div>
              <label className="label">Observações</label>
              <textarea className="input h-16 resize-none" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

            <div className="border-t border-border pt-3">
              <label className="label">Fechar Data — Motivo da Indisponibilidade</label>
              <input className="input" value={fecharObs} onChange={e => setFecharObs(e.target.value)} placeholder="Ex: Viagem, compromisso..." />
            </div>

            {agendError && (
              <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">
                {agendError}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setModalOpen(false); setAgendError('') }} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={handleFecharData} disabled={saving} className="btn-secondary justify-center px-3 disabled:opacity-50" style={{ borderColor: '#555', color: '#aaa' }}>
                Fechar Data
              </button>
              <button onClick={handleSalvarAgendamento} disabled={saving || !form.aluno_id || !form.sinal_valor} className="btn-primary flex-1 justify-center disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Editar Agendamento */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="EDITAR AGENDAMENTO">
        {editAgend && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              {(editAgend.aluno as any)?.nome} {(editAgend.aluno as any)?.sobrenome} — {editAgend.data} {editAgend.horario}
            </p>
            <div>
              <label className="label">Serviço</label>
              <select className="input" value={editForm.servico} onChange={e => setEditForm(f => ({ ...f, servico: e.target.value }))}>
                {SERVICOS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Valor do Sinal (R$)</label>
              <input className="input" type="number" value={editForm.sinal_valor} onChange={e => setEditForm(f => ({ ...f, sinal_valor: e.target.value }))} />
            </div>
            <div>
              <label className="label">Status do Sinal</label>
              <select className="input" value={editForm.sinal_status} onChange={e => setEditForm(f => ({ ...f, sinal_status: e.target.value as Agendamento['sinal_status'] }))}>
                <option value="Aguardando Pagamento">Aguardando Sinal</option>
                <option value="Pago">Sinal Pago</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditModal(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={handleSaveEdit} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Editar / Reativar Slot Indisponível */}
      <Modal open={editIndispModal} onClose={() => setEditIndispModal(false)} title="SLOT INDISPONÍVEL">
        {editIndispSlot && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              {editIndispSlot.data} às {editIndispSlot.horario}
            </p>
            <div>
              <label className="label">Observação</label>
              <textarea
                className="input h-20 resize-none"
                value={editIndispObs}
                onChange={e => setEditIndispObs(e.target.value)}
                placeholder="Motivo da indisponibilidade..."
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditIndispModal(false)} className="btn-secondary flex-1 justify-center">
                Cancelar
              </button>
              <button
                onClick={handleReativarSlot}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold rounded px-4 py-2 border transition-colors"
                style={{ background: '#0a1f0a', borderColor: '#2d6a2d', color: '#4ade80' }}
              >
                Reativar Slot
              </button>
              <button onClick={handleSaveIndisp} className="btn-primary flex-1 justify-center">
                Salvar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

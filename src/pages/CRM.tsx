import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CrmCard, Aluno } from '../lib/supabase'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Phone, GripVertical, X, Check } from 'lucide-react'
import Modal from '../components/Modal'
import { format, addDays, differenceInCalendarDays, parseISO } from 'date-fns'

type Coluna = CrmCard['coluna']

const COLUNAS: { key: Coluna; label: string; color: string }[] = [
  { key: 'novo_lead', label: 'Novo Lead', color: 'border-blue-500' },
  { key: 'em_nutricao', label: 'Em Nutrição', color: 'border-yellow-500' },
  { key: 'proposta_enviada', label: 'Proposta Enviada', color: 'border-orange-500' },
  { key: 'renovacao', label: 'Renovação', color: 'border-purple-500' },
  { key: 'finalizado', label: 'Finalizado', color: 'border-gray-500' },
]

const SERVICOS = [
  'Consultoria Online', 'Avaliação Física', 'Avaliação Física + Consultoria', 'Personal Trainer', 'Assinatura do Aplicativo',
]

const emptyForm = {
  nome: '', telefone: '', servico_interesse: SERVICOS[0], observacoes: '', aluno_id: '',
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className="flex-1 p-2 space-y-2 min-h-[200px] transition-colors rounded-b-lg"
      style={{ background: isOver ? 'rgba(200,16,46,0.07)' : undefined }}
    >
      {children}
    </div>
  )
}

interface SortableCardProps {
  card: CrmCard
  onDelete: (id: string) => void
  onConvert: (card: CrmCard) => void
  onNotConvert: (id: string) => void
}

function SortableCard({ card, onDelete, onConvert, onNotConvert }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="bg-surface-2 border border-border rounded-lg p-3 select-none group">
      <div className="flex items-start gap-2">
        <button {...listeners} {...attributes} className="mt-0.5 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing">
          <GripVertical size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{card.nome}</p>
          {card.telefone && (
            <div className="flex items-center gap-1 mt-1 text-gray-500 text-xs">
              <Phone size={11} /><span>{card.telefone}</span>
            </div>
          )}
          <p className="text-gray-500 text-xs mt-1 truncate">{card.servico_interesse}</p>
          {card.observacoes && <p className="text-gray-600 text-xs mt-1 truncate italic">{card.observacoes}</p>}
          {(card.aluno as any) && (
            <span className="inline-block mt-1 text-xs bg-primary/20 text-primary border border-primary/30 rounded px-1.5 py-0.5">
              Aluno vinculado
            </span>
          )}
        </div>
        <button onClick={() => onDelete(card.id)} className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
          <X size={13} />
        </button>
      </div>

      {card.coluna === 'finalizado' && card.convertido == null && (
        <div className="flex gap-1 mt-3 border-t border-border pt-2">
          <button onClick={() => onConvert(card)} className="flex-1 flex items-center justify-center gap-1 text-xs bg-green-900/40 hover:bg-green-900/60 text-green-400 border border-green-800 rounded py-1 transition-colors">
            <Check size={12} /> Convertido
          </button>
          <button onClick={() => onNotConvert(card.id)} className="flex-1 flex items-center justify-center gap-1 text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-800 rounded py-1 transition-colors">
            <X size={12} /> Não Convertido
          </button>
        </div>
      )}
      {card.convertido === true && (
        <div className="mt-2 text-xs text-green-400 border border-green-800 bg-green-900/20 rounded px-2 py-1">
          ✓ Convertido — {card.servico_convertido}
        </div>
      )}
      {card.convertido === false && (
        <div className="mt-2 text-xs text-gray-500 border border-border rounded px-2 py-1">Não convertido</div>
      )}
    </div>
  )
}

export default function CRM() {
  const [cards, setCards] = useState<CrmCard[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(true)
  const [newCardCol, setNewCardCol] = useState<Coluna | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [cardError, setCardError] = useState('')
  const [convertCard, setConvertCard] = useState<CrmCard | null>(null)
  const [convertForm, setConvertForm] = useState({ servico: SERVICOS[0], valor: '', valorSinal: '' })
  const [activeCard, setActiveCard] = useState<CrmCard | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const in45 = format(addDays(new Date(), 45), 'yyyy-MM-dd')

    const [cardsRes, alunosRes, renovacaoRes] = await Promise.all([
      supabase.from('crm_cards').select('*, aluno:alunos(nome, sobrenome)').order('created_at'),
      supabase.from('alunos').select('id, nome, sobrenome, telefone, servico_contratado, data_vencimento').eq('status', 'Ativo'),
      supabase.from('alunos').select('id, nome, sobrenome, telefone, servico_contratado, data_vencimento')
        .eq('status', 'Ativo')
        .gte('data_vencimento', today)
        .lte('data_vencimento', in45),
    ])

    const existingCards = (cardsRes.data ?? []) as CrmCard[]
    const alunosRenovacao = renovacaoRes.data ?? []

    const alunoIdsComCards = new Set(existingCards.map(c => c.aluno_id).filter(Boolean))
    const toCreate = alunosRenovacao.filter(aluno => !alunoIdsComCards.has(aluno.id))

    if (toCreate.length > 0) {
      const novosCards = toCreate.map(aluno => {
        const diasRestantes = differenceInCalendarDays(parseISO(aluno.data_vencimento), new Date())
        return {
          nome: `${aluno.nome} ${aluno.sobrenome}`,
          telefone: aluno.telefone ?? '',
          servico_interesse: aluno.servico_contratado ?? '',
          observacoes: `Renovação automática — vence em ${diasRestantes} dia(s)`,
          coluna: 'renovacao' as Coluna,
          aluno_id: aluno.id,
          convertido: null,
          servico_convertido: null,
          valor_convertido: null,
        }
      })
      const { data: created } = await supabase.from('crm_cards').insert(novosCards).select('*, aluno:alunos(nome, sobrenome)')
      if (created) {
        setCards([...existingCards, ...(created as CrmCard[])])
      } else {
        setCards(existingCards)
      }
    } else {
      setCards(existingCards)
    }

    setAlunos((alunosRes.data ?? []) as Aluno[])
    setLoading(false)
  }

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find(c => c.id === event.active.id)
    setActiveCard(card ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over) return

    // over.id is either a column key (from useDroppable) or a card id (from useSortable)
    const overIsColumn = COLUNAS.find(c => c.key === (over.id as string))
    const targetColuna: Coluna | undefined = overIsColumn
      ? (over.id as Coluna)
      : cards.find(c => c.id === over.id)?.coluna

    if (!targetColuna) return

    const draggedCard = cards.find(c => c.id === active.id)
    if (!draggedCard || draggedCard.coluna === targetColuna) return

    // Optimistic update
    setCards(prev => prev.map(c => c.id === active.id ? { ...c, coluna: targetColuna } : c))
    const { error } = await supabase.from('crm_cards').update({ coluna: targetColuna }).eq('id', active.id)
    if (error) {
      console.error('Erro ao mover card:', error)
      // Revert
      setCards(prev => prev.map(c => c.id === active.id ? { ...c, coluna: draggedCard.coluna } : c))
    }
  }

  async function handleAddCard() {
    if (!form.nome.trim() || !newCardCol) return
    setSaving(true)
    setCardError('')
    const { data, error } = await supabase.from('crm_cards').insert({
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      servico_interesse: form.servico_interesse,
      observacoes: form.observacoes.trim() || null,
      coluna: newCardCol,
      aluno_id: form.aluno_id || null,
      convertido: null,
      servico_convertido: null,
      valor_convertido: null,
    }).select('*, aluno:alunos(nome, sobrenome)').single()
    if (error) {
      console.error('Erro ao criar card:', error)
      setCardError(error.message)
    } else if (data) {
      setCards(prev => [...prev, data as CrmCard])
      setForm(emptyForm)
      setNewCardCol(null)
    }
    setSaving(false)
  }

  async function handleDeleteCard(id: string) {
    await supabase.from('crm_cards').delete().eq('id', id)
    setCards(prev => prev.filter(c => c.id !== id))
  }

  async function handleConvert() {
    if (!convertCard) return
    const valorTotal = parseFloat(convertForm.valor) || 0
    const valorSinal = parseFloat(convertForm.valorSinal) || valorTotal
    const saldoValor = Math.max(0, valorTotal - valorSinal)
    const today = format(new Date(), 'yyyy-MM-dd')

    // Atualiza o card
    await supabase.from('crm_cards').update({
      convertido: true,
      servico_convertido: convertForm.servico,
      valor_convertido: valorTotal,
    }).eq('id', convertCard.id)

    // Atualiza servico_contratado do aluno (sempre que tiver aluno vinculado)
    if (convertCard.aluno_id) {
      await supabase.from('alunos').update({ servico_contratado: convertForm.servico }).eq('id', convertCard.aluno_id)
    }

    // Cria receitas no financeiro se houver aluno vinculado e valor
    if (convertCard.aluno_id && valorTotal > 0) {
      const receitas: object[] = [
        {
          aluno_id: convertCard.aluno_id,
          agendamento_id: null,
          tipo: 'sinal',
          servico: convertForm.servico,
          descricao: `Conversão CRM — ${convertCard.nome} — ${convertForm.servico}`,
          valor: valorSinal,
          status: 'A receber',
          data_vencimento: today,
          data_pagamento: null,
        },
      ]
      if (saldoValor > 0) {
        receitas.push({
          aluno_id: convertCard.aluno_id,
          agendamento_id: null,
          tipo: 'restante',
          servico: convertForm.servico,
          descricao: `Saldo — ${convertCard.nome}`,
          valor: saldoValor,
          status: 'A receber',
          data_vencimento: today,
          data_pagamento: null,
        })
      }
      await supabase.from('financeiro_receitas').insert(receitas)
    }

    setCards(prev => prev.map(c => c.id === convertCard.id ? {
      ...c, convertido: true, servico_convertido: convertForm.servico, valor_convertido: valorTotal,
    } : c))
    setConvertCard(null)
    setConvertForm({ servico: SERVICOS[0], valor: '', valorSinal: '' })
  }

  async function handleNotConvert(id: string) {
    await supabase.from('crm_cards').update({ convertido: false }).eq('id', id)
    setCards(prev => prev.map(c => c.id === id ? { ...c, convertido: false } : c))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl text-white tracking-wide">CRM</h1>
        <p className="text-gray-500 text-sm">Kanban de prospecção e relacionamento</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUNAS.map(col => {
            const colCards = cards.filter(c => c.coluna === col.key)
            return (
              <div key={col.key} className={`flex-shrink-0 w-64 bg-surface rounded-lg border-t-2 ${col.color} border-x border-b border-border flex flex-col`}>
                <div className="px-3 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{col.label}</p>
                    <p className="text-gray-500 text-xs">{colCards.length} card(s)</p>
                  </div>
                  <button
                    onClick={() => { setNewCardCol(col.key); setForm(emptyForm); setCardError('') }}
                    className="w-6 h-6 flex items-center justify-center rounded bg-surface-2 hover:bg-border text-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <SortableContext items={colCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <DroppableColumn id={col.key}>
                    {colCards.map(card => (
                      <SortableCard key={card.id} card={card} onDelete={handleDeleteCard} onConvert={setConvertCard} onNotConvert={handleNotConvert} />
                    ))}
                  </DroppableColumn>
                </SortableContext>
              </div>
            )
          })}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="bg-surface-2 border border-primary/60 rounded-lg p-3 shadow-xl opacity-90 w-60">
              <p className="text-white text-sm font-medium truncate">{activeCard.nome}</p>
              <p className="text-gray-500 text-xs mt-1 truncate">{activeCard.servico_interesse}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal novo card */}
      <Modal open={!!newCardCol} onClose={() => setNewCardCol(null)} title="NOVO CARD">
        <div className="space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do contato" />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <label className="label">Serviço de Interesse</label>
            <select className="input" value={form.servico_interesse} onChange={e => setForm(f => ({ ...f, servico_interesse: e.target.value }))}>
              {SERVICOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input h-20 resize-none" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
          <div>
            <label className="label">Vincular Aluno (opcional)</label>
            <select className="input" value={form.aluno_id} onChange={e => setForm(f => ({ ...f, aluno_id: e.target.value }))}>
              <option value="">Nenhum</option>
              {alunos.map(a => <option key={a.id} value={a.id}>{a.nome} {a.sobrenome}</option>)}
            </select>
          </div>
          {cardError && (
            <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{cardError}</div>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setNewCardCol(null); setCardError('') }} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button
              onClick={handleAddCard}
              disabled={saving || !form.nome.trim()}
              className="btn-primary flex-1 justify-center"
              style={{ opacity: (saving || !form.nome.trim()) ? 0.5 : 1 }}
            >
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal converter */}
      <Modal open={!!convertCard} onClose={() => { setConvertCard(null); setConvertForm({ servico: SERVICOS[0], valor: '', valorSinal: '' }) }} title="REGISTRAR CONVERSÃO">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Conversão de <span className="text-white">{convertCard?.nome}</span></p>
          {!convertCard?.aluno_id && (
            <div className="bg-yellow-900/20 border border-yellow-800 rounded px-3 py-2 text-yellow-400 text-xs">
              Card sem aluno vinculado — receita financeira não será criada automaticamente.
            </div>
          )}
          <div>
            <label className="label">Serviço Contratado</label>
            <select className="input" value={convertForm.servico} onChange={e => setConvertForm(f => ({ ...f, servico: e.target.value }))}>
              {SERVICOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor Total (R$)</label>
              <input className="input" type="number" value={convertForm.valor} onChange={e => setConvertForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div>
              <label className="label">Valor Sinal (R$)</label>
              <input className="input" type="number" value={convertForm.valorSinal} onChange={e => setConvertForm(f => ({ ...f, valorSinal: e.target.value }))} placeholder="Deixe vazio = total" />
            </div>
          </div>
          {convertForm.valor && convertForm.valorSinal && parseFloat(convertForm.valor) > parseFloat(convertForm.valorSinal) && (
            <p className="text-gray-500 text-xs">
              Saldo restante: R$ {(parseFloat(convertForm.valor) - parseFloat(convertForm.valorSinal)).toFixed(2).replace('.', ',')}
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setConvertCard(null); setConvertForm({ servico: SERVICOS[0], valor: '', valorSinal: '' }) }} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={handleConvert} className="btn-primary flex-1 justify-center">Confirmar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

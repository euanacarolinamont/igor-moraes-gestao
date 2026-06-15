import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Aluno, Agendamento, Receita } from '../lib/supabase'
import { ArrowLeft, User, Pencil, X, Check, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'

type Tab = 'dados' | 'agendamentos' | 'financeiro' | 'servicos'

const SERVICOS = [
  'Consultoria Online', 'Avaliação Física', 'Avaliação Física + Consultoria',
  'Personal Trainer', 'Assinatura do Aplicativo',
]

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'dd/MM/yyyy') } catch { return iso }
}

function StatusBadge({ status }: { status: Aluno['status'] }) {
  const map: Record<string, string> = {
    Ativo: 'badge-ativo', Inativo: 'badge-inativo', Vencido: 'badge-vencido', Cancelado: 'badge-cancelado',
  }
  return <span className={map[status] ?? 'badge-inativo'}>{status}</span>
}

export default function AlunoProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [aluno, setAluno] = useState<Aluno | null>(null)
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [receitas, setReceitas] = useState<Receita[]>([])
  const [tab, setTab] = useState<Tab>('dados')
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editForm, setEditForm] = useState<Partial<Aluno>>({})

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { if (id) fetchData(id) }, [id])

  async function fetchData(alunoId: string) {
    setLoading(true)
    const [alunoRes, agendRes, receitasRes] = await Promise.all([
      supabase.from('alunos').select('*').eq('id', alunoId).single(),
      supabase.from('agendamentos').select('*').eq('aluno_id', alunoId).order('data', { ascending: true }),
      supabase.from('financeiro_receitas').select('*').eq('aluno_id', alunoId).order('data_vencimento', { ascending: false }),
    ])
    setAluno(alunoRes.data)
    setAgendamentos(agendRes.data ?? [])
    setReceitas(receitasRes.data ?? [])
    setLoading(false)
  }

  function startEdit() {
    if (!aluno) return
    setEditForm({
      nome: aluno.nome,
      sobrenome: aluno.sobrenome,
      cpf: aluno.cpf ?? '',
      telefone: aluno.telefone ?? '',
      email: aluno.email ?? '',
      genero: aluno.genero,
      data_nascimento: aluno.data_nascimento ?? '',
      data_inicio: aluno.data_inicio ?? '',
      data_vencimento: aluno.data_vencimento ?? '',
      servico_contratado: aluno.servico_contratado ?? '',
      status: aluno.status,
      observacoes: aluno.observacoes ?? '',
      foto_url: aluno.foto_url ?? '',
    })
    setEditing(true)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!aluno) return
    setSaving(true)
    setEditError('')
    const { error } = await supabase.from('alunos').update({
      nome: editForm.nome,
      sobrenome: editForm.sobrenome,
      cpf: editForm.cpf,
      telefone: editForm.telefone,
      email: editForm.email,
      genero: editForm.genero,
      data_nascimento: editForm.data_nascimento || null,
      data_inicio: editForm.data_inicio,
      data_vencimento: editForm.data_vencimento,
      servico_contratado: editForm.servico_contratado,
      status: editForm.status,
      observacoes: editForm.observacoes || null,
      foto_url: editForm.foto_url || null,
    }).eq('id', aluno.id)

    if (error) { setEditError(error.message); setSaving(false); return }

    const { data } = await supabase.from('alunos').select('*').eq('id', aluno.id).single()
    if (data) setAluno(data)
    setEditing(false)
    setSaving(false)
  }

  async function handleDeleteAluno() {
    if (!aluno) return
    setDeleting(true)
    setDeleteError('')

    const { error: agendErr } = await supabase
      .from('agendamentos')
      .delete()
      .eq('aluno_id', aluno.id)

    if (agendErr) { setDeleteError(agendErr.message); setDeleting(false); return }

    const { error: alunoErr } = await supabase
      .from('alunos')
      .delete()
      .eq('id', aluno.id)

    if (alunoErr) { setDeleteError(alunoErr.message); setDeleting(false); return }

    navigate('/alunos')
  }

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!aluno) return <div className="text-center py-20 text-gray-500">Aluno não encontrado</div>

  const today = format(new Date(), 'yyyy-MM-dd')
  const futureAgends = agendamentos.filter(a => (a.data ?? '') >= today)
  const pastAgends = agendamentos.filter(a => (a.data ?? '') < today).reverse()

  // Histórico de Serviços: agrupar receitas por engajamento (agendamento ou conversão CRM)
  const servicosMap = new Map<string, { data: string; servico: string; total: number; tipo: string }>()
  for (const r of receitas) {
    if (r.tipo === 'manual') continue
    const key = r.agendamento_id ?? `crm|${r.data_vencimento}|${r.servico}`
    if (!servicosMap.has(key)) {
      servicosMap.set(key, {
        data: r.data_vencimento,
        servico: r.servico,
        total: 0,
        tipo: r.agendamento_id ? 'Agenda' : 'CRM',
      })
    }
    servicosMap.get(key)!.total += r.valor
  }
  const servicosHistorico = Array.from(servicosMap.values()).sort((a, b) => b.data.localeCompare(a.data))

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dados', label: 'Dados Pessoais' },
    { key: 'agendamentos', label: 'Agendamentos' },
    { key: 'financeiro', label: 'Histórico Financeiro' },
    { key: 'servicos', label: 'Histórico de Serviços' },
  ]

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/alunos')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Header card */}
      <div className="card">
        <div className="flex items-center gap-6">
          {aluno.foto_url ? (
            <img src={aluno.foto_url} alt={aluno.nome} className="w-20 h-20 rounded-full object-cover border-2 border-border" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-surface-2 border-2 border-border flex items-center justify-center flex-shrink-0">
              <User size={32} className="text-gray-500" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-heading text-3xl text-white tracking-wide">{aluno.nome} {aluno.sobrenome}</h1>
            <p className="text-gray-400 text-sm mt-1">{aluno.email} · {aluno.telefone}</p>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={aluno.status} />
              <span className="text-gray-500 text-sm">{aluno.servico_contratado}</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <div>
              <p className="text-gray-500 text-xs">Vencimento</p>
              <p className="text-white font-medium">{fmtDate(aluno.data_vencimento)}</p>
            </div>
            {!editing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-surface-2 hover:bg-border text-gray-300 hover:text-white border border-border transition-colors"
                >
                  <Pencil size={13} /> Editar
                </button>
                <button
                  onClick={() => { setShowDeleteModal(true); setDeleteError('') }}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/50 transition-colors"
                >
                  <Trash2 size={13} /> Excluir aluno
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (editing) { setEditing(false); setEditError('') } }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Dados Pessoais */}
      {tab === 'dados' && (
        <div className="card space-y-5">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Nome *</label>
                  <input className="input" value={editForm.nome ?? ''} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Sobrenome</label>
                  <input className="input" value={editForm.sobrenome ?? ''} onChange={e => setEditForm(f => ({ ...f, sobrenome: e.target.value }))} />
                </div>
                <div>
                  <label className="label">CPF</label>
                  <input className="input" value={editForm.cpf ?? ''} onChange={e => setEditForm(f => ({ ...f, cpf: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Telefone</label>
                  <input className="input" value={editForm.telefone ?? ''} onChange={e => setEditForm(f => ({ ...f, telefone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={editForm.email ?? ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Gênero</label>
                  <select className="input" value={editForm.genero ?? 'Masculino'} onChange={e => setEditForm(f => ({ ...f, genero: e.target.value as Aluno['genero'] }))}>
                    <option>Masculino</option><option>Feminino</option><option>Prefiro não informar</option>
                  </select>
                </div>
                <div>
                  <label className="label">Data de Nascimento</label>
                  <input className="input" type="date" value={editForm.data_nascimento ?? ''} onChange={e => setEditForm(f => ({ ...f, data_nascimento: e.target.value }))} />
                </div>
                <div>
                  <label className="label">URL da Foto</label>
                  <input className="input" value={editForm.foto_url ?? ''} onChange={e => setEditForm(f => ({ ...f, foto_url: e.target.value }))} placeholder="https://..." />
                </div>
                <div>
                  <label className="label">Serviço Contratado</label>
                  <select className="input" value={editForm.servico_contratado ?? ''} onChange={e => setEditForm(f => ({ ...f, servico_contratado: e.target.value }))}>
                    {SERVICOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={editForm.status ?? 'Ativo'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Aluno['status'] }))}>
                    <option>Ativo</option><option>Inativo</option><option>Vencido</option><option>Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="label">Data de Início</label>
                  <input className="input" type="date" value={editForm.data_inicio ?? ''} onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Data de Vencimento</label>
                  <input className="input" type="date" value={editForm.data_vencimento ?? ''} onChange={e => setEditForm(f => ({ ...f, data_vencimento: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input h-20 resize-none" value={editForm.observacoes ?? ''} onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
              {editError && (
                <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{editError}</div>
              )}
              <div className="flex gap-3 pt-2 border-t border-border">
                <button onClick={() => { setEditing(false); setEditError('') }} className="btn-secondary flex-1 justify-center">
                  <X size={14} /> Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editForm.nome?.trim()}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : <><Check size={14} /> Salvar</>}
                </button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {([
                ['CPF', aluno.cpf],
                ['Telefone', aluno.telefone],
                ['Email', aluno.email],
                ['Gênero', aluno.genero],
                ['Data de Nascimento', fmtDate(aluno.data_nascimento)],
                ['Data de Início', fmtDate(aluno.data_inicio)],
                ['Data de Vencimento', fmtDate(aluno.data_vencimento)],
                ['Serviço Contratado', aluno.servico_contratado],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
                  <p className="text-white mt-0.5">{value || '—'}</p>
                </div>
              ))}
              {aluno.observacoes && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Observações</p>
                  <p className="text-white mt-0.5">{aluno.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Agendamentos */}
      {tab === 'agendamentos' && (
        <div className="space-y-4">
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface-2">
              <p className="text-white text-sm font-semibold">Próximos Agendamentos</p>
            </div>
            {futureAgends.length === 0 ? (
              <p className="text-center py-8 text-gray-500 text-sm">Nenhum agendamento futuro</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Horário</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Serviço</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Sinal</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {futureAgends.map(a => (
                    <tr key={a.id} className="border-b border-border">
                      <td className="px-4 py-3 text-white">{fmtDate(a.data)}</td>
                      <td className="px-4 py-3 text-gray-400">{a.horario}</td>
                      <td className="px-4 py-3 text-gray-400 max-w-[160px] truncate">{a.servico}</td>
                      <td className="px-4 py-3 text-white">{fmt(a.sinal_valor)}</td>
                      <td className="px-4 py-3">
                        <span className={a.sinal_status === 'Pago' ? 'badge-ativo' : 'badge-vencido'}>
                          {a.sinal_status === 'Pago' ? 'Pago' : 'Aguardando'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {pastAgends.length > 0 && (
            <div className="card p-0 overflow-hidden opacity-70">
              <div className="px-4 py-3 border-b border-border bg-surface-2">
                <p className="text-gray-400 text-sm font-semibold">Agendamentos Anteriores ({pastAgends.length})</p>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {pastAgends.map(a => (
                    <tr key={a.id} className="border-b border-border">
                      <td className="px-4 py-3 text-gray-500">{fmtDate(a.data)}</td>
                      <td className="px-4 py-3 text-gray-600">{a.horario}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{a.servico}</td>
                      <td className="px-4 py-3 text-gray-500">{fmt(a.sinal_valor)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs rounded px-2 py-0.5 ${a.sinal_status === 'Pago' ? 'text-green-600 border border-green-900' : 'text-gray-600 border border-border'}`}>
                          {a.sinal_status === 'Pago' ? 'Pago' : 'Aguardando'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Histórico Financeiro */}
      {tab === 'financeiro' && (
        <div className="card p-0 overflow-hidden">
          {receitas.length === 0 ? (
            <p className="text-center py-10 text-gray-500">Nenhum lançamento financeiro</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Descrição</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {receitas.map(r => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="px-4 py-3 text-white whitespace-nowrap">{fmtDate(r.data_vencimento)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded px-2 py-0.5 font-semibold ${
                        r.tipo === 'sinal' ? 'bg-blue-900/40 text-blue-300 border border-blue-800'
                        : r.tipo === 'restante' ? 'bg-purple-900/40 text-purple-300 border border-purple-800'
                        : 'bg-surface-2 text-gray-400 border border-border'
                      }`}>
                        {r.tipo === 'sinal' ? 'Sinal' : r.tipo === 'restante' ? 'Saldo' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{r.descricao || r.servico}</td>
                    <td className="px-4 py-3 text-white text-right font-medium">{fmt(r.valor)}</td>
                    <td className="px-4 py-3">
                      <span className={r.status === 'Recebido' ? 'badge-ativo' : 'badge-vencido'}>
                        {r.status === 'Recebido' ? 'Pago' : 'A receber'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Histórico de Serviços */}
      {tab === 'servicos' && (
        <div className="card p-0 overflow-hidden">
          {servicosHistorico.length === 0 ? (
            <p className="text-center py-10 text-gray-500">Nenhum serviço registrado</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Serviço</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Origem</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {servicosHistorico.map((s, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3 text-white whitespace-nowrap">{fmtDate(s.data)}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{s.servico}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded px-2 py-0.5 ${
                        s.tipo === 'Agenda'
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'bg-surface-2 text-gray-400 border border-border'
                      }`}>{s.tipo}</span>
                    </td>
                    <td className="px-4 py-3 text-white text-right font-medium">{fmt(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-900/30 border border-red-900/50 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-lg">Excluir aluno</h2>
                <p className="text-gray-400 text-sm">Esta ação não pode ser desfeita</p>
              </div>
            </div>

            <p className="text-gray-300 text-sm">
              Tem certeza que deseja excluir <span className="text-white font-medium">{aluno.nome} {aluno.sobrenome}</span>?
              Todos os agendamentos deste aluno também serão excluídos. Os registros financeiros serão mantidos.
            </p>

            {deleteError && (
              <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{deleteError}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteError('') }}
                disabled={deleting}
                className="btn-secondary flex-1 justify-center"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAluno}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : <><Trash2 size={14} /> Excluir</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

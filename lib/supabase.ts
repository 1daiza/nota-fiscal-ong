import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export type StatusNota =
  | 'novo'
  | 'a_cadastrar'
  | 'cadastrado'
  | 'duplicado'
  | 'revisao'

export type OrigemNota = 'manual' | 'scanner' | 'importacao'

export interface NotaFiscal {
  id: string
  chave_nfc: string | null
  cnpj: string | null
  estabelecimento: string | null
  data_emissao: string | null
  valor: number
  status: StatusNota
  origem: OrigemNota
  doador_nome: string | null
  doador_contato: string | null
  prazo_cadastro: string | null
  cadastrado_em: string | null
  observacoes: string | null
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

/** Campos aceitos ao cadastrar uma nota nova. */
export type NovaNota = Partial<
  Omit<NotaFiscal, 'id' | 'criado_em' | 'atualizado_em'>
> & { valor: number }

export interface ResumoNotas {
  total: number
  valorTotal: number
  cadastradas: number
  aCadastrar: number
  vencendo: number
}

export interface Resultado<T> {
  dados: T | null
  erro: string | null
}

// ---------------------------------------------------------------------
// Cliente
//
// Se as variaveis de ambiente nao estiverem configuradas, o sistema nao
// quebra: ele entra em "modo nao configurado" e as telas mostram um aviso
// explicando o que falta. Isso deixa `npm run dev` funcionar antes do
// Supabase estar pronto.
// ---------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabaseConfigurado = Boolean(url && anonKey)

let cliente: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigurado) return null
  if (!cliente) cliente = createClient(url as string, anonKey as string)
  return cliente
}

const ERRO_CONFIG =
  'Supabase nao configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e ' +
  'NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local (veja .env.example).'

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------

export interface FiltroNotas {
  status?: StatusNota | 'todos'
  busca?: string
  limite?: number
}

export async function obterNotas(
  filtro: FiltroNotas = {}
): Promise<Resultado<NotaFiscal[]>> {
  const db = getSupabase()
  if (!db) return { dados: null, erro: ERRO_CONFIG }

  let query = db
    .from('notas_fiscais')
    .select('*')
    .order('data_emissao', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false })
    .limit(filtro.limite ?? 200)

  if (filtro.status && filtro.status !== 'todos') {
    query = query.eq('status', filtro.status)
  }

  if (filtro.busca) {
    const termo = filtro.busca.trim().replace(/[,()]/g, '')
    query = query.or(
      [
        'estabelecimento.ilike.%' + termo + '%',
        'chave_nfc.ilike.%' + termo + '%',
        'cnpj.ilike.%' + termo + '%',
      ].join(',')
    )
  }

  const { data, error } = await query
  if (error) return { dados: null, erro: error.message }
  return { dados: (data ?? []) as NotaFiscal[], erro: null }
}

export async function obterNota(id: string): Promise<Resultado<NotaFiscal>> {
  const db = getSupabase()
  if (!db) return { dados: null, erro: ERRO_CONFIG }

  const { data, error } = await db
    .from('notas_fiscais')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return { dados: null, erro: error.message }
  return { dados: (data as NotaFiscal) ?? null, erro: null }
}

/**
 * Procura uma nota ja cadastrada com a mesma chave de acesso.
 * Retorna a nota encontrada, ou null quando a chave e inedita.
 */
export async function detectarDuplicidade(
  chaveNfc: string
): Promise<Resultado<NotaFiscal | null>> {
  const db = getSupabase()
  if (!db) return { dados: null, erro: ERRO_CONFIG }

  const chave = somenteDigitos(chaveNfc)
  if (!chave) return { dados: null, erro: 'Chave vazia.' }

  const { data, error } = await db
    .from('notas_fiscais')
    .select('*')
    .eq('chave_nfc', chave)
    .maybeSingle()

  if (error) return { dados: null, erro: error.message }
  return { dados: (data as NotaFiscal) ?? null, erro: null }
}

// ---------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------

export async function registrarNota(
  nota: NovaNota
): Promise<Resultado<NotaFiscal>> {
  const db = getSupabase()
  if (!db) return { dados: null, erro: ERRO_CONFIG }

  const chave = nota.chave_nfc ? somenteDigitos(nota.chave_nfc) : null

  if (chave) {
    const { dados: existente } = await detectarDuplicidade(chave)
    if (existente) {
      await registrarLog('duplicidade_detectada', existente.id, {
        chave_nfc: chave,
      })
      return {
        dados: null,
        erro:
          'Esta nota ja esta cadastrada no sistema (' +
          (existente.estabelecimento ?? 'estabelecimento nao informado') +
          ').',
      }
    }
  }

  const payload = {
    chave_nfc: chave,
    cnpj: nota.cnpj ? somenteDigitos(nota.cnpj) : null,
    estabelecimento: nota.estabelecimento ?? null,
    data_emissao: nota.data_emissao ?? null,
    valor: nota.valor ?? 0,
    status: nota.status ?? 'a_cadastrar',
    origem: nota.origem ?? 'manual',
    doador_nome: nota.doador_nome ?? null,
    doador_contato: nota.doador_contato ?? null,
    observacoes: nota.observacoes ?? null,
    prazo_cadastro:
      nota.prazo_cadastro ?? calcularPrazoCadastro(nota.data_emissao ?? null),
  }

  const { data, error } = await db
    .from('notas_fiscais')
    .insert(payload)
    .select()
    .single()

  if (error) {
    // 23505 = violacao de indice unico (a chave ja existe)
    if (error.code === '23505') {
      return { dados: null, erro: 'Esta nota ja esta cadastrada no sistema.' }
    }
    return { dados: null, erro: error.message }
  }

  const criada = data as NotaFiscal
  await registrarLog('nota_criada', criada.id, { origem: criada.origem })
  return { dados: criada, erro: null }
}

export async function atualizarStatus(
  id: string,
  status: StatusNota
): Promise<Resultado<NotaFiscal>> {
  const db = getSupabase()
  if (!db) return { dados: null, erro: ERRO_CONFIG }

  const patch: Record<string, unknown> = { status }
  if (status === 'cadastrado') patch.cadastrado_em = new Date().toISOString()

  const { data, error } = await db
    .from('notas_fiscais')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return { dados: null, erro: error.message }

  await registrarLog('status_alterado', id, { status })
  return { dados: data as NotaFiscal, erro: null }
}

export async function removerNota(id: string): Promise<Resultado<true>> {
  const db = getSupabase()
  if (!db) return { dados: null, erro: ERRO_CONFIG }

  const { error } = await db.from('notas_fiscais').delete().eq('id', id)
  if (error) return { dados: null, erro: error.message }

  await registrarLog('nota_removida', id, null)
  return { dados: true, erro: null }
}

/** Auditoria. Uma falha de log nunca derruba a operacao principal. */
export async function registrarLog(
  acao: string,
  entidadeId: string | null,
  detalhes: Record<string, unknown> | null
): Promise<void> {
  const db = getSupabase()
  if (!db) return

  try {
    await db.from('logs').insert({
      acao,
      entidade: 'nota_fiscal',
      entidade_id: entidadeId,
      detalhes,
    })
  } catch {
    // silencioso de proposito: auditoria nao pode bloquear o usuario
  }
}

// ---------------------------------------------------------------------
// Resumo e regras de negocio
// ---------------------------------------------------------------------

/** Prazo da Nota Fiscal Paulista: dia 20 do mes seguinte a emissao. */
export function calcularPrazoCadastro(dataEmissao: string | null): string | null {
  if (!dataEmissao) return null
  const d = new Date(dataEmissao + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const prazo = new Date(d.getFullYear(), d.getMonth() + 1, 20)
  const mes = String(prazo.getMonth() + 1).padStart(2, '0')
  const dia = String(prazo.getDate()).padStart(2, '0')
  return prazo.getFullYear() + '-' + mes + '-' + dia
}

/** Dias que faltam para o prazo. Negativo = ja venceu. */
export function diasParaPrazo(prazo: string | null): number | null {
  if (!prazo) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(prazo + 'T00:00:00')
  if (Number.isNaN(alvo.getTime())) return null
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

/** Nota pendente cujo prazo vence nos proximos dias (ou ja venceu). */
export function estaVencendo(nota: NotaFiscal, janelaDias = 7): boolean {
  if (nota.status === 'cadastrado' || nota.status === 'duplicado') return false
  const dias = diasParaPrazo(nota.prazo_cadastro)
  return dias !== null && dias <= janelaDias
}

export function calcularResumo(notas: NotaFiscal[]): ResumoNotas {
  return {
    total: notas.length,
    valorTotal: notas.reduce((soma, n) => soma + Number(n.valor ?? 0), 0),
    cadastradas: notas.filter((n) => n.status === 'cadastrado').length,
    aCadastrar: notas.filter(
      (n) => n.status === 'a_cadastrar' || n.status === 'novo'
    ).length,
    vencendo: notas.filter((n) => estaVencendo(n)).length,
  }
}

export async function obterResumo(): Promise<Resultado<ResumoNotas>> {
  const { dados, erro } = await obterNotas({ limite: 1000 })
  if (erro || !dados) return { dados: null, erro }
  return { dados: calcularResumo(dados), erro: null }
}

export function somenteDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

import type { StatusNota } from './supabase'

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor ?? 0))
}

/** Recebe 'YYYY-MM-DD' e devolve 'DD/MM/AAAA'. */
export function formatarData(data: string | null): string {
  if (!data) return '—'
  const [ano, mes, dia] = data.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return '—'
  return dia + '/' + mes + '/' + ano
}

export function formatarCnpj(cnpj: string | null): string {
  if (!cnpj) return '—'
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return (
    d.slice(0, 2) +
    '.' +
    d.slice(2, 5) +
    '.' +
    d.slice(5, 8) +
    '/' +
    d.slice(8, 12) +
    '-' +
    d.slice(12)
  )
}

/** Quebra a chave de 44 digitos em blocos de 4, para leitura humana. */
export function formatarChave(chave: string | null): string {
  if (!chave) return '—'
  return (chave.match(/.{1,4}/g) ?? [chave]).join(' ')
}

export const ROTULO_STATUS: Record<StatusNota, string> = {
  novo: 'Novo',
  a_cadastrar: 'A cadastrar',
  cadastrado: 'Cadastrado',
  duplicado: 'Duplicado',
  revisao: 'Em revisão',
}

/** Classe CSS do selo de status (definida em app/globals.css). */
export function classeStatus(status: StatusNota): string {
  return 'selo selo-' + status.replace('_', '-')
}

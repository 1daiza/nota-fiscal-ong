/**
 * Consulta o nome de um estabelecimento pelo CNPJ.
 *
 * Usa a BrasilAPI, que espelha a base pública da Receita Federal: é gratuita,
 * não exige cadastro e aceita chamadas direto do navegador. Enviamos apenas o
 * CNPJ, que é informação pública da empresa — nada do doador sai daqui.
 *
 * Toda falha é silenciosa de propósito: se a consulta não responder, o campo
 * fica vazio para o voluntário digitar. Nunca travamos o cadastro por causa
 * de um serviço externo fora do ar.
 */

const cache = new Map<string, string | null>()

export interface DadosEmpresa {
  nome: string
  fantasia: string | null
  municipio: string | null
}

export function cnpjValido(cnpj: string): boolean {
  const d = (cnpj ?? '').replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  // Dígitos verificadores (módulo 11).
  const calcular = (base: string, pesoInicial: number) => {
    let soma = 0
    let peso = pesoInicial
    for (const digito of base) {
      soma += Number(digito) * peso
      peso = peso === 2 ? 9 : peso - 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const dv1 = calcular(d.slice(0, 12), 5)
  const dv2 = calcular(d.slice(0, 13), 6)
  return dv1 === Number(d[12]) && dv2 === Number(d[13])
}

/** Devolve o nome do estabelecimento, ou null se não der para descobrir. */
export async function consultarNomeEstabelecimento(
  cnpj: string
): Promise<string | null> {
  const digitos = (cnpj ?? '').replace(/\D/g, '')
  if (digitos.length !== 14) return null

  if (cache.has(digitos)) return cache.get(digitos) ?? null

  // Duas fontes públicas da mesma base da Receita. Se a primeira estiver fora
  // do ar ou tiver estourado o limite de uso, tentamos a segunda.
  const nome =
    (await tentar(brasilApi, digitos)) ?? (await tentar(cnpjWs, digitos))

  cache.set(digitos, nome)
  return nome
}

async function tentar(
  fonte: (cnpj: string, signal: AbortSignal) => Promise<string | null>,
  cnpj: string
): Promise<string | null> {
  const controle = new AbortController()
  const prazo = setTimeout(() => controle.abort(), 8000)
  try {
    return await fonte(cnpj, controle.signal)
  } catch {
    // rede fora, CNPJ inexistente, limite de uso: tenta a próxima fonte
    return null
  } finally {
    clearTimeout(prazo)
  }
}

/** O nome fantasia é como a loja é conhecida; a razão social é o nome formal. */
function melhorNome(fantasia?: string, razao?: string): string | null {
  return fantasia?.trim() || razao?.trim() || null
}

async function brasilApi(cnpj: string, signal: AbortSignal) {
  const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, {
    signal,
  })
  if (!r.ok) return null
  const d = (await r.json()) as {
    razao_social?: string
    nome_fantasia?: string
  }
  return melhorNome(d.nome_fantasia, d.razao_social)
}

async function cnpjWs(cnpj: string, signal: AbortSignal) {
  const r = await fetch('https://publica.cnpj.ws/cnpj/' + cnpj, { signal })
  if (!r.ok) return null
  const d = (await r.json()) as {
    razao_social?: string
    estabelecimento?: { nome_fantasia?: string }
  }
  return melhorNome(d.estabelecimento?.nome_fantasia, d.razao_social)
}

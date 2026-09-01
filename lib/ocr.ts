/**
 * Garimpa valor e data no texto que o OCR devolve de um cupom fiscal.
 *
 * O texto que chega aqui é sujo: papel térmico amassado, foto torta, letra
 * borrada. Nada disso tenta ser esperto — a regra é achar candidatos com alta
 * chance de estarem certos e devolver junto o motivo, para a tela poder
 * mostrar como sugestão. Preencher sozinho um valor errado num registro
 * fiscal é pior do que não preencher nada.
 */

export interface Candidato<T> {
  valor: T
  /** Como foi encontrado — vira explicação na tela. */
  origem: string
  /** true quando veio de uma âncora forte, como a linha do TOTAL. */
  confiavel: boolean
}

/** Erros clássicos do OCR dentro de um trecho numérico. */
function limparNumero(bruto: string): string {
  return bruto
    .replace(/[Oo]/g, '0')
    .replace(/[lIi|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/\s/g, '')
}

/** "1.234,56" e "1234.56" viram 1234.56. */
function paraNumero(bruto: string): number | null {
  const limpo = limparNumero(bruto)

  // Separador decimal é o último ponto ou vírgula que aparecer.
  const ultimaVirgula = limpo.lastIndexOf(',')
  const ultimoPonto = limpo.lastIndexOf('.')
  const corte = Math.max(ultimaVirgula, ultimoPonto)
  if (corte < 0) return null

  const inteiro = limpo.slice(0, corte).replace(/[.,]/g, '')
  const decimal = limpo.slice(corte + 1)
  if (!/^\d+$/.test(inteiro) || !/^\d{2}$/.test(decimal)) return null

  const numero = Number(inteiro + '.' + decimal)
  return Number.isFinite(numero) ? numero : null
}

/**
 * Um valor em reais: dígitos, separador de milhar opcional, e sempre dois
 * decimais no fim.
 *
 * Sem espaço no meio, de propósito. Permitir espaço faz "24,49 24,49" (as duas
 * colunas de um item) virar um número só — R$ 244.924,49. Erro de espaçamento
 * do OCR custa um valor não encontrado; esse outro custa um valor errado.
 */
const DINHEIRO = /\d[\d.,OolIiSsBb]{0,11}[.,][\dOolIiSsBb]{2}(?!\d)/g

/**
 * Linhas que contêm um número parecido com total mas que NÃO são o total da
 * compra. "Tributos Totais Incidentes" é a pegadinha mais comum: tem a palavra
 * "Totais" e um valor logo ao lado.
 */
const ARMADILHAS = /TRIBUT|IMPOSTO|FEDERAL|ESTADUAL|MUNICIPAL|FONTE|LEI|IBPT/i
// TOTA[L1I] em vez de TOTAL: o OCR troca L por 1 ou I o tempo todo.
const ANCORA_TOTAL = /TOTA[L1I|]|\bVALOR\b|\bVL\.?\s*T/i

/**
 * Procura o valor da compra.
 *
 * Primeiro tenta a âncora: uma linha que fale em TOTAL e não seja de tributos.
 * Sem âncora, cai para o maior valor do cupom — que num cupom de supermercado
 * quase sempre é o total, já que os itens são frações dele.
 */
export function extrairValor(texto: string): Candidato<number> | null {
  const linhas = texto.split(/\r?\n/)
  const todos: number[] = []
  let ancorado: number | null = null

  for (const linha of linhas) {
    const achados = linha.match(DINHEIRO)
    if (!achados) continue

    const numeros = achados
      .map(paraNumero)
      .filter((n): n is number => n !== null && n > 0 && n < 1_000_000)

    todos.push(...numeros)

    if (numeros.length === 0) continue
    if (ARMADILHAS.test(linha)) continue

    if (ANCORA_TOTAL.test(linha)) {
      // Na linha "Qtd. total de itens 10   Total R$ 57,64" o valor certo é o
      // último — os anteriores costumam ser contagem ou subtotal.
      const candidato = numeros[numeros.length - 1]
      if (ancorado === null || candidato > ancorado) ancorado = candidato
    }
  }

  if (ancorado !== null) {
    return {
      valor: ancorado,
      origem: 'linha do TOTAL',
      confiavel: true,
    }
  }

  if (todos.length === 0) return null

  return {
    valor: Math.max(...todos),
    origem: 'maior valor encontrado',
    confiavel: false,
  }
}

/**
 * Procura a data da compra, em formato ISO.
 *
 * Quando a chave de acesso já é conhecida, sabemos o mês certo — então só
 * aceitamos datas daquele mês. Isso descarta de cara a data de validade do
 * produto, a data de abertura da loja e o lixo que o OCR inventa.
 */
export function extrairData(
  texto: string,
  mesEsperado?: { ano: string; mes: string }
): Candidato<string> | null {
  const achados = texto.matchAll(/([0-3]?\d)[\/\-.]([01]?\d)[\/\-.](\d{2,4})/g)

  const datas: string[] = []
  for (const achado of achados) {
    const dia = achado[1].padStart(2, '0')
    const mes = achado[2].padStart(2, '0')
    let ano = achado[3]
    if (ano.length === 2) ano = '20' + ano

    if (Number(dia) < 1 || Number(dia) > 31) continue
    if (Number(mes) < 1 || Number(mes) > 12) continue
    if (Number(ano) < 2000 || Number(ano) > 2100) continue

    datas.push(ano + '-' + mes + '-' + dia)
  }

  if (datas.length === 0) return null

  if (mesEsperado) {
    const prefixo = mesEsperado.ano + '-' + mesEsperado.mes
    const doMes = datas.find((d) => d.startsWith(prefixo))
    if (doMes) {
      return {
        valor: doMes,
        origem: 'confere com o mês da chave',
        confiavel: true,
      }
    }
    return null
  }

  return { valor: datas[0], origem: 'primeira data do cupom', confiavel: false }
}

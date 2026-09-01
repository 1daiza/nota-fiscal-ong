/**
 * A chave de acesso não é um número aleatório: ela tem uma estrutura fixa
 * definida pela SEFAZ, com 44 dígitos nesta ordem:
 *
 *   35   2608   26563652033484   65    002    000034393   1     30546748   7
 *   UF   AAMM   CNPJ             mod   série  número      tpEmis  código   DV
 *
 * Ou seja: o CNPJ do estabelecimento e o mês da compra vêm de graça dentro
 * da própria chave, sem precisar consultar nada.
 */
export interface PartesChave {
  uf: string
  ano: string
  mes: string
  cnpj: string
  modelo: string
  serie: string
  numero: string
}

export function dividirChave(chave: string): PartesChave | null {
  const digitos = (chave ?? '').replace(/\D/g, '')
  if (digitos.length !== 44) return null
  return {
    uf: digitos.slice(0, 2),
    ano: '20' + digitos.slice(2, 4),
    mes: digitos.slice(4, 6),
    cnpj: digitos.slice(6, 20),
    modelo: digitos.slice(20, 22),
    serie: digitos.slice(22, 25),
    numero: digitos.slice(25, 34),
  }
}

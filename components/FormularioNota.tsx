'use client'

import { useState } from 'react'
import {
  registrarNota,
  somenteDigitos,
  type NotaFiscal,
  type StatusNota,
} from '@/lib/supabase'

interface Props {
  /** Valores iniciais, por exemplo vindos da leitura do QR Code. */
  inicial?: {
    chave_nfc?: string
    cnpj?: string
    estabelecimento?: string
    data_emissao?: string
    valor?: string
  }
  origem?: 'manual' | 'scanner'
  onSalvo: (nota: NotaFiscal) => void
  onCancelar?: () => void
}

const hoje = () => new Date().toISOString().slice(0, 10)

export default function FormularioNota({
  inicial,
  origem = 'manual',
  onSalvo,
  onCancelar,
}: Props) {
  const [chave, setChave] = useState(inicial?.chave_nfc ?? '')
  const [cnpj, setCnpj] = useState(inicial?.cnpj ?? '')
  const [estabelecimento, setEstabelecimento] = useState(
    inicial?.estabelecimento ?? ''
  )
  const [dataEmissao, setDataEmissao] = useState(inicial?.data_emissao ?? hoje())
  const [valor, setValor] = useState(inicial?.valor ?? '')
  const [status, setStatus] = useState<StatusNota>('a_cadastrar')
  const [doador, setDoador] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    const valorNumerico = Number(valor.replace(',', '.'))
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }

    const chaveLimpa = somenteDigitos(chave)
    if (chaveLimpa && chaveLimpa.length !== 44) {
      setErro(
        'A chave de acesso deve ter 44 dígitos (esta tem ' +
          chaveLimpa.length +
          ').'
      )
      return
    }

    setSalvando(true)
    const { dados, erro: falha } = await registrarNota({
      chave_nfc: chaveLimpa || null,
      cnpj: cnpj ? somenteDigitos(cnpj) : null,
      estabelecimento: estabelecimento.trim() || null,
      data_emissao: dataEmissao || null,
      valor: valorNumerico,
      status,
      origem,
      doador_nome: doador.trim() || null,
      observacoes: observacoes.trim() || null,
    })
    setSalvando(false)

    if (falha || !dados) {
      setErro(falha ?? 'Não foi possível salvar a nota.')
      return
    }

    onSalvo(dados)
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      {erro && (
        <div className="aviso aviso-erro campo-largo" role="alert">
          {erro}
        </div>
      )}

      <div className="campo campo-largo">
        <label htmlFor="chave">Chave de acesso (44 dígitos)</label>
        <input
          id="chave"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder="Opcional — cole os 44 dígitos impressos na nota"
          inputMode="numeric"
        />
      </div>

      <div className="campo">
        <label htmlFor="estabelecimento">Estabelecimento</label>
        <input
          id="estabelecimento"
          value={estabelecimento}
          onChange={(e) => setEstabelecimento(e.target.value)}
          placeholder="Ex.: Supermercado Bom Preço"
        />
      </div>

      <div className="campo">
        <label htmlFor="cnpj">CNPJ</label>
        <input
          id="cnpj"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          placeholder="00.000.000/0000-00"
          inputMode="numeric"
        />
      </div>

      <div className="campo">
        <label htmlFor="data">Data de emissão</label>
        <input
          id="data"
          type="date"
          value={dataEmissao}
          onChange={(e) => setDataEmissao(e.target.value)}
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="valor">Valor (R$)</label>
        <input
          id="valor"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="status">Situação</label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusNota)}
        >
          <option value="a_cadastrar">A cadastrar</option>
          <option value="novo">Novo</option>
          <option value="cadastrado">Cadastrado</option>
          <option value="revisao">Em revisão</option>
        </select>
      </div>

      <div className="campo">
        <label htmlFor="doador">Doador (opcional)</label>
        <input
          id="doador"
          value={doador}
          onChange={(e) => setDoador(e.target.value)}
          placeholder="Quem entregou a nota"
        />
      </div>

      <div className="campo campo-largo">
        <label htmlFor="observacoes">Observações</label>
        <textarea
          id="observacoes"
          rows={2}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Anotações internas sobre esta nota"
        />
      </div>

      <div className="acoes-formulario">
        <button className="botao" type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar nota'}
        </button>
        {onCancelar && (
          <button
            className="botao botao-secundario"
            type="button"
            onClick={onCancelar}
            disabled={salvando}
          >
            Cancelar
          </button>
        )}
        <span className="secundario">
          O prazo da NFP é calculado sozinho: dia 20 do mês seguinte à emissão.
        </span>
      </div>
    </form>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FormularioNota from '@/components/FormularioNota'
import {
  atualizarStatus,
  calcularResumo,
  diasParaPrazo,
  estaVencendo,
  obterNotas,
  supabaseConfigurado,
  type NotaFiscal,
  type StatusNota,
} from '@/lib/supabase'
import {
  ROTULO_STATUS,
  classeStatus,
  formatarChave,
  formatarCnpj,
  formatarData,
  formatarMoeda,
} from '@/lib/formato'

type Filtro = StatusNota | 'todos' | 'vencendo'

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todas' },
  { valor: 'a_cadastrar', rotulo: 'A cadastrar' },
  { valor: 'cadastrado', rotulo: 'Cadastradas' },
  { valor: 'vencendo', rotulo: 'Vencendo' },
  { valor: 'revisao', rotulo: 'Em revisão' },
  { valor: 'duplicado', rotulo: 'Duplicadas' },
]

export default function Painel() {
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { dados, erro: falha } = await obterNotas({ limite: 500 })
    setErro(falha)
    setNotas(dados ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const resumo = useMemo(() => calcularResumo(notas), [notas])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return notas.filter((nota) => {
      if (filtro === 'vencendo' && !estaVencendo(nota)) return false
      if (filtro !== 'todos' && filtro !== 'vencendo' && nota.status !== filtro) {
        return false
      }
      if (!termo) return true
      return [nota.estabelecimento, nota.cnpj, nota.chave_nfc, nota.doador_nome]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo))
    })
  }, [notas, filtro, busca])

  async function marcarCadastrada(nota: NotaFiscal) {
    const { dados, erro: falha } = await atualizarStatus(nota.id, 'cadastrado')
    if (falha || !dados) {
      setErro(falha ?? 'Não foi possível atualizar a nota.')
      return
    }
    setNotas((atual) => atual.map((n) => (n.id === dados.id ? dados : n)))
    setMensagem('Nota marcada como cadastrada no portal da NFP.')
  }

  return (
    <>
      {!supabaseConfigurado && (
        <div className="aviso aviso-alerta">
          <strong>Banco de dados ainda não conectado.</strong> Copie{' '}
          <code>.env.example</code> para <code>.env.local</code>, preencha a URL e
          a chave do Supabase e reinicie o servidor. Enquanto isso o painel fica
          vazio. O passo a passo está em <code>INSTRUCTIONS.md</code>.
        </div>
      )}

      {erro && supabaseConfigurado && (
        <div className="aviso aviso-erro" role="alert">
          {erro}
        </div>
      )}

      {mensagem && (
        <div className="aviso aviso-sucesso" role="status">
          {mensagem}
        </div>
      )}

      <section className="cards">
        <div className="card">
          <div className="card-rotulo">Notas recebidas</div>
          <div className="card-valor">{resumo.total}</div>
          <div className="card-nota">Total de doações registradas</div>
        </div>

        <div className="card">
          <div className="card-rotulo">Valor total</div>
          <div className="card-valor">{formatarMoeda(resumo.valorTotal)}</div>
          <div className="card-nota">Soma das notas doadas</div>
        </div>

        <div className="card">
          <div className="card-rotulo">Cadastradas</div>
          <div className="card-valor">{resumo.cadastradas}</div>
          <div className="card-nota">Já lançadas no portal da NFP</div>
        </div>

        <div className="card">
          <div className="card-rotulo">A cadastrar</div>
          <div className="card-valor">{resumo.aCadastrar}</div>
          <div className="card-nota">Aguardando lançamento</div>
        </div>

        <div className={resumo.vencendo > 0 ? 'card card-destaque' : 'card'}>
          <div className="card-rotulo">Vencendo</div>
          <div className="card-valor">{resumo.vencendo}</div>
          <div className="card-nota">Prazo em até 7 dias ou vencido</div>
        </div>
      </section>

      <section className="painel">
        <div className="painel-topo">
          <h2>Notas doadas</h2>
          <div className="filtros">
            {FILTROS.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                className={
                  filtro === opcao.valor ? 'filtro filtro-ativo' : 'filtro'
                }
                onClick={() => setFiltro(opcao.valor)}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="painel-topo">
          <input
            style={{ maxWidth: 320 }}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por estabelecimento, CNPJ, chave ou doador"
            aria-label="Buscar notas"
          />
          <div className="filtros">
            <button
              type="button"
              className="botao"
              onClick={() => {
                setMensagem(null)
                setMostrarFormulario((v) => !v)
              }}
            >
              {mostrarFormulario ? 'Fechar formulário' : '+ Nova nota'}
            </button>
            <Link className="botao botao-secundario" href="/scanner">
              Escanear QR Code
            </Link>
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => void carregar()}
              disabled={carregando}
            >
              Atualizar
            </button>
          </div>
        </div>

        {mostrarFormulario && (
          <FormularioNota
            origem="manual"
            onCancelar={() => setMostrarFormulario(false)}
            onSalvo={(nota) => {
              setNotas((atual) => [nota, ...atual])
              setMostrarFormulario(false)
              setMensagem('Nota registrada com sucesso.')
            }}
          />
        )}

        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Emissão</th>
                <th>Estabelecimento</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Prazo NFP</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((nota) => {
                const dias = diasParaPrazo(nota.prazo_cadastro)
                const pendente =
                  nota.status !== 'cadastrado' && nota.status !== 'duplicado'
                const vencida = pendente && dias !== null && dias < 0
                const alerta = pendente && dias !== null && dias >= 0 && dias <= 7

                return (
                  <tr
                    key={nota.id}
                    className={
                      vencida ? 'linha-vencida' : alerta ? 'linha-alerta' : ''
                    }
                  >
                    <td className="valor-numero">
                      {formatarData(nota.data_emissao)}
                    </td>
                    <td>
                      <div>{nota.estabelecimento ?? 'Não informado'}</div>
                      <div className="secundario">
                        {nota.cnpj
                          ? formatarCnpj(nota.cnpj)
                          : formatarChave(nota.chave_nfc)}
                      </div>
                    </td>
                    <td className="valor-numero">{formatarMoeda(nota.valor)}</td>
                    <td>
                      <span className={classeStatus(nota.status)}>
                        {ROTULO_STATUS[nota.status]}
                      </span>
                    </td>
                    <td className="valor-numero">
                      <div>{formatarData(nota.prazo_cadastro)}</div>
                      <div
                        className={
                          !pendente || dias === null
                            ? 'prazo-ok secundario'
                            : dias < 0
                              ? 'prazo-vencido'
                              : dias <= 7
                                ? 'prazo-alerta'
                                : 'prazo-ok secundario'
                        }
                      >
                        {!pendente
                          ? 'concluída'
                          : dias === null
                            ? 'sem prazo'
                            : dias < 0
                              ? 'vencida há ' + Math.abs(dias) + ' dia(s)'
                              : dias === 0
                                ? 'vence hoje'
                                : 'faltam ' + dias + ' dia(s)'}
                      </div>
                    </td>
                    <td>
                      {pendente && (
                        <button
                          type="button"
                          className="botao botao-secundario botao-pequeno"
                          onClick={() => void marcarCadastrada(nota)}
                        >
                          Marcar cadastrada
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {visiveis.length === 0 && (
          <div className="vazio">
            {carregando
              ? 'Carregando notas…'
              : notas.length === 0
                ? 'Nenhuma nota registrada ainda. Use “+ Nova nota” ou escaneie um QR Code.'
                : 'Nenhuma nota corresponde a este filtro.'}
          </div>
        )}
      </section>
    </>
  )
}

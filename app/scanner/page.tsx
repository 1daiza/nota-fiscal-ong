'use client'

import Link from 'next/link'
import Scanner from '@/components/Scanner'

export default function PaginaScanner() {
  return (
    <>
      <div className="painel-topo" style={{ padding: 0, border: 'none' }}>
        <div>
          <h2 style={{ margin: 0 }}>Escanear nota doada</h2>
          <p className="secundario" style={{ margin: '4px 0 0' }}>
            Aponte a câmera para o QR Code da nota. O sistema confere se ela já
            foi registrada antes de salvar.
          </p>
        </div>
        <Link className="botao botao-secundario" href="/">
          Voltar ao painel
        </Link>
      </div>

      <div style={{ height: 20 }} />

      <Scanner />

      <div className="bloco" style={{ marginTop: 20 }}>
        <h3>Como funciona</h3>
        <ol className="lista-passos">
          <li>Ligue a câmera e aponte para o QR Code impresso na nota.</li>
          <li>
            O sistema lê a chave de 44 dígitos e verifica se essa nota já foi
            doada antes.
          </li>
          <li>
            Se for uma nota nova, confira os dados, complete o que faltar e
            salve.
          </li>
          <li>
            A nota entra no painel como <strong>A cadastrar</strong>, com o prazo
            da NFP já calculado.
          </li>
        </ol>
      </div>
    </>
  )
}

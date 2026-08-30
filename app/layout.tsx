import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Notas Fiscais Doadas | Natureza em Forma',
  description:
    'Sistema de gestão de notas fiscais doadas para a ONG veterinária Natureza em Forma.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="cabecalho">
          <div className="container cabecalho-conteudo">
            <div>
              <h1>Notas Fiscais Doadas</h1>
              <p>Natureza em Forma — controle de doações via Nota Fiscal Paulista</p>
            </div>
            <nav className="nav">
              <Link href="/">Painel</Link>
              <Link href="/scanner">Escanear</Link>
            </nav>
          </div>
        </header>

        <main>
          <div className="container">{children}</div>
        </main>

        <footer className="rodape">
          <div className="container">
            Natureza em Forma · Cada nota doada vira ração, vacina e cuidado.
          </div>
        </footer>
      </body>
    </html>
  )
}

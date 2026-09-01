'use client'

import { useRef, useState } from 'react'
import { extrairData, extrairValor, type Candidato } from '@/lib/ocr'
import { formatarData, formatarMoeda } from '@/lib/formato'

interface Props {
  /** Mês vindo da chave de acesso, usado para descartar data errada. */
  mesEsperado?: { ano: string; mes: string }
  onValor: (valor: string) => void
  onData: (data: string) => void
}

type Fase = 'ocioso' | 'lendo' | 'pronto' | 'vazio' | 'erro'

/**
 * Papel térmico fotografado é o pior caso para OCR: contraste baixo, papel
 * amassado, luz irregular. Antes de mandar para o Tesseract, deixamos a imagem
 * em tons de cinza, esticamos o contraste e ampliamos — é o que mais muda o
 * resultado, mais do que qualquer ajuste no OCR em si.
 */
async function prepararImagem(arquivo: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(arquivo)

  // O Tesseract acerta mais perto de 1500px de largura. Menor que isso perde
  // detalhe; muito maior trava celular antigo.
  const alvo = 1500
  const escala = Math.min(2, Math.max(1, alvo / bitmap.width))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponível')

  ctx.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close?.()

  const imagem = ctx.getImageData(0, 0, largura, altura)
  const px = imagem.data

  // 1) tons de cinza, com os pesos de luminância do olho humano
  const cinzas = new Uint8ClampedArray(largura * altura)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    cinzas[j] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0
  }

  // 2) contraste: joga o percentil 5 para preto e o 95 para branco, em vez de
  //    usar mínimo e máximo — assim um brilho ou uma sombra não estragam tudo
  const histograma = new Array(256).fill(0)
  for (const tom of cinzas) histograma[tom]++

  const total = cinzas.length
  let acumulado = 0
  let piso = 0
  let teto = 255
  for (let t = 0; t < 256; t++) {
    acumulado += histograma[t]
    if (acumulado >= total * 0.05) { piso = t; break }
  }
  acumulado = 0
  for (let t = 255; t >= 0; t--) {
    acumulado += histograma[t]
    if (acumulado >= total * 0.05) { teto = t; break }
  }
  const faixa = Math.max(1, teto - piso)

  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = Math.max(0, Math.min(255, ((cinzas[j] - piso) * 255) / faixa))
    px[i] = px[i + 1] = px[i + 2] = v
    px[i + 3] = 255
  }

  ctx.putImageData(imagem, 0, 0)
  return canvas
}

export default function LeitorFoto({ mesEsperado, onValor, onData }: Props) {
  const entradaRef = useRef<HTMLInputElement | null>(null)

  const [fase, setFase] = useState<Fase>('ocioso')
  const [progresso, setProgresso] = useState(0)
  const [valor, setValor] = useState<Candidato<number> | null>(null)
  const [data, setData] = useState<Candidato<string> | null>(null)

  async function processar(arquivo: File) {
    setFase('lendo')
    setProgresso(0)
    setValor(null)
    setData(null)

    let worker: { terminate: () => Promise<unknown> } | null = null

    try {
      const canvas = await prepararImagem(arquivo)

      // Carregado só aqui: são alguns megabytes que quem não usa a foto
      // nunca precisa baixar.
      const { createWorker } = await import('tesseract.js')

      const criado = await createWorker('eng', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') {
            setProgresso(Math.round(m.progress * 100))
          }
        },
      })
      worker = criado

      const resultado = await criado.recognize(canvas)
      const texto = resultado.data.text ?? ''

      const achadoValor = extrairValor(texto)
      const achadoData = extrairData(texto, mesEsperado)

      setValor(achadoValor)
      setData(achadoData)
      setFase(achadoValor || achadoData ? 'pronto' : 'vazio')
    } catch {
      setFase('erro')
    } finally {
      await worker?.terminate().catch(() => {})
    }
  }

  return (
    <div className="leitor-foto">
      <input
        ref={entradaRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          e.target.value = ''
          if (arquivo) void processar(arquivo)
        }}
      />

      <button
        type="button"
        className="botao botao-secundario botao-pequeno"
        onClick={() => entradaRef.current?.click()}
        disabled={fase === 'lendo'}
      >
        {fase === 'lendo'
          ? 'Lendo a foto… ' + progresso + '%'
          : 'Ler valor da foto do cupom'}
      </button>

      {fase === 'lendo' && (
        <p className="secundario">
          Isso roda dentro do seu celular — a foto não é enviada para lugar
          nenhum. Na primeira vez demora mais, porque baixa o leitor.
        </p>
      )}

      {fase === 'pronto' && (
        <div className="ocr-achados">
          {valor && (
            <div className="ocr-achado">
              <div>
                <strong>{formatarMoeda(valor.valor)}</strong>{' '}
                <span className="secundario">— {valor.origem}</span>
                {!valor.confiavel && (
                  <div className="secundario">
                    Não achei a linha do TOTAL. Confira antes de usar.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => onValor(valor.valor.toFixed(2).replace('.', ','))}
              >
                Usar
              </button>
            </div>
          )}

          {data && (
            <div className="ocr-achado">
              <div>
                <strong>{formatarData(data.valor)}</strong>{' '}
                <span className="secundario">— {data.origem}</span>
              </div>
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => onData(data.valor)}
              >
                Usar
              </button>
            </div>
          )}
        </div>
      )}

      {fase === 'vazio' && (
        <p className="secundario">
          Não consegui achar o valor nessa foto. Tente de novo com o cupom
          esticado e boa luz, ou digite à mão.
        </p>
      )}

      {fase === 'erro' && (
        <p className="secundario">
          Deu erro ao ler a foto. Digite o valor à mão.
        </p>
      )}
    </div>
  )
}

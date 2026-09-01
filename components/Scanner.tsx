'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import FormularioNota from './FormularioNota'
import {
  detectarDuplicidade,
  somenteDigitos,
  supabaseConfigurado,
  type NotaFiscal,
} from '@/lib/supabase'
import {
  formatarChave,
  formatarCnpj,
  formatarData,
  formatarMoeda,
} from '@/lib/formato'

/** Dados que conseguimos extrair do QR Code da NFC-e. */
interface LeituraQr {
  chave: string
  cnpj: string | null
  dataEmissao: string | null
  valor: string | null
}

type Etapa = 'ocioso' | 'lendo' | 'verificando' | 'duplicada' | 'confirmando'

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
export function dividirChave(chave: string) {
  if (chave.length !== 44) return null
  return {
    uf: chave.slice(0, 2),
    ano: '20' + chave.slice(2, 4),
    mes: chave.slice(4, 6),
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: chave.slice(22, 25),
    numero: chave.slice(25, 34),
  }
}

/**
 * Extrai o que der do conteúdo do QR Code da NFC-e.
 *
 * O formato muda conforme a versão do QR e se a nota foi emitida online ou em
 * contingência — o número de campos separados por "|" varia. Em vez de contar
 * com posições fixas, varremos todos os campos procurando o que reconhecemos:
 * um horário de emissão escondido em hexadecimal e um valor com centavos.
 */
export function lerQrCode(texto: string): LeituraQr | null {
  if (!texto) return null

  const chave = (texto.match(/\d{44}/) ?? [])[0]
  if (!chave) return null

  const partes = dividirChave(chave)
  let dataEmissao: string | null = null
  let valor: string | null = null

  const campos = (texto.split('p=')[1] ?? texto).split('|')

  for (const campo of campos) {
    if (!campo || campo === chave) continue

    // dhEmi vem em hexadecimal em algumas versões do QR.
    if (!dataEmissao && /^[0-9a-fA-F]+$/.test(campo) && campo.length >= 20) {
      try {
        const decodificado = (campo.match(/.{1,2}/g) ?? [])
          .map((par) => String.fromCharCode(parseInt(par, 16)))
          .join('')
        const iso = (decodificado.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0]
        if (iso) dataEmissao = iso
      } catch {
        // segue sem a data: o voluntário preenche na mão
      }
    }

    // vNF é o primeiro campo com centavos; o seguinte costuma ser o vICMS.
    if (!valor && /^\d{1,9}\.\d{2}$/.test(campo)) valor = campo
  }

  // Sem dhEmi no QR, ficamos com o mês da compra, que vem na chave.
  // O dia não existe na chave — o voluntário ajusta se precisar.
  if (!dataEmissao && partes) {
    const mes = Number(partes.mes)
    if (mes >= 1 && mes <= 12) dataEmissao = partes.ano + '-' + partes.mes + '-01'
  }

  return { chave, cnpj: partes?.cnpj ?? null, dataEmissao, valor }
}

interface Props {
  onSalvo?: (nota: NotaFiscal) => void
}

export default function Scanner({ onSalvo }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Trava para não disparar duas leituras do mesmo QR Code. */
  const lendoRef = useRef(false)

  const [etapa, setEtapa] = useState<Etapa>('ocioso')
  const [leitura, setLeitura] = useState<LeituraQr | null>(null)
  const [duplicada, setDuplicada] = useState<NotaFiscal | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  const pararCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((faixa) => faixa.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    lendoRef.current = false
  }, [])

  useEffect(() => pararCamera, [pararCamera])

  /** Confere duplicidade e leva para a confirmação dos dados. */
  const processarChave = useCallback(
    async (texto: string) => {
      const dados = lerQrCode(texto)
      if (!dados) {
        setErro(
          'Não encontrei uma chave de 44 dígitos nesse conteúdo. Confira o QR Code ou digite a chave manualmente.'
        )
        return
      }

      pararCamera()
      setErro(null)
      setSucesso(null)
      setLeitura(dados)
      setEtapa('verificando')

      const { dados: existente, erro: falha } = await detectarDuplicidade(
        dados.chave
      )

      if (falha) {
        setErro(falha)
        setEtapa('confirmando')
        return
      }

      if (existente) {
        setDuplicada(existente)
        setEtapa('duplicada')
        return
      }

      setDuplicada(null)
      setEtapa('confirmando')
    },
    [pararCamera]
  )

  async function ligarCamera() {
    setErro(null)
    setSucesso(null)
    setDuplicada(null)
    setLeitura(null)

    try {
      // O QR Code da NFC-e é denso (guarda uma URL longa), então pedimos a
      // maior resolução razoável — em 640x480 muitos celulares não resolvem.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setEtapa('lendo')

      // Dois motores de leitura:
      //
      // 1. BarcodeDetector — nativo do navegador, mais rápido, mas só existe
      //    no Chrome do Android e do ChromeOS.
      // 2. jsQR — JavaScript puro, roda em qualquer lugar. É o que faz o
      //    scanner funcionar no iPhone (Safari e Chrome do iOS), no Firefox
      //    e no Chrome do Windows, onde o item 1 não existe.
      const Detector = (window as any).BarcodeDetector
      const detectorNativo = Detector
        ? new Detector({ formats: ['qr_code'] })
        : null

      timerRef.current = setInterval(async () => {
        const video = videoRef.current
        if (!video || lendoRef.current) return
        // HAVE_CURRENT_DATA: sem isso o frame ainda está em branco.
        if (video.readyState < 2 || !video.videoWidth) return

        let bruto: string | null = null

        try {
          if (detectorNativo) {
            const codigos = await detectorNativo.detect(video)
            bruto = codigos?.[0]?.rawValue ?? null
          } else {
            const canvas = canvasRef.current
            const ctx = canvas?.getContext('2d', { willReadFrequently: true })
            if (canvas && ctx) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const achado = jsQR(imagem.data, imagem.width, imagem.height, {
                inversionAttempts: 'attemptBoth',
              })
              bruto = achado?.data ?? null
            }
          }
        } catch {
          // frame ruim: a próxima tentativa resolve
        }

        if (bruto) {
          lendoRef.current = true
          await processarChave(String(bruto))
        }
      }, 350)
    } catch {
      setEtapa('ocioso')
      setErro(
        'Não consegui acessar a câmera. Verifique a permissão do navegador — ou use a digitação manual abaixo.'
      )
    }
  }

  function cancelar() {
    pararCamera()
    setEtapa('ocioso')
    setLeitura(null)
    setDuplicada(null)
    setErro(null)
  }

  const camadaCamera = (
    <div className="camera-caixa">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        hidden={etapa !== 'lendo'}
      />
      {/* Usado só pelo jsQR para capturar o frame; nunca aparece na tela. */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {etapa === 'lendo' ? (
        <div className="mira" />
      ) : (
        <div className="camera-desligada">
          {etapa === 'verificando'
            ? 'Conferindo se esta nota já foi registrada…'
            : 'Câmera desligada. Toque em “Ligar câmera” e aponte para o QR Code da nota.'}
        </div>
      )}
    </div>
  )

  return (
    <div className="scanner">
      <div>
        {camadaCamera}

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {etapa === 'lendo' ? (
            <button className="botao botao-secundario" onClick={cancelar}>
              Parar câmera
            </button>
          ) : (
            <button
              className="botao"
              onClick={() => void ligarCamera()}
              disabled={etapa === 'verificando'}
            >
              Ligar câmera
            </button>
          )}
        </div>

        {etapa === 'lendo' && (
          <div className="aviso aviso-info" style={{ marginTop: 12 }}>
            Encaixe o QR Code dentro da moldura, a uns 15 cm de distância, com
            boa luz. A leitura é automática.
          </div>
        )}
      </div>

      <div>
        {!supabaseConfigurado && (
          <div className="aviso aviso-alerta">
            Banco de dados ainda não conectado — a leitura funciona, mas a nota
            não será salva. Configure o <code>.env.local</code> primeiro.
          </div>
        )}

        {erro && (
          <div className="aviso aviso-erro" role="alert">
            {erro}
          </div>
        )}

        {sucesso && (
          <div className="aviso aviso-sucesso" role="status">
            {sucesso}
          </div>
        )}

        {etapa === 'duplicada' && duplicada && (
          <div className="bloco confirmacao">
            <h3>Esta nota já está no sistema</h3>
            <div className="aviso aviso-erro">
              Nota duplicada — não precisa cadastrar de novo.
            </div>
            <dl>
              <dt>Estabelecimento</dt>
              <dd>{duplicada.estabelecimento ?? 'Não informado'}</dd>
              <dt>Valor</dt>
              <dd>{formatarMoeda(duplicada.valor)}</dd>
              <dt>Emissão</dt>
              <dd>{formatarData(duplicada.data_emissao)}</dd>
              <dt>Chave</dt>
              <dd className="secundario">{formatarChave(duplicada.chave_nfc)}</dd>
            </dl>
            <button className="botao" onClick={cancelar}>
              Ler outra nota
            </button>
          </div>
        )}

        {etapa === 'confirmando' && leitura && (
          <div className="bloco confirmacao">
            <h3>Confira os dados antes de salvar</h3>
            <dl>
              <dt>Chave lida</dt>
              <dd className="secundario">{formatarChave(leitura.chave)}</dd>
              <dt>CNPJ</dt>
              <dd>{formatarCnpj(leitura.cnpj)}</dd>
              <dt>Emissão</dt>
              <dd>
                {formatarData(leitura.dataEmissao)}
                {leitura.dataEmissao?.endsWith('-01') && (
                  <span className="secundario"> — só o mês vem no QR, ajuste o dia</span>
                )}
              </dd>
              <dt>Valor no QR</dt>
              <dd>
                {leitura.valor
                  ? formatarMoeda(Number(leitura.valor))
                  : 'não informado — digite abaixo'}
              </dd>
            </dl>

            <FormularioNota
              origem="scanner"
              inicial={{
                chave_nfc: leitura.chave,
                cnpj: leitura.cnpj ?? undefined,
                data_emissao: leitura.dataEmissao ?? undefined,
                valor: leitura.valor ?? undefined,
              }}
              onCancelar={cancelar}
              onSalvo={(nota) => {
                setEtapa('ocioso')
                setLeitura(null)
                setSucesso('Nota registrada com sucesso.')
                onSalvo?.(nota)
              }}
            />
          </div>
        )}

        {(etapa === 'ocioso' || etapa === 'lendo') && (
          <div className="bloco">
            <h3>Digitar a chave manualmente</h3>
            <div className="campo">
              <label htmlFor="manual">Chave de acesso (44 dígitos)</label>
              <input
                id="manual"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Os 44 números impressos no rodapé da nota"
                inputMode="numeric"
              />
            </div>
            <button
              className="botao"
              style={{ marginTop: 12 }}
              disabled={somenteDigitos(manual).length !== 44}
              onClick={() => void processarChave(somenteDigitos(manual))}
            >
              Conferir esta chave
            </button>
            <p className="secundario" style={{ marginTop: 10 }}>
              {somenteDigitos(manual).length}/44 dígitos
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

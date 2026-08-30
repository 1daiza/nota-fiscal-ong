'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FormularioNota from './FormularioNota'
import {
  detectarDuplicidade,
  somenteDigitos,
  supabaseConfigurado,
  type NotaFiscal,
} from '@/lib/supabase'
import { formatarChave, formatarData, formatarMoeda } from '@/lib/formato'

/** Dados que conseguimos extrair do QR Code da NFC-e. */
interface LeituraQr {
  chave: string
  dataEmissao: string | null
  valor: string | null
}

type Etapa = 'ocioso' | 'lendo' | 'verificando' | 'duplicada' | 'confirmando'

/**
 * Extrai o que der do conteúdo do QR Code da NFC-e.
 *
 * O padrão da SEFAZ traz os campos separados por "|" no parâmetro `p`:
 * chave | versão | ambiente | destinatário | dhEmi(hex) | vNF | ...
 * Nem toda versão traz data e valor, então tudo além da chave é opcional.
 */
export function lerQrCode(texto: string): LeituraQr | null {
  if (!texto) return null

  const chave = (texto.match(/\d{44}/) ?? [])[0]
  if (!chave) return null

  let dataEmissao: string | null = null
  let valor: string | null = null

  const campos = (texto.split('p=')[1] ?? texto).split('|')
  if (campos.length >= 6) {
    const dhEmiHex = campos[4]
    if (/^[0-9a-fA-F]+$/.test(dhEmiHex ?? '')) {
      try {
        const decodificado = (dhEmiHex.match(/.{1,2}/g) ?? [])
          .map((par) => String.fromCharCode(parseInt(par, 16)))
          .join('')
        const iso = (decodificado.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0]
        if (iso) dataEmissao = iso
      } catch {
        // data continua nula: o voluntário preenche na mão
      }
    }

    const bruto = campos[5]
    if (bruto && /^\d+(\.\d{1,2})?$/.test(bruto)) valor = bruto
  }

  // A data também pode estar embutida na própria chave (posições 3 a 6: AAMM).
  if (!dataEmissao) {
    const ano = '20' + chave.slice(2, 4)
    const mes = chave.slice(4, 6)
    if (Number(mes) >= 1 && Number(mes) <= 12) {
      dataEmissao = ano + '-' + mes + '-01'
    }
  }

  return { chave, dataEmissao, valor }
}

interface Props {
  onSalvo?: (nota: NotaFiscal) => void
}

export default function Scanner({ onSalvo }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [etapa, setEtapa] = useState<Etapa>('ocioso')
  const [leitura, setLeitura] = useState<LeituraQr | null>(null)
  const [duplicada, setDuplicada] = useState<NotaFiscal | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [temDetector, setTemDetector] = useState(true)

  const pararCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((faixa) => faixa.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => pararCamera, [pararCamera])

  useEffect(() => {
    if (typeof window !== 'undefined' && !('BarcodeDetector' in window)) {
      setTemDetector(false)
    }
  }, [])

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setEtapa('lendo')

      const Detector = (window as any).BarcodeDetector
      if (!Detector) {
        setTemDetector(false)
        return
      }

      const detector = new Detector({ formats: ['qr_code'] })
      timerRef.current = setInterval(async () => {
        if (!videoRef.current) return
        try {
          const codigos = await detector.detect(videoRef.current)
          const bruto = codigos?.[0]?.rawValue
          if (bruto) await processarChave(String(bruto))
        } catch {
          // frame ruim: a próxima tentativa resolve
        }
      }, 500)
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
      <video ref={videoRef} playsInline muted hidden={etapa !== 'lendo'} />
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

        {!temDetector && (
          <div className="aviso aviso-info" style={{ marginTop: 12 }}>
            Este navegador não faz a leitura automática de QR Code. Use o Chrome
            no Android, ou digite a chave de 44 dígitos no campo ao lado.
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
              <dt>Emissão</dt>
              <dd>{formatarData(leitura.dataEmissao)}</dd>
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

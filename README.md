# 🐾 Notas Fiscais Doadas — Natureza em Forma

Sistema web para a ONG veterinária **Natureza em Forma** controlar as notas
fiscais doadas por apoiadores e cadastradas no programa **Nota Fiscal Paulista
(NFP)**.

O problema que ele resolve: as notas chegam por WhatsApp, papel e caixinha de
doação, alguém precisa lançar cada uma no portal da NFP **até o dia 20 do mês
seguinte**, e é fácil perder o prazo ou cadastrar a mesma nota duas vezes.

---

## ✨ O que o sistema faz

| Recurso | Descrição |
|---|---|
| **Painel** | 5 cards de resumo — notas recebidas, valor total, cadastradas, a cadastrar e vencendo |
| **Tabela de notas** | Emissão, estabelecimento, valor, situação e prazo, com destaque colorido para o que está atrasado |
| **Filtros e busca** | Por situação (a cadastrar, cadastradas, vencendo, em revisão, duplicadas) e por texto |
| **Cadastro manual** | Formulário com validação de valor e de chave de 44 dígitos |
| **Scanner de QR Code** | Lê o QR Code da NFC-e pela câmera do celular e extrai a chave, a data e o valor |
| **Detecção de duplicidade** | Antes de salvar, confere se aquela chave já existe — e avisa qual nota é |
| **Controle de prazo** | Calcula sozinho o dia 20 do mês seguinte e mostra quantos dias faltam |
| **Auditoria** | Toda criação, mudança de situação e duplicidade fica registrada na tabela `logs` |

---

## 🧱 Tecnologias

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Supabase** (PostgreSQL gerenciado) como banco de dados
- **CSS puro** — sem framework de estilo, para o projeto ficar leve e fácil de mexer
- **Vercel** para publicar (deploy automático a cada `git push`)

O scanner tem dois motores de leitura: usa o `BarcodeDetector` nativo quando o
navegador tem (Chrome no Android, mais rápido) e cai para o **jsQR** quando não
tem. É o jsQR que faz a leitura funcionar no **iPhone**, no Firefox e no Chrome
do Windows — nenhum deles tem a API nativa.

---

## 📁 Estrutura

```
nota-fiscal-ong/
├── app/
│   ├── layout.tsx          cabeçalho, navegação e rodapé
│   ├── globals.css         estilo de todo o sistema
│   ├── page.tsx            painel: cards, filtros e tabela
│   └── scanner/page.tsx    página de leitura de QR Code
├── components/
│   ├── Scanner.tsx         câmera, leitura, duplicidade e confirmação
│   └── FormularioNota.tsx  formulário de cadastro (manual e via scanner)
├── lib/
│   ├── supabase.ts         cliente + todas as funções de dados
│   └── formato.ts          moeda, data, CNPJ, chave e rótulos
├── schema.sql              as 3 tabelas, índices, trigger de prazo e RLS
├── .env.example            modelo das variáveis de ambiente
├── INSTRUCTIONS.md         passo a passo de instalação
└── PROJECT_STATUS.md       o que está pronto e o que vem depois
```

---

## 🚀 Começar

O passo a passo completo (Supabase, variáveis, deploy) está em
**[INSTRUCTIONS.md](INSTRUCTIONS.md)**. Resumo:

```bash
npm install
cp .env.example .env.local   # e preencha com os dados do Supabase
npm run dev
```

Abra <http://localhost:3000>.

> O sistema **não quebra** sem o Supabase configurado: ele abre normalmente e
> mostra um aviso explicando o que falta preencher.

---

## 🗄️ Banco de dados

Três tabelas, criadas pelo `schema.sql`:

- **`usuarios`** — operadores do sistema (`id`, `email`, `senha_hash`, `nome`,
  `role`, `ativo`, `criado_em`)
- **`notas_fiscais`** — as notas doadas (`chave_nfc`, `cnpj`, `estabelecimento`,
  `data_emissao`, `valor`, `status`, `origem`, `doador_nome`, `doador_contato`,
  `prazo_cadastro`, `cadastrado_em`, `observacoes`, `criado_por`, `criado_em`,
  `atualizado_em`)
- **`logs`** — auditoria (`usuario_id`, `acao`, `entidade`, `entidade_id`,
  `detalhes`, `criado_em`)

Situações possíveis de uma nota: `novo`, `a_cadastrar`, `cadastrado`,
`duplicado`, `revisao`.

---

## 🔐 Segurança — leia antes de usar com dados reais

Este é um **MVP**. As políticas de RLS no `schema.sql` liberam leitura e
escrita para a chave pública (`anon`), para o sistema funcionar sem tela de
login. Isso é aceitável para testar com a equipe, mas **antes de colocar dados
reais de doadores**:

1. Ative o Supabase Auth e crie a tela de login.
2. Troque as políticas `*_acesso_mvp` por políticas baseadas em `auth.uid()`.
3. Nunca commite o `.env.local` (ele já está no `.gitignore`).

---

## 📄 Licença

Uso interno da ONG Natureza em Forma.

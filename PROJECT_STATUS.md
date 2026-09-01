# 📊 Status do projeto — MVP

**Versão:** 1.0.0 (MVP)
**Data:** 29/08/2026
**Situação:** 🟢 Código completo, compilando e pronto para configurar o banco

---

## ✅ Pronto e funcionando

### Frontend
- [x] Estrutura Next.js 14 com App Router e TypeScript em modo `strict`
- [x] Layout com cabeçalho, navegação e rodapé
- [x] Painel com 5 cards de resumo (total, valor, cadastradas, a cadastrar, vencendo)
- [x] Tabela de notas com destaque colorido por prazo (normal / alerta / vencida)
- [x] Filtros por situação + busca por texto
- [x] Formulário de cadastro com validação de valor e de chave de 44 dígitos
- [x] Ação "Marcar cadastrada" direto na tabela
- [x] Página de scanner com câmera, mira e leitura de QR Code em qualquer navegador (BarcodeDetector nativo + jsQR como alternativa)
- [x] Entrada manual da chave como alternativa ao scanner
- [x] Leitura de valor e data pela foto do cupom (OCR no próprio aparelho)
- [x] CNPJ tirado da chave e nome do estabelecimento buscado na Receita
- [x] Tela de confirmação dos dados antes de salvar
- [x] Aviso claro quando a nota lida já existe (duplicidade)
- [x] Funciona sem o Supabase configurado, avisando o que falta

### Backend / dados
- [x] `schema.sql` com 3 tabelas, índices e trigger de prazo
- [x] Cliente Supabase tipado em `lib/supabase.ts`
- [x] Funções: `registrarNota`, `obterNotas`, `obterNota`, `detectarDuplicidade`,
      `atualizarStatus`, `removerNota`, `registrarLog`, `obterResumo`
- [x] Cálculo automático do prazo da NFP (dia 20 do mês seguinte) — no app e no banco
- [x] Duplicidade barrada em dois níveis: checagem antes do insert **e** índice
      único no PostgreSQL
- [x] Auditoria gravada na tabela `logs`
- [x] RLS habilitado (com políticas de MVP)

### Qualidade
- [x] `npx tsc --noEmit` sem erros
- [x] `npm run build` concluído com sucesso
- [x] Documentação em português: README, INSTRUCTIONS e este arquivo

---

## ⏳ Depende de você (configuração)

- [ ] Criar o projeto no Supabase e rodar o `schema.sql`
- [ ] Preencher o `.env.local` com URL e chave anon
- [ ] Testar localmente com `npm run dev`
- [ ] Publicar na Vercel

Passo a passo em [INSTRUCTIONS.md](INSTRUCTIONS.md).

---

## 🚧 Limitações conhecidas do MVP

| Limitação | Impacto | Como resolver depois |
|---|---|---|
| **Sem login** | Qualquer pessoa com o link acessa e edita | Ativar Supabase Auth e trocar as políticas de RLS por `auth.uid()` |
| **RLS aberto para `anon`** | Não use com dados reais de doadores ainda | Mesma solução acima — é o item nº 1 da lista |
| **Tabela `usuarios` sem uso no app** | Ela existe no banco, mas nada grava nela | Preenchida junto com o login |
| **Leitura na mão-grande** | QR muito danificado ou amassado pode não ler | Entrada manual da chave já cobre |
| **OCR sugere, não decide** | Papel amassado ou foto escura pode não ler | É de propósito: o achado vira sugestão com botão "Usar", nunca preenche sozinho |
| **Sem integração com o portal NFP** | O lançamento no portal continua manual | Avaliar automação depois — o portal não tem API pública |
| **Limite de 500 notas na tela** | Suficiente por bastante tempo | Adicionar paginação quando o volume crescer |
| **Sem exportação** | Relatório para a diretoria é manual | Botão de exportar CSV/Excel |

---

## 🗺️ Próximos passos sugeridos (em ordem de valor)

1. **Login** — fecha o buraco de segurança e permite saber quem cadastrou o quê.
2. **Exportar CSV** — facilita a prestação de contas da ONG.
3. **Aviso de prazo** — e-mail ou WhatsApp semanal com as notas vencendo.
4. **Página de detalhe da nota** — histórico de alterações vindo da tabela `logs`.
5. **Chave por OCR** — hoje a foto lê valor e data; ler também a chave de 44 dígitos dispensaria o QR Code.
6. **Multi-ONG** — se a ideia de virar SaaS para outras ONGs avançar.

---

## 📈 Números do MVP

| Item | Quantidade |
|---|---|
| Arquivos de código e configuração | 16 |
| Páginas | 2 (painel e scanner) |
| Componentes React | 2 (`Scanner`, `FormularioNota`) |
| Tabelas no banco | 3 |
| Índices | 8 |
| Funções de dados | 8 |

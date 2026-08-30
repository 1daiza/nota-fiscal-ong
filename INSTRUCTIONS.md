# 🛠️ Instalação passo a passo

Guia completo, do zero até o sistema no ar. Tempo estimado: **20 minutos**.

Você vai precisar de: uma conta no [Supabase](https://supabase.com) (grátis),
uma conta na [Vercel](https://vercel.com) (grátis) e o
[Node.js 18+](https://nodejs.org) instalado.

---

## Passo 1 — Criar o banco no Supabase (10 min)

1. Acesse <https://supabase.com> e clique em **Start your project**.
2. **New project**:
   - **Name:** `nota-fiscal-ong`
   - **Database Password:** gere uma senha forte e **guarde num lugar seguro**
   - **Region:** `South America (São Paulo)`
3. Espere uns 2 minutos enquanto o projeto é criado.
4. No menu lateral, abra **SQL Editor → New query**.
5. Abra o arquivo `schema.sql` deste projeto, **copie tudo** e cole no editor.
6. Clique em **Run**. Deve aparecer `Success. No rows returned`.
7. Confira em **Table Editor**: devem existir 3 tabelas — `usuarios`,
   `notas_fiscais` e `logs`.

---

## Passo 2 — Pegar as credenciais (2 min)

1. No Supabase, vá em **Project Settings → API**.
2. Copie os dois valores:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **anon public** (em *Project API keys*) → uma chave longa começando com `eyJ...`

> ⚠️ Use a chave **anon / public**. A chave `service_role` **nunca** deve entrar
> num projeto de frontend — ela ignora todas as regras de segurança.

---

## Passo 3 — Configurar o projeto local (3 min)

No terminal, dentro da pasta `nota-fiscal-ong`:

```bash
npm install
```

Crie o arquivo de variáveis:

```bash
cp .env.example .env.local
```

No Windows (PowerShell), use:

```bash
copy .env.example .env.local
```

Abra o `.env.local` e cole as suas credenciais:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
```

---

## Passo 4 — Rodar e testar (2 min)

```bash
npm run dev
```

Abra <http://localhost:3000>. Você deve ver o painel com os 5 cards zerados.

**Teste rápido:**

1. Clique em **+ Nova nota**.
2. Preencha estabelecimento, data e valor. Salve.
3. A nota aparece na tabela com a situação **A cadastrar** e o prazo da NFP já
   calculado (dia 20 do mês seguinte).
4. Clique em **Marcar cadastrada** — ela muda para **Cadastrado** e sai da
   contagem de pendentes.
5. Cadastre outra nota repetindo a mesma chave de 44 dígitos: o sistema deve
   recusar, avisando que é duplicada.

Se aparecer o aviso amarelo *"Banco de dados ainda não conectado"*, o
`.env.local` não foi lido — confira o nome do arquivo e **reinicie o
`npm run dev`** (variáveis de ambiente só são lidas na inicialização).

---

## Passo 5 — Testar o scanner no celular (opcional)

A câmera do navegador só funciona em `https` ou em `localhost`. Para testar no
celular, o caminho mais fácil é publicar na Vercel (passo 6) e abrir o link
pelo telefone.

A leitura automática de QR Code usa a API `BarcodeDetector`, que hoje funciona
no **Chrome (Android e desktop)**. No Safari/iPhone o botão de câmera abre, mas
a leitura automática não roda — nesse caso use o campo **"Digitar a chave
manualmente"**, que faz a mesma checagem de duplicidade.

---

## Passo 6 — Publicar na Vercel (3 min)

1. Suba o código para o GitHub (veja abaixo).
2. Acesse <https://vercel.com> → **Add New → Project**.
3. Escolha o repositório `nota-fiscal-ong` e clique em **Import**.
4. Em **Environment Variables**, adicione as duas variáveis:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Clique em **Deploy**. Em ~1 minuto o link está no ar.

A partir daí, todo `git push` para a branch `main` publica sozinho.

### Subindo para o GitHub

```bash
git init
git add .
git commit -m "Sistema de gestao de notas fiscais doadas - MVP"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/nota-fiscal-ong.git
git push -u origin main
```

Se o Git pedir senha, use um **token de acesso** em vez da senha da conta:
<https://github.com/settings/tokens> → *Generate new token (classic)* → marque o
escopo **repo** → copie e cole como senha.

---

## 🩺 Se algo der errado

| Sintoma | Causa provável | Solução |
|---|---|---|
| Aviso amarelo "Banco de dados ainda não conectado" | `.env.local` ausente ou não recarregado | Confira o nome do arquivo e reinicie o `npm run dev` |
| `relation "notas_fiscais" does not exist` | O `schema.sql` não rodou | Repita o Passo 1, item 5 |
| A tabela abre vazia mesmo com notas no banco | Políticas de RLS bloqueando | Confirme que a parte final do `schema.sql` (seção 5) rodou |
| "Não consegui acessar a câmera" | Permissão negada ou site em `http` | Permita a câmera nas configurações do navegador e use `https` |
| Erro no build da Vercel | Variáveis de ambiente faltando | Adicione as duas variáveis em *Settings → Environment Variables* e refaça o deploy |
| `npm install` falha | Node antigo | Instale o Node 18 ou superior |

---

## 🔁 Rotina do dia a dia (para a equipe)

1. As notas chegam → cadastre no sistema (escaneando ou digitando).
2. Uma vez por semana, filtre por **A cadastrar** e lance essas notas no portal
   da NFP.
3. Volte ao sistema e clique em **Marcar cadastrada** em cada uma.
4. Fique de olho no card **Vencendo** — ele mostra o que tem prazo estourando
   nos próximos 7 dias.

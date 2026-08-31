# ACQUA Almoxarifado — Grupo Alcina Maria

Controle de almoxarifado com **entrega de materiais a colaboradores** e **assinatura digital do
Termo de Responsabilidade**.

O admin monta a entrega no painel; o sistema gera um link pessoal e envia pelo Slack; o
colaborador confere os itens no celular, confirma seus dados e assina com o dedo; a empresa
contra-assina; o PDF é arquivado e o estoque baixa sozinho — com trilha de auditoria de cada
unidade.

```
Admin monta a entrega  →  link único (Slack ou copiado)  →  colaborador assina
        ↓                                                        ↓
  snapshot dos itens                                    baixa automática no estoque
        ↓                                                        ↓
  contra-assinatura da empresa  →  PDF assinado arquivado  →  devolução (reentrada)
```

---

## Sumário

- [Stack](#stack)
- [Estrutura](#estrutura)
- [Começando em 3 comandos](#começando-em-3-comandos)
- [Modelo de dados](#modelo-de-dados)
- [Fluxo ponta a ponta](#fluxo-ponta-a-ponta)
- [Configurando o Firebase](#configurando-o-firebase)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Plugando o bot do Slack](#plugando-o-bot-do-slack)
- [API](#api)
- [Segurança e LGPD](#segurança-e-lgpd)
- [Design](#design)
- [Deploy no Render](#deploy-no-render)
- [Scripts](#scripts)

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 18 + Vite + TypeScript, TailwindCSS, **Three.js / React Three Fiber**, GSAP-class motion com Framer Motion |
| Backend | Node.js + **Express** + TypeScript, validação com **zod** |
| Banco | **Firebase** — Firestore (dados **e arquivos**) e Auth (admin), via **Admin SDK**; Cloud Storage é opcional |
| PDF | **pdf-lib** (geração server-side, sem headless browser) |
| Notificações | **Slack Bolt** — desacoplado atrás de uma interface `NotificationChannel` |

Tudo em TypeScript, com `npm workspaces`.

---

## Estrutura

```
.
├── server/                     API Express + Firebase Admin + PDF + Slack
│   └── src/
│       ├── app.ts              montagem do Express (rotas, CORS, SPA em produção)
│       ├── index.ts            bootstrap
│       ├── seed.ts             materiais de exemplo
│       ├── config/env.ts       env validado e normalizado
│       ├── domain/             tipos, schemas zod e o texto do Termo
│       ├── data/               datastore (Firestore | driver local) + repositórios
│       ├── http/               auth, erros, rate limit e rotas
│       ├── services/
│       │   ├── deliveries.ts   casos de uso do fluxo de entrega/assinatura
│       │   ├── stock.ts        movimentações transacionais + auditoria
│       │   ├── storage.ts      arquivos sensíveis com URL assinada
│       │   ├── pdf/term-pdf.ts o Termo de Responsabilidade em A4
│       │   └── notifications/  interface plugável + implementação Slack
│       └── slack/bolt.ts       bot (eventos, interações, slash commands)
│
├── web/                        Interface React
│   └── src/
│       ├── pages/              landing, login, /aceite/:token e o painel
│       ├── three/              cena WebGL do monograma e do selo 3D
│       ├── components/         design system (botões, campos, modais, assinatura…)
│       └── lib/                cliente HTTP, auth, formatação, detecção de device
│
├── tools/trace-monogram.mjs    vetoriza o PNG do logo → SVG + geometria 3D
├── assets/brand/               logo original e derivados
├── firestore.rules             tudo bloqueado para o cliente (acesso só via API)
├── storage.rules               idem para assinaturas e PDFs
└── firebase.json               regras + emuladores
```

---

## Começando em 3 comandos

```bash
npm install
npm run seed      # materiais de exemplo: Camisa PP–GG, Calça 35/40/45 (dezena), Tênis (pares)…
npm run dev       # API em :4000 e interface em :5173
```

Abra <http://localhost:5173> e entre com:

```
logisticavdpenedo@cpalcina.com
almoxarifado
```

> **Já colocou a chave em `server/service-account.json`?** A partir daí o ambiente local passa
> a falar com o Firestore de verdade, e o login de desenvolvimento se desliga sozinho. Para
> voltar ao modo de demonstração sem tocar na chave, crie `server/.env` com
> `DATA_DRIVER=local` e `ALLOW_DEV_AUTH=true`.

> **Sem Firebase? Funciona igual.** Na ausência de credenciais, o backend sobe com um *driver
> local* que grava em `server/.data/*.json` e com um login de desenvolvimento assinado por HMAC.
> A aplicação inteira — entrega, assinatura, PDF, devolução — roda de ponta a ponta. É modo de
> demonstração: para produção, configure o Firebase (abaixo) e desligue `ALLOW_DEV_AUTH`.

---

## Modelo de dados

**Flexibilidade é a regra**: nada de tamanhos, numerações ou unidades fixos no código. Quem
cadastra o material decide como ele varia.

### `materials`

```jsonc
{
  "id": "mat_…",
  "name": "Camisa",
  "category": "Fardamento",
  "brand": "ACQUA",
  "model": "Social manga curta",
  "conservationDefault": "Novo",

  "variantLabel": "Tamanho",          // rótulo do eixo: "Tamanho", "Numeração", "Voltagem"…
  "variantType": "letter",            // "letter" | "number" | "custom"
  "variants": [                       // criadas livremente pelo admin
    { "key": "PP", "stock": 20 },
    { "key": "P",  "stock": 10 },
    { "key": "G",  "stock": 5, "minStock": 2 }
  ],

  "customFields": [                   // atributos extras definidos pelo admin
    { "label": "Cor", "type": "select", "options": ["Branco", "Preto"] },
    { "label": "Tecido", "type": "text", "defaultValue": "Algodão penteado" }
  ],

  "unit": "unidade",                  // texto livre: "par", "dezena", "caixa"…
  "active": true,
  "createdAt": "…", "updatedAt": "…"
}
```

Os exemplos do seed cobrem os casos pedidos: **Camisa** por letra (PP=20, P=10, G=5), **Calça**
por numeração (35/40/45) medida em **dezena**, **Tênis** em **pares**, além de Moletom, Blazer e
um item de eixo livre (Crachá).

### `employees`

```jsonc
{ "id": "col_…", "fullName": "…", "cpf": "…", "role": "…", "sector": "…", "slackUserId": "U…", "active": true }
```

### `deliveries`

```jsonc
{
  "id": "ent_…",
  "token": "…",                       // 256 bits url-safe — o link público
  "tokenExpiresAt": "…",              // expiração (padrão: 7 dias)
  "employeeId": "col_…",              // ou apenas employeeDraft, quando não há cadastro
  "employeeDraft": { "fullName": "…", "cpf": "…", "role": "…", "sector": "…" },

  "items": [                          // SNAPSHOT imutável do catálogo no momento da entrega
    {
      "materialId": "mat_…", "name": "Camisa", "brand": "ACQUA", "model": "Social manga curta",
      "variantLabel": "Tamanho", "variantKey": "G", "quantity": 2, "unit": "unidade",
      "conservation": "Novo", "customValues": { "Cor": "Branco" }, "returnedQuantity": 0
    }
  ],

  "status": "draft | sent | signed_by_employee | countersigned | archived | returned",
  "slackChannel": "D…", "slackMessageTs": "…",

  "employeeSignature": { "imagePath": "signatures/…", "signedAt": "…", "ip": "…", "userAgent": "…", "fullName": "…", "cpf": "…" },
  "adminSignature":    { "imagePath": "signatures/…", "signedAt": "…", "adminUid": "…", "adminName": "…" },

  "pdfPath": "terms/ent_…/termo-de-responsabilidade.pdf",
  "stockWarnings": [], "returns": [],
  "createdBy": "…", "createdAt": "…", "updatedAt": "…"
}
```

O `items` é **snapshot**: mudar o catálogo depois não reescreve termos já assinados.

### `stock_movements`

Cada unidade que entra ou sai deixa registro:

```jsonc
{ "materialId": "…", "variantKey": "G", "delta": -2, "stockAfter": 3,
  "reason": "delivery_signed", "deliveryId": "ent_…", "actorUid": "…", "actorName": "…", "at": "…" }
```

`reason` ∈ `material_created` · `manual_adjustment` · `delivery_signed` · `delivery_returned`.
O saldo de uma variante **nunca** é editado direto no formulário: muda só por movimento auditado.

### `settings`, `admins` e `files`

`settings/app` guarda os dados da EMPRESA usados no termo e o limite de estoque baixo.
`admins/{uid}` guarda o nome exibido no termo e a assinatura salva do representante.

`files/{hash}` guarda os arquivos sensíveis quando não há Cloud Storage configurado:

```jsonc
{ "path": "terms/ent_…/termo-de-responsabilidade.pdf", "contentType": "application/pdf",
  "size": 10340, "data": "<base64>", "updatedAt": "…" }
```

Cabe: um termo assinado ocupa ~15 kB entre PDF e as duas assinaturas, contra o limite de
1 MiB por documento do Firestore e 1 GiB do plano gratuito. Arquivos acima de 700 kB são
recusados com uma mensagem pedindo que se configure o Cloud Storage.

---

## Fluxo ponta a ponta

1. **Nova entrega** — o admin escolhe material + variante + quantidade. Descrição, marca/modelo,
   quantidade e estado de conservação vêm do cadastro; o colaborador não preenche nada disso.
   A disponibilidade é validada na criação (`409` se faltar saldo).
2. **Envio** — o backend chama `notifier.sendDeliveryInvite()`. Com Slack configurado, o bot manda
   uma DM com card do Block Kit e botão *Assinar termo*. Sem Slack, a API devolve o `acceptUrl`
   e a interface mostra o link para copiar. **O Slack nunca é dependência.**
3. **Aceite** (`/aceite/:token`, mobile-first) — o colaborador vê os itens, confirma
   Nome/CPF/Cargo/Setor (pré-preenchidos se já cadastrado), lê o termo, assina no canvas e aceita.
   Gravamos a assinatura em PNG, data/hora, IP e user-agent.
4. **Baixa de estoque** — em transação, junto do registro em `stock_movements`.
   Se o saldo não cobrir, a baixa é limitada a zero e um aviso aparece no painel: um documento
   jurídico não pode falhar por divergência de inventário.
5. **Contra-assinatura** — o admin revisa e assina como representante (desenhando ou reaproveitando
   a assinatura salva). O PDF final é regerado com as duas assinaturas.
6. **Arquivo e devolução** — PDF baixável por URL assinada, histórico por colaborador e registro de
   devolução (total ou parcial) com reentrada no estoque.

O link vira somente leitura depois de assinado e expira sozinho.

---

## Configurando o Firebase

1. **Crie o projeto** em <https://console.firebase.google.com>.
2. **Firestore** → criar banco (modo produção).
3. **Authentication** → habilitar *E-mail/senha* e criar os usuários do almoxarifado/RH.
   Depois registre um **app da Web** (⚙️ *Configurações do projeto* › *Geral* › ícone `</>`) e
   guarde `apiKey`, `authDomain`, `projectId` e `appId` — são as variáveis `VITE_*` que fazem
   a tela de login funcionar.
4. **Storage (opcional)** → só se você quiser guardar os arquivos no Cloud Storage. Por
   padrão eles vão para a coleção `files` do Firestore, o que mantém o projeto no **plano
   gratuito** — o Cloud Storage exige o plano Blaze. Se criar o bucket, anote o nome exato
   (ex.: `seu-projeto.firebasestorage.app`) e preencha `FIREBASE_STORAGE_BUCKET`.
5. **Conta de serviço** → *Configurações do projeto › Contas de serviço › Gerar nova chave privada*.
   Salve como `server/service-account.json` (já está no `.gitignore`).
6. **Publique as regras** — elas bloqueiam **todo** acesso direto do cliente; a API usa o Admin SDK,
   que passa por cima das regras:

   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes,storage
   ```

7. Preencha `server/.env` e `web/.env` (próxima seção) e reinicie. O log de boot mostra
   `Banco .......... Firestore`.

Para desenvolver contra o **Firebase Emulator Suite**, rode `npx firebase emulators:start` e
descomente `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` / `FIREBASE_STORAGE_EMULATOR_HOST`.

---

## Variáveis de ambiente

Copie os exemplos: `cp server/.env.example server/.env` e `cp web/.env.example web/.env`.

### `server/.env`

| Variável | Para que serve |
| --- | --- |
| `PORT`, `NODE_ENV` | porta e ambiente |
| `APP_BASE_URL` | domínio do frontend — monta o link `/aceite/:token` |
| `API_BASE_URL` | domínio da API — usado nas URLs assinadas de arquivo |
| `CORS_ORIGINS` | origens liberadas (separadas por vírgula) |
| `DATA_DRIVER` | `auto` (padrão), `firestore` ou `local` |
| `FIREBASE_PROJECT_ID` | id do projeto no Firebase |
| `STORAGE_DRIVER` | `auto` (padrão), `firestore` (arquivos no banco), `firebase` (Cloud Storage) ou `local` |
| `FIREBASE_STORAGE_BUCKET` | bucket do Cloud Storage — **deixe vazio** para guardar no Firestore |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | caminho do JSON da conta de serviço |
| `FIREBASE_SERVICE_ACCOUNT` | alternativa: o JSON inteiro (ou em base64) numa variável — ideal em PaaS |
| `ADMIN_EMAILS` | allowlist de e-mails do painel (vazio = qualquer conta do Auth) |
| `ALLOW_DEV_AUTH` · `DEV_ADMIN_EMAIL` · `DEV_ADMIN_PASSWORD` | login de desenvolvimento — **`false` em produção** |
| `SLACK_BOT_TOKEN` · `SLACK_SIGNING_SECRET` · `SLACK_ADMIN_CHANNEL` | bot e canal de avisos |
| `FILE_SIGNING_SECRET` | assina as URLs de arquivo — troque por um valor aleatório |
| `ACCEPT_TOKEN_TTL_HOURS` | validade do link de assinatura (padrão 168 h) |
| `SIGNED_URL_TTL_MINUTES` | validade das URLs de PDF/assinatura (padrão 15 min) |
| `LOW_STOCK_THRESHOLD` | limite padrão de estoque baixo |

### `web/.env`

| Variável | Para que serve |
| --- | --- |
| `VITE_API_URL` | base da API (vazio em dev: o Vite faz proxy de `/api`) |
| `VITE_FIREBASE_API_KEY` · `VITE_FIREBASE_AUTH_DOMAIN` · `VITE_FIREBASE_PROJECT_ID` · `VITE_FIREBASE_APP_ID` | Firebase Auth do painel |

Sem as chaves do Firebase, a interface usa o login de desenvolvimento da API automaticamente.

---

## Plugando o bot do Slack

O módulo já está escrito (`server/src/slack/bolt.ts`) — falta só criar o app:

1. <https://api.slack.com/apps> → **Create New App › From scratch**.
2. **OAuth & Permissions › Bot Token Scopes**:
   `chat:write`, `chat:write.public`, `im:write`, `commands`, `app_mentions:read`.
3. **Install to Workspace** → copie o `xoxb-…` para `SLACK_BOT_TOKEN`.
4. **Basic Information › Signing Secret** → `SLACK_SIGNING_SECRET`.
5. Aponte os endpoints para o seu domínio público:

   | Recurso | URL |
   | --- | --- |
   | Event Subscriptions | `https://SEU-DOMINIO/api/slack/events` |
   | Interactivity & Shortcuts | `https://SEU-DOMINIO/api/slack/interactions` |
   | Slash Commands (`/almoxarifado`) | `https://SEU-DOMINIO/api/slack/commands` |

6. **Event Subscriptions › Subscribe to bot events**: `app_mention`.
7. Reinicie a API. O boot passa a mostrar `Slack .......... ativo` e
   `/api/health` responde `notifications.available: true`.

Já funciona hoje:

- DM com card do termo (itens + botão **Assinar termo**);
- a mensagem é **atualizada** para “Termo assinado ✅” quando o colaborador assina;
- aviso no canal do administrativo com botão de contra-assinar;
- `/almoxarifado estoque camisa`, `/almoxarifado entregas`, `/almoxarifado ajuda`;
- alerta automático de estoque baixo no canal do administrativo.

Sem as credenciais, `notifier` cai na implementação inerte e a interface mostra o link para copiar.
Trocar o Slack por e-mail/WhatsApp é implementar `NotificationChannel`
(`server/src/services/notifications/types.ts`) — nada nas regras de negócio muda.

---

## API

Rotas do painel exigem `Authorization: Bearer <ID token do Firebase>` (ou o token de dev).

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | status, driver de dados, Slack |
| `POST` | `/api/auth/dev-login` | sessão de desenvolvimento (desligável) |
| `GET`/`PUT` | `/api/auth/me` | perfil do representante + assinatura salva |
| `GET` | `/api/dashboard` | indicadores, fila de assinaturas, alertas, movimentações |
| `GET`/`POST` | `/api/materials` | catálogo (busca, filtro por categoria) |
| `GET`/`PUT`/`DELETE` | `/api/materials/:id` | detalhe, edição, desativação |
| `POST` | `/api/materials/:id/adjust` | movimento manual de estoque |
| `GET`/`POST` | `/api/employees` | colaboradores |
| `GET`/`PUT`/`DELETE` | `/api/employees/:id` | ficha com histórico de termos |
| `GET`/`POST` | `/api/deliveries` | fila de assinaturas / nova entrega |
| `GET` | `/api/deliveries/:id` | detalhe com URLs assinadas |
| `POST` | `/api/deliveries/:id/send` | envia (ou reenvia) o link |
| `POST` | `/api/deliveries/:id/countersign` | contra-assinatura da empresa |
| `POST` | `/api/deliveries/:id/return` | devolução → reentrada no estoque |
| `POST` | `/api/deliveries/:id/archive` | arquivamento |
| `GET` | `/api/deliveries/:id/pdf` | URL assinada do termo |
| `GET` | `/api/movements` | trilha de auditoria |
| `GET`/`PUT` | `/api/settings` | dados da empresa e limites |
| `GET` | `/api/public/deliveries/:token` | **público** — só o necessário para exibir o termo |
| `POST` | `/api/public/deliveries/:token/sign` | **público** — assinatura do colaborador |
| `GET` | `/api/files/*` | arquivo sensível com HMAC e expiração |

---

## Segurança e LGPD

- **Nenhum cliente fala com o Firestore.** `firestore.rules` e `storage.rules` negam tudo; todo
  acesso passa pela API com o Admin SDK.
- **Superfície pública mínima.** `/api/public/deliveries/:token` devolve apenas itens, dados da
  empresa e o pré-preenchimento do colaborador — nunca o documento inteiro, nunca outros termos.
- **Token de aceite**: 256 bits de `crypto.randomBytes`, com expiração e uso único (o status
  impede uma segunda assinatura). Rota pública com rate limit por IP.
- **CPF e assinaturas** são tratados como dados sensíveis: listagens usam CPF mascarado
  (`123.***.***-04`), o CPF é validado por dígito verificador e nunca aparece em log.
- **PDFs e assinaturas** só saem por **URL assinada com expiração** (15 min por padrão) — pela
  rota interna protegida com HMAC quando os arquivos estão no Firestore, ou por `getSignedUrl`
  quando estão no Cloud Storage. URL adulterada responde `403`.
- Guardados no Firestore, os arquivos herdam as regras do banco: `files` é negado ao cliente
  como qualquer outra coleção.
- **Evidências do aceite** (data/hora, IP, user-agent) e um **hash SHA-256** do conteúdo vão
  impressos no rodapé do PDF, dando rastreabilidade ao documento eletrônico.
- **`ADMIN_EMAILS`** restringe o painel a uma allowlist mesmo dentro do Firebase Auth.
- Em produção, **desligue `ALLOW_DEV_AUTH`** e troque `FILE_SIGNING_SECRET`.

---

## Design

Identidade construída sobre o monograma **AM** dourado do Grupo Alcina Maria.

- `tools/trace-monogram.mjs` **vetoriza o PNG oficial** (decodifica o PNG, extrai contornos por
  *crack following*, suaviza com Chaikin e simplifica com Douglas-Peucker) e gera três saídas: o
  SVG da marca, os contornos para a extrusão 3D e o `path` que o **pdf-lib desenha no cabeçalho do
  termo**. O logo da tela, do favicon e do PDF é literalmente o mesmo traço.
- **Hero WebGL**: o monograma extrudado em ouro (`MeshPhysicalMaterial` metálico com clearcoat),
  iluminado por um estúdio de `Lightformer`s construído em memória — sem baixar HDRI. Poeira
  dourada, profundidade de campo, bloom e aberração cromática sutis; reage ao mouse e ao
  giroscópio.
- **Microinterações**: cursor dourado com magnetismo, cartões com tilt 3D e reflexo que segue o
  ponteiro, contadores animados, transições de página com cortina dourada, skeletons com brilho.
- **Página do colaborador**: superfície clara, storytelling em scroll (os itens entram um a um),
  canvas de assinatura com **tinta dourada de espessura variável** conforme a velocidade do gesto,
  e uma celebração com selo 3D carimbando + confete dourado.
- **Performance e acessibilidade**: cenas 3D em `React.lazy` (quem só vai assinar não baixa o
  painel nem o Three.js à toa), fallback estático em SVG para aparelhos fracos, `prefers-reduced-motion`
  respeitado em toda a camada de animação, foco visível e mobile-first.

Paleta: dourado `#C9A050 → #E3C27E`, grafite `#0A0A0C`, off-white `#F6F3EC`, com um acento
`acqua` discreto. Tipografia: **Cormorant Garamond** (display) + **Manrope** (interface).

---

## Deploy no Render

A aplicação é **um serviço só**: o mesmo processo Node serve a API e o build do frontend, no
mesmo domínio — que é o que o link de aceite do colaborador exige. Não há serviço separado para
o front, nem blueprint.

### 1. Criar o serviço

No painel do Render: **New › Web Service** › conecte o repositório `almoxarifado`.

| Campo | Valor |
| --- | --- |
| Language | `Node` |
| Branch | `main` |
| Root Directory | *(vazio — a raiz do repositório)* |
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

> `--include=dev` é obrigatório: com `NODE_ENV=production` o npm pularia `typescript` e `vite`,
> e o build quebraria.

### 2. Variáveis de ambiente

Cole de uma vez em **Environment › Add from .env**:

```env
NODE_VERSION=22
NODE_ENV=production
ALLOW_DEV_AUTH=false

APP_BASE_URL=https://SEU-SERVICO.onrender.com
API_BASE_URL=https://SEU-SERVICO.onrender.com
CORS_ORIGINS=https://SEU-SERVICO.onrender.com

FIREBASE_PROJECT_ID=seu-projeto
FIREBASE_SERVICE_ACCOUNT=<JSON da conta de serviço em base64>
# Sem bucket, os PDFs e assinaturas ficam no Firestore (plano gratuito).
# Só preencha se tiver criado um bucket no Cloud Storage (exige plano Blaze):
# FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app

ADMIN_EMAILS=logisticavdpenedo@cpalcina.com
FILE_SIGNING_SECRET=<string aleatória longa>

# Firebase Auth do painel. ATENÇÃO: o Vite lê estas variáveis durante o BUILD,
# então elas precisam existir no Render antes do primeiro deploy — sem elas o
# painel sobe sem tela de login funcional.
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_APP_ID=1:000000000000:web:abcdef

ACCEPT_TOKEN_TTL_HOURS=168
SIGNED_URL_TTL_MINUTES=15
LOW_STOCK_THRESHOLD=5
```

As quatro variáveis `VITE_*` saem do Firebase: ⚙️ *Configurações do projeto* › *Geral* ›
**Seus apps** › app da Web (crie um com o ícone `</>` se ainda não existir). Como o Vite as
embute no pacote durante o build, **mudar qualquer uma delas exige um novo deploy** — não basta
reiniciar o serviço.

A URL definitiva só aparece depois do primeiro deploy: salve, copie a URL e volte para corrigir
`APP_BASE_URL`, `API_BASE_URL` e `CORS_ORIGINS`.

O Slack entra depois, quando o app existir (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`,
`SLACK_ADMIN_CHANNEL`) — sem ele a aplicação funciona com o link copiável.

### 3. Verificar

`https://SEU-SERVICO.onrender.com/api/health` deve responder:

```json
{ "ok": true, "dataDriver": "firestore", "storageDriver": "firestore", "devAuth": false }
```

Se `dataDriver` vier `"local"`, a credencial do Firebase não foi lida — o serviço estaria
gravando em disco efêmero, que o Render apaga a cada deploy.

### Checklist de produção

- [ ] `NODE_ENV=production` e `ALLOW_DEV_AUTH=false`
- [ ] `FILE_SIGNING_SECRET` aleatório
- [ ] conta de serviço do Firebase configurada e regras publicadas
- [ ] `CORS_ORIGINS` com o domínio real
- [ ] `ADMIN_EMAILS` com a equipe autorizada
- [ ] HTTPS (as evidências de IP dependem de `X-Forwarded-For` — `trust proxy` já está ligado)

> No plano gratuito o serviço hiberna após ~15 min sem acesso e a primeira requisição demora
> cerca de 1 minuto. Para um link que vai no Slack e é aberto na hora, vale o plano pago.

### Rodando localmente em modo produção

```bash
npm run build     # compila server/ e web/
npm start         # sobe a API — que também serve o build do frontend
```

---

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API (`:4000`) + interface (`:5173`) juntas |
| `npm run dev:server` / `npm run dev:web` | cada uma isolada |
| `npm run build` | build de produção dos dois pacotes |
| `npm start` | roda a API compilada (servindo o frontend) |
| `npm run seed` | materiais e colaboradores de exemplo (`-- --force` recria) |
| `npm run typecheck` | TypeScript nos dois pacotes |
| `npm run trace:monogram` | regenera SVG/geometria do monograma a partir do PNG |

---

<p align="center">
  <strong>Grupo Alcina Maria</strong> · CNPJ 14.750.618/0001-83 · Penedo, Alagoas — BR
</p>

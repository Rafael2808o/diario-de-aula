<p align="center">
  <img src="Web/public/icons/icon-192.png" width="104" alt="Ícone do estuda." />
</p>

# estuda. — Diário de Aula

**Transforme cada aula em um registro útil, cada dúvida em uma revisão e cada semana em progresso visível.**

O estuda. é uma plataforma acadêmica completa para organizar o semestre. O produto reúne diário de aula, planejamento, biblioteca, desempenho, revisão por inteligência artificial e foco com Spotify em uma experiência própria, instalável e adaptada a computador, tablet, Android e iPhone.

## Teste o projeto

**[Abrir o estuda. no navegador](https://diario-de-aula-web.vercel.app/)**

- **iPhone e iPad:** abra o site no Safari, toque em **Compartilhar** e selecione **Adicionar à Tela de Início**.
- **Android:** instale a PWA pelo navegador ou baixe o [APK Android v1.2.2](https://github.com/Rafael2808o/diario-de-aula/releases/download/v1.2.2/estuda-v1.2.2.apk).
- **Computador e tablet:** use diretamente no navegador ou escolha **Instalar aplicativo** quando essa opção aparecer.
- **API e Swagger:** consulte a [documentação interativa](https://diario-de-aula-api.onrender.com/docs/).

A PWA instalada não expira e abre em uma janela própria, como um aplicativo. O projeto iOS nativo também possui um [build de simulador v1.2.2](https://github.com/Rafael2808o/diario-de-aula/releases/download/v1.2.2/estuda-ios-simulator-v1.2.2.tar.gz); a distribuição nativa via TestFlight ou App Store depende apenas de uma assinatura Apple Developer.

O APK publicado possui SHA-256 `2876412A2FAD3350656EB1FC5656C032A65DAF2A07A2C9752D546F6A0125D97C`. Todos os arquivos permanentes da versão estão na [release v1.2.2](https://github.com/Rafael2808o/diario-de-aula/releases/tag/v1.2.2).

## O que está implementado

- cadastro, login e sessão individual;
- perfil editável com curso, instituição e semestre;
- planejamento de estudos sincronizado e conclusão de tarefas;
- diário persistente com planejado, realizado, aprendizados, dúvidas, avisos e referências;
- revisão com IA e questões originais geradas pelo Gemini;
- alternativas corrigidas na hora e explicações didáticas;
- falha honesta e opção de nova tentativa quando o provedor de IA estiver indisponível;
- biblioteca pessoal pesquisável, com criação, abertura e remoção de materiais;
- painel de desempenho baseado somente nos registros reais da conta;
- player Spotify persistente durante a navegação;
- suporte a qualquer link público de playlist, álbum, episódio ou faixa do Spotify;
- modo Spotify Premium preparado com PKCE, reprodução completa, controles e volume onde a plataforma permite;
- PWA com manifesto, service worker, cache da interface e atalhos;
- navegação inferior própria para celular;
- layouts de uma, duas e três colunas para celular, tablet e computador;
- APK Expo conectado à mesma plataforma e aos mesmos dados;
- API REST protegida por token, rate limit de IA e Swagger;
- PostgreSQL em produção e armazenamento em memória para desenvolvimento rápido.

## Princípios do produto

- **Continuidade:** o registro da aula alimenta planejamento, recomendações e revisão.
- **Clareza:** cada tela apresenta uma tarefa principal e reduz ruído visual.
- **Identidade:** formas editoriais, papel contínuo e progresso compõem uma marca própria.
- **Portabilidade:** a mesma conta funciona no navegador, na PWA e no aplicativo móvel.
- **Resiliência:** a pessoa continua estudando mesmo quando o provedor de IA oscila.
- **Privacidade:** senhas usam scrypt, tokens são persistidos apenas como hash e segredos ficam fora do Git.

## Arquitetura

```text
Diario de Aula/
├── Api/                 API Node.js, Express, PostgreSQL e Swagger
│   ├── app.js            Rotas, validação, IA e integrações
│   ├── store.js          Contas, sessões, planejamento e diário
│   └── test/             Testes integrados da jornada autenticada
├── Web/                 Aplicação React, Vite e PWA
│   ├── public/           Manifesto, service worker e identidade visual
│   └── src/              Interface e estilos responsivos
├── Mobile/              Aplicativo Expo para Android e iOS
├── DEPLOY.md            Operação e publicação
└── render.yaml          Site, API e banco no Render
```

| Camada | Tecnologias |
| --- | --- |
| Site/PWA | React 19, Vite, Lucide e Service Worker |
| Aplicativo | Expo, React Native e React Native WebView |
| API | Node.js, Express e Swagger/OpenAPI |
| Banco | PostgreSQL com fallback local em memória |
| IA | Google Gemini com saída estruturada |
| Música | Spotify Embed e Web Playback SDK com OAuth PKCE |
| Produção | Render, Expo EAS e GitHub |

## Desenvolvimento local

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev:api
npm run dev:web
```

- Site: `http://localhost:5173`
- API: `http://localhost:3333/api/v1`
- Swagger: `http://localhost:3333/docs`

Copie `Api/.env.example` para `Api/.env` e mantenha as credenciais reais somente no arquivo ignorado pelo Git.

### Aplicativo móvel

```bash
cd Mobile
npm install
npm start
```

Para gerar um APK instalável:

```bash
npx eas-cli@latest build --platform android --profile preview
```

O perfil `ios-simulator` valida o pacote iOS sem assinatura de distribuição:

```bash
npx eas-cli@latest build --platform ios --profile ios-simulator
```

## Endpoints principais

| Área | Endpoints |
| --- | --- |
| Saúde | `GET /health/ready` |
| Conta | `POST /api/v1/auth/register`, `POST /api/v1/auth/login` |
| Perfil | `GET /api/v1/me`, `PATCH /api/v1/me` |
| Estudos | `GET/POST /api/v1/study-plans`, `DELETE /api/v1/study-plans/:id` |
| Diário | `GET/PUT /api/v1/diaries` |
| Conteúdo | `GET/POST /api/v1/materials`, `DELETE /api/v1/materials/:id` |
| OpenAPI | `GET /api/v1/openapi.json`, interface em `/docs/` |
| IA | `GET /api/v1/ai/status`, `POST /api/v1/ai/questions` |
| Spotify | `GET /api/v1/integrations/spotify/status` |

## Qualidade

```bash
npm test
npm run build
cd Mobile
npx expo-doctor
npx expo export --platform android
npx expo export --platform ios
```

Os testes cobrem recursos públicos, proteção sem autenticação e a jornada completa de cadastro, perfil, planejamento, diário, consulta e conclusão. A verificação de interface percorre ainda os fluxos em 390 px, 768 px e 1440 px.

## Segurança e operação

- senhas derivadas com `scrypt` e salt individual;
- tokens aleatórios de 256 bits, armazenados no banco somente como SHA-256;
- sessões com expiração;
- consultas SQL parametrizadas;
- isolamento dos dados pelo identificador da conta;
- limite por usuário para geração com IA;
- entrada textual limitada e normalizada;
- CORS restrito às origens configuradas;
- chave Gemini e conexão PostgreSQL fora do repositório.

O banco gratuito do Render é adequado para avaliação e demonstração, mas possui limitações de retenção do próprio provedor. Antes de uma abertura comercial nacional, migre a mesma `DATABASE_URL` para um plano persistente ou PostgreSQL gerenciado de longo prazo.

## Estado do projeto

A branch `main` é a fonte de publicação. O site/PWA é publicado na Vercel e a API com PostgreSQL roda no Render. A PWA atende iPhone, iPad, Android e computadores sem assinatura de loja; o APK Android é gerado pelo Expo EAS.

## Contribuição

1. Crie uma branch a partir de `main`.
2. Faça alterações pequenas e objetivas.
3. Execute testes, build web e Expo Doctor.
4. Não envie `.env`, chaves, tokens, bancos ou builds locais.
5. Descreva como a mudança foi validada.

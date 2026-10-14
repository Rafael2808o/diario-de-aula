# Lúmina

**Você registra o semestre. O Lúmina organiza seus estudos.**

O Lúmina (antes Estuda) é um assistente pessoal de estudos para universitários. Durante o semestre, o estudante registra cada aula, guarda os avisos dos professores e cadastra provas, trabalhos e materiais. Quando a prova chega, o Lúmina reúne tudo: o que foi confirmado, em quais aulas cada assunto apareceu, o que ainda falta e quanto tempo sobra. Cada conta começa vazia; nada é inventado para preencher a tela.

A especificação completa está em [docs/lumina-prompt.md](docs/lumina-prompt.md) e o andamento por fase em [docs/lumina-plano.md](docs/lumina-plano.md).

## Teste o projeto

**[Abrir o Lúmina](https://diario-de-aula-web.vercel.app/)**

- **iPhone e iPad:** abra o site no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.
- **Android:** instale a PWA pelo navegador ou baixe o [APK da versão 1.4.0](https://github.com/Rafael2808o/diario-de-aula/releases/download/v1.4.0/lumina-v1.4.0.apk).
- **Computador e tablet:** use no navegador ou instale a PWA quando a opção estiver disponível.
- **API:** consulte e teste os endpoints pelo [Swagger](https://diario-de-aula-api.onrender.com/docs/).

A PWA não depende de assinatura de loja e permanece disponível enquanto a publicação estiver ativa. A primeira resposta da API pode levar alguns segundos porque o serviço gratuito do Render entra em repouso quando fica sem uso.

O APK Android está na [release v1.4.0](https://github.com/Rafael2808o/diario-de-aula/releases/tag/v1.4.0). Versões anteriores continuam na página de releases.

## Principais recursos

- conta com confirmação de senha, recuperação por e-mail, saída que encerra a sessão e exclusão da conta com todos os dados;
- configuração inicial em quatro etapas, todas opcionais: perfil acadêmico, disciplinas, rotina e aparência;
- disciplinas com cor, professor, período e vários horários por semana, que viram aulas no calendário;
- calendário mensal, semanal, diário e em lista, com filtros por disciplina e tipo;
- Dias de aula: registro rápido ou completo, presença, falta com conteúdo perdido, cancelamento, rascunho e domínio de 1 a 5;
- provas com assuntos, progresso por tópico, aulas relacionadas, orientações do professor, simulados e revisão final;
- “Preparar-me para esta prova” e plano de estudos calculado até a véspera, salvo no calendário;
- cofre do professor separando o que foi confirmado, hipóteses pessoais e sugestões da IA;
- materiais com link ou arquivo (PDF, foto, áudio, documento, até 3 MB);
- Estudar com IA: Socorro tenho prova, simulado, resumo, flashcards com revisão, explicação e gravação/transcrição de aula, sempre citando as fontes;
- histórico de aprendizagem com indicadores que abrem os registros de origem;
- busca geral sem acento, avisos no Início e notificações do aparelho;
- exportação em CSV, JSON e PDF; modo claro e escuro; mascote Nox;
- PWA instalável (inclusive no iPhone), APK Android e API documentada com Swagger.

## Princípios do produto

- **Dados reais:** nenhuma disciplina, nota, prova ou pendência é inventada para preencher a interface.
- **Continuidade:** registros do diário alimentam planejamento, revisão e desempenho.
- **Autonomia:** o usuário decide como estruturar seu semestre e o que deseja acompanhar.
- **Clareza:** estados vazios orientam o próximo passo sem simular atividade inexistente.
- **Portabilidade:** a mesma conta funciona no site, na PWA e no aplicativo móvel.
- **Transparência:** integrações e recursos externos informam suas limitações em vez de esconder falhas.

## Arquitetura

```text
Diario de Aula/
├── Api/                 API, autenticação, dados e integrações
│   ├── app.js            Rotas, validações, Swagger, IA e Spotify
│   ├── entities.js       Aulas, provas, atividades, eventos, cofre, materiais, flashcards e simulados
│   ├── files.js          Arquivos dos materiais e links de download de uso único
│   ├── ai.js             Resumo, flashcards, explicação e transcrição com Gemini
│   ├── store.js          Contas, sessões, disciplinas e dados legados
│   └── test/             Testes integrados da API
├── Web/                 Site responsivo e PWA
│   ├── public/           Manifesto, service worker e ícones
│   └── src/              Páginas, componentes, Nox e lógica de datas
├── Mobile/              Aplicativo Expo para Android e iOS
├── docs/                Especificação e plano do Lúmina
├── DEPLOY.md            Guia de publicação e operação
└── render.yaml          Infraestrutura da API no Render
```

### Tecnologias principais

| Camada | Tecnologias |
| --- | --- |
| Site e PWA | React 19, Vite, Lucide e Service Worker |
| Aplicativo | Expo, React Native e React Native WebView |
| API | Node.js, Express e Swagger/OpenAPI |
| Dados | PostgreSQL em produção e armazenamento em memória no desenvolvimento |
| Inteligência artificial | Google Gemini com resposta estruturada |
| Música | Spotify Embed e suporte preparado para Web Playback SDK com OAuth PKCE |
| Publicação | Vercel, Render, Expo EAS e GitHub Releases |

## Comece localmente

### Requisitos

- Node.js 20 ou superior;
- npm;
- uma chave do Gemini para testar a geração de questões.

### Instalação

```bash
git clone https://github.com/Rafael2808o/diario-de-aula.git
cd diario-de-aula
npm install
```

Copie `Api/.env.example` para `Api/.env` e preencha apenas as credenciais necessárias. O arquivo real é ignorado pelo Git.

Execute a API e o site em terminais separados:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

| Serviço | Endereço local |
| --- | --- |
| Site | `http://localhost:5173` |
| API | `http://localhost:3333/api/v1` |
| Swagger | `http://localhost:3333/docs/` |

### Aplicativo móvel

```bash
cd Mobile
npm install
npm start
```

Para solicitar um APK instalável pelo Expo EAS:

```bash
npx eas-cli@latest build --platform android --profile preview
```

O perfil `ios-simulator` gera um pacote para o simulador. A instalação nativa em iPhones reais por TestFlight ou App Store exige uma conta Apple Developer; no iPhone, a alternativa gratuita e duradoura é instalar a PWA pelo Safari.

## Configuração de produção

| Componente | Publicação |
| --- | --- |
| Site/PWA | [Vercel](https://diario-de-aula-web.vercel.app/) |
| API e Swagger | [Render](https://diario-de-aula-api.onrender.com/docs/) |
| Aplicativos | [GitHub Releases](https://github.com/Rafael2808o/diario-de-aula/releases/tag/v1.4.0) e Expo EAS |

As variáveis de produção estão descritas em `Api/.env.example` e no [guia de deploy](DEPLOY.md). Chaves, tokens e conexões reais não devem ser versionados.

O banco gratuito do Render é apropriado para demonstração e avaliação, mas tem limites de retenção definidos pelo provedor. Um uso comercial de longo prazo deve utilizar PostgreSQL persistente. Reprodução integral e controles avançados do Spotify também dependem de conta Premium e credenciais de um aplicativo no Spotify Developer; sem isso, o produto utiliza o player oficial incorporado.

## Endpoints principais

| Área | Endpoints |
| --- | --- |
| Saúde | `GET /health/ready` |
| Conta | `POST /api/v1/auth/register`, `login`, `logout`, `forgot-password`, `reset-password` |
| Perfil | `GET /api/v1/me`, `PATCH /api/v1/me`, `DELETE /api/v1/me` |
| Disciplinas | `GET/POST /api/v1/subjects`, `PUT/DELETE /api/v1/subjects/:id`, `PUT /api/v1/subjects/order` |
| Registros | `GET/POST /api/v1/{lessons,exams,tasks,events,teacher-notes,materials,flashcards,quiz-results}` e `GET/PATCH/DELETE …/:id` |
| Arquivos | `GET/POST /api/v1/files`, `GET/DELETE /api/v1/files/:id`, `POST /api/v1/files/:id/ticket`, `GET /api/v1/files/download/:ticket` |
| Legado | `/api/v1/study-plans` e `/api/v1/diaries`, mantidos para os dados da versão anterior |
| Inteligência artificial | `GET /api/v1/ai/status`; `POST /api/v1/ai/questions`, `/ai/study` e `/ai/transcribe` respondem 202 com `jobId`; `GET /api/v1/ai/jobs/:id` traz o resultado |
| Spotify | `GET /api/v1/integrations/spotify/status` |
| OpenAPI | `GET /api/v1/openapi.json` e interface em `/docs/` |

## Qualidade

```bash
npm test
npm run build
cd Mobile
npx expo-doctor
npx expo export --platform android
npx expo export --platform ios
```

Os testes da API cobrem cadastro, perfil, disciplinas com horários, aulas, provas, atividades, cofre, materiais, exclusões em cascata, isolamento entre contas, logout e redefinição de senha. Eles rodam em memória e também com `DATABASE_URL` apontando para um PostgreSQL.

## Segurança e privacidade

- senhas derivadas com `scrypt` e salt individual;
- tokens de sessão aleatórios, persistidos no banco somente como hash SHA-256;
- sessões com expiração e isolamento dos dados por conta;
- consultas SQL parametrizadas;
- limites de entrada e de requisições à IA;
- CORS restrito às origens configuradas;
- credenciais do Gemini, Spotify, Resend e PostgreSQL fora do repositório;
- redefinição de senha com token de uso único, válido por 1 hora, que encerra todas as sessões;
- registros ligados a outros (aula, prova, disciplina) só aceitam referências da própria conta.

## Estado do projeto

A branch `main` é a fonte das publicações atuais. O site e a PWA estão na Vercel, enquanto a API e o PostgreSQL rodam no Render. O APK Android está disponível para instalação direta; no ecossistema Apple, a PWA é a distribuição gratuita para aparelhos reais e o pacote nativo publicado destina-se ao simulador.

## Contribuição

1. Crie uma branch a partir de `main`.
2. Faça alterações pequenas e com objetivo claro.
3. Execute os testes, o build web e o Expo Doctor.
4. Não envie arquivos `.env`, chaves, tokens, bancos ou builds locais.
5. Explique no pull request como a mudança foi validada.

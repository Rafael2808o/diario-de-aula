# Estuda

**Organize o que aconteceu em aula, transforme dúvidas em revisão e acompanhe seu progresso com dados reais.**

O Estuda é um espaço acadêmico pessoal para registrar aulas, planejar estudos, reunir materiais e criar revisões com inteligência artificial. Cada conta começa vazia: disciplinas, atividades, avaliações, notas e indicadores aparecem somente depois que o próprio usuário registra suas informações.

## Teste o projeto

**[Abrir o Estuda](https://diario-de-aula-web.vercel.app/)**

- **iPhone e iPad:** abra o site no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.
- **Android:** instale a PWA pelo navegador ou baixe o [APK da versão 1.2.2](https://github.com/Rafael2808o/diario-de-aula/releases/download/v1.2.2/estuda-v1.2.2.apk).
- **Computador e tablet:** use no navegador ou instale a PWA quando a opção estiver disponível.
- **API:** consulte e teste os endpoints pelo [Swagger](https://diario-de-aula-api.onrender.com/docs/).

A PWA não depende de assinatura de loja e permanece disponível enquanto a publicação estiver ativa. A primeira resposta da API pode levar alguns segundos porque o serviço gratuito do Render entra em repouso quando fica sem uso.

Os artefatos publicados, incluindo APK Android e build para simulador iOS, estão na [release v1.2.2](https://github.com/Rafael2808o/diario-de-aula/releases/tag/v1.2.2).

## Principais recursos

- cadastro, login e sessão individual;
- perfil acadêmico editável, sem curso, semestre ou instituição predefinidos;
- disciplinas, estudos, avaliações e tarefas criados pelo usuário;
- diário de aula com conteúdo realizado, aprendizados, dúvidas, avisos e referências;
- biblioteca pessoal pesquisável para materiais e links;
- questões geradas pelo Gemini a partir da matéria informada pelo usuário;
- correção de alternativas com explicações e nova tentativa quando a IA estiver indisponível;
- indicadores de desempenho calculados somente com informações reais da conta;
- player do Spotify persistente durante a navegação;
- suporte a links públicos de faixas, álbuns, playlists e episódios;
- interface responsiva para celular, tablet e computador;
- PWA instalável no iPhone, iPad, Android e desktop;
- aplicativo Expo para Android e iOS conectado à mesma plataforma;
- API REST documentada com Swagger e banco PostgreSQL em produção.

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
│   ├── store.js          Contas, sessões e persistência acadêmica
│   └── test/             Testes integrados da API
├── Web/                 Site responsivo e PWA
│   ├── public/           Manifesto, service worker e ícones
│   └── src/              Interface, navegação e estado da aplicação
├── Mobile/              Aplicativo Expo para Android e iOS
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
| Aplicativos | [GitHub Releases](https://github.com/Rafael2808o/diario-de-aula/releases/tag/v1.2.2) e Expo EAS |

As variáveis de produção estão descritas em `Api/.env.example` e no [guia de deploy](DEPLOY.md). Chaves, tokens e conexões reais não devem ser versionados.

O banco gratuito do Render é apropriado para demonstração e avaliação, mas tem limites de retenção definidos pelo provedor. Um uso comercial de longo prazo deve utilizar PostgreSQL persistente. Reprodução integral e controles avançados do Spotify também dependem de conta Premium e credenciais de um aplicativo no Spotify Developer; sem isso, o produto utiliza o player oficial incorporado.

## Endpoints principais

| Área | Endpoints |
| --- | --- |
| Saúde | `GET /health/ready` |
| Conta | `POST /api/v1/auth/register`, `POST /api/v1/auth/login` |
| Perfil | `GET /api/v1/me`, `PATCH /api/v1/me` |
| Estudos | `GET/POST /api/v1/study-plans`, `DELETE /api/v1/study-plans/:id` |
| Diário | `GET/PUT /api/v1/diaries` |
| Biblioteca | `GET/POST /api/v1/materials`, `DELETE /api/v1/materials/:id` |
| Inteligência artificial | `GET /api/v1/ai/status`, `POST /api/v1/ai/questions` |
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

A jornada autenticada da API possui testes para cadastro, perfil, planejamento, diário, consulta e conclusão. A interface foi verificada em larguras de 390 px, 768 px e 1440 px, incluindo navegação, estados vazios, acessibilidade, ausência de rolagem horizontal e geração de questões em produção.

## Segurança e privacidade

- senhas derivadas com `scrypt` e salt individual;
- tokens de sessão aleatórios, persistidos no banco somente como hash SHA-256;
- sessões com expiração e isolamento dos dados por conta;
- consultas SQL parametrizadas;
- limites de entrada e de requisições à IA;
- CORS restrito às origens configuradas;
- credenciais do Gemini, Spotify e PostgreSQL fora do repositório.

## Estado do projeto

A branch `main` é a fonte das publicações atuais. O site e a PWA estão na Vercel, enquanto a API e o PostgreSQL rodam no Render. O APK Android está disponível para instalação direta; no ecossistema Apple, a PWA é a distribuição gratuita para aparelhos reais e o pacote nativo publicado destina-se ao simulador.

## Contribuição

1. Crie uma branch a partir de `main`.
2. Faça alterações pequenas e com objetivo claro.
3. Execute os testes, o build web e o Expo Doctor.
4. Não envie arquivos `.env`, chaves, tokens, bancos ou builds locais.
5. Explique no pull request como a mudança foi validada.

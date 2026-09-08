# Publicação do estuda.

Este documento registra a operação das quatro entregas: PWA, API, banco PostgreSQL e aplicativo Expo.

## Endereços de produção

| Entrega | Endereço |
| --- | --- |
| Site e PWA | https://diario-de-aula-web.vercel.app/ |
| API | https://diario-de-aula-api.onrender.com/ |
| Swagger | https://diario-de-aula-api.onrender.com/docs/ |
| Projeto Expo | https://expo.dev/accounts/docvia-app/projects/diario-de-aula |

## Render

O `render.yaml` declara:

- site estático React/Vite;
- API Node.js;
- PostgreSQL;
- conexão automática da `DATABASE_URL`;
- configuração do provedor e modelo Gemini.

Variáveis marcadas como `sync: false` devem permanecer configuradas no painel:

```env
VITE_API_URL=https://diario-de-aula-api.onrender.com/api/v1
CORS_ORIGINS=https://diario-de-aula-web.onrender.com
GEMINI_API_KEY=definida-no-painel
```

Nunca copie o valor real de `GEMINI_API_KEY` para Git, README, logs ou imagens.

## Instalação da PWA

### iPhone e iPad

1. Abra a URL pública no Safari.
2. Toque no ícone de compartilhar.
3. Escolha **Adicionar à Tela de Início**.
4. Confirme **Adicionar**.

O ícone abre em modo independente e não possui o limite de sete dias de um IPA assinado gratuitamente.

### Android

1. Abra a URL pública no Chrome.
2. Use o aviso **Instalar estuda.** ou o menu do navegador.
3. Confirme a instalação.

### Computador

Chrome e Edge exibem o botão de instalação na barra de endereço quando os critérios da PWA são atendidos.

## APK Android

O perfil `preview` produz um APK assinado para instalação direta:

```powershell
cd Mobile
npx eas-cli@latest build --platform android --profile preview
```

O arquivo pode ser hospedado em uma GitHub Release para obter um link estável. O perfil `production` produz um AAB destinado à Google Play.

## iOS

O código e o perfil de simulador podem ser validados sem assinatura de loja:

```powershell
cd Mobile
npx eas-cli@latest build --platform ios --profile ios-simulator
```

TestFlight, App Store e um IPA distribuído profissionalmente exigem Apple Developer. Até essa assinatura existir, a PWA é a entrega gratuita, estável e instalável para iPhone.

## Verificações antes de publicar

```powershell
npm test
npm run build
cd Mobile
npx expo-doctor
npx expo export --platform android
npx expo export --platform ios
```

Depois do deploy:

1. verifique `/health/ready` e confirme `persistence: postgresql`;
2. crie uma conta;
3. recarregue e confirme a sessão;
4. adicione e conclua um planejamento;
5. salve um diário e recarregue;
6. gere questões e confirme `source: gemini`;
7. abra a playlist Spotify;
8. teste 390 px, 768 px e 1440 px;
9. confirme manifesto, service worker e ícones.

## Limite do plano gratuito

A PWA não expira. O serviço gratuito do Render pode adormecer e levar alguns segundos para responder no primeiro acesso. O PostgreSQL gratuito possui regras próprias de retenção; antes de uso comercial, migre a `DATABASE_URL` para um banco persistente de longo prazo.

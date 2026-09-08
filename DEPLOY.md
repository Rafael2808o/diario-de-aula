# Publicação do Diário de Aula

O projeto está pronto para ser conectado a três serviços:

1. **GitHub** — hospeda o código e permite atualizações automáticas.
2. **Render** — publica o site e a API por meio do arquivo `render.yaml`.
3. **Expo** — gera o APK Android a partir da pasta `Mobile`.

## 1. GitHub

Crie um repositório vazio no GitHub chamado `diario-de-aula`, sem README ou `.gitignore`. Depois, na pasta do projeto, conecte e envie o código:

```powershell
git remote add origin https://github.com/SEU_USUARIO/diario-de-aula.git
git branch -M main
git add .
git commit -m "feat: plataforma Diário de Aula"
git push -u origin main
```

## 2. Render

No painel do Render, selecione **New > Blueprint**, escolha o repositório e confirme o arquivo `render.yaml`.

Ele criará dois serviços:

- `diario-de-aula-api`: API e documentação Swagger em `/docs`.
- `diario-de-aula-web`: site estático.

Após a criação, copie a URL da API e configure no serviço web:

```
VITE_API_URL=https://SUA_API.onrender.com/api/v1
```

Depois, copie a URL do site e configure no serviço da API:

```
CORS_ORIGINS=https://SEU_SITE.onrender.com
```

Faça um novo deploy de ambos os serviços. O Swagger ficará disponível em:

```
https://SUA_API.onrender.com/docs
```

## 3. APK Android

Instale o Expo Go no celular para testes ou entre na conta Expo e execute:

```powershell
cd Mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

O perfil `preview` em `Mobile/eas.json` produz um APK instalável. Ao finalizar, a Expo mostrará o link de download.

# Grimiau — plano de execução (28/10/2026)

Especificação: prompt mestre "Grimiau" enviado pelo Rafael em 28/10/2026. Evolução do Lúmina; nada de dados é apagado.

## Proteção de dados
- [x] Backup JSON completo do Neon: `D:\Codes\_backups_grimiau\neon-20261028-1102.json` (users 3, subjects 10, lessons 12, exams 3, materials 7, study_files 6, teacher_notes 3, tasks 1, sessions 11, ai_jobs 1).
- [x] Branch de backup no Neon: `backup-pre-grimiau-20261028` (br-muddy-math-aruwwpqo).
- [x] Migrações testadas num branch descartável do Neon antes do deploy.
- [x] Depois do deploy: contagens iguais ao backup, token antigo continua válido, login novo funciona.

## API (um único deploy no Render)
- [x] `initEntities`: cria todas as tabelas antes dos ALTER (permite referência de aulas para provas).
- [x] Aulas: `examId` opcional (vínculo manual com uma prova).
- [x] Flashcards: nível `dúvida`.
- [x] Entidade `study-sessions` com chave do cliente única (evita salvar duas vezes).
- [x] Preferências: signo, link do Spotify, último comunicado lido (lista branca estendida, mantendo o que já existe).
- [x] Foto de perfil em tabela própria (`user_avatars`), fora do `SELECT u.*`.
- [x] Comunidade: `community_posts` e `community_comments`; só nome público; editar/excluir só o autor.
- [x] Horóscopo: fonte horoscope-app-api (data do dia), tradução/resumo pelo Gemini, cache por signo + data de São Paulo.

## Web
- [x] Identidade Grimiau: paleta, Cinzel + Inter, Nox recolorido, logo com livro e lua.
- [x] Boas-vindas com "Criar conta" e "Fazer login".
- [x] Navegação com nomes da marca (ids de rota antigos mantidos).
- [x] Observatório (Início) reorganizado.
- [x] Conteúdos das aulas na prova (por referência; automático + vínculo manual).
- [x] Aulas que precisam de conteúdo.
- [x] Acompanhamento de transcrição global e retomável.
- [x] Horóscopo, comunicados, comunidade, foto de perfil.
- [x] Cartas do Saber (flashcards) com virar, navegar, progresso, classificar, embaralhar.
- [x] Ritual de Concentração: cronômetro por carimbos de tempo, frases, Spotify, minimizar/fechar/reabrir independentes.

## Limitações conhecidas
- Cinzel não tem itálico no Google Fonts: frases decorativas usam Cormorant Garamond Italic.
- APK (WebView) recebe o novo visual sozinho; nome e ícone do app só mudam com novo build.
- Recuperação de senha depende de RESEND_API_KEY (não configurado).

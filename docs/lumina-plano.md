# Lúmina — plano de evolução

Este documento registra como a especificação do **Lúmina** (resumo em `lumina-prompt.md`) está sendo aplicada sobre o app existente (Estuda). A especificação pede para aproveitar o que já funciona, então o Lúmina é uma evolução deste repositório, não um projeto novo.

## Decisões de arquitetura

| Decisão | Motivo |
| --- | --- |
| Manter React/Vite, Express, PostgreSQL e Expo WebView em vez de Next.js/Supabase. | A especificação permite adaptar a stack. A atual já tem autenticação, deploy, PWA e testes funcionando. |
| Disciplinas viram entidade própria (`subjects`), com cor, professor, período e vários horários semanais em JSON. | Cor consistente e agenda gerada a partir da grade. Os horários sempre são lidos com a disciplina. |
| Ocorrências de aula são calculadas no navegador a partir da grade e do período; só o registro (`lessons`) é gravado, com chave única disciplina + data + horário. | Mudar a grade reflete na agenda sem migrar dados. Faltas e cancelamentos não removem a aula da grade. |
| Aulas, provas, atividades, eventos, cofre e materiais usam uma camada genérica (`Api/entities.js`) que gera tabela, validação, consultas, rotas e Swagger a partir de uma configuração. | Menos código repetido; nova entidade = nova configuração. |
| Chaves estrangeiras com `ON DELETE CASCADE` (aulas, provas, cofre ao excluir disciplina) ou `SET NULL` (atividades, eventos, materiais). Toda referência é validada contra a conta do usuário. | Sem registros órfãos e sem vínculo entre contas. |
| Tópicos da prova ficam em JSON dentro da prova (título + status). "Aulas relacionadas" são encontradas por texto. | Suficiente para a Fase 1. A tabela própria de tópicos com vínculo N:N fica para a Fase 2. |
| Recuperação de senha por token de uso único (hash SHA-256, 1 hora) enviado pelo Resend. A troca encerra todas as sessões. | Sem serviço de e-mail configurado, a rota informa a indisponibilidade em produção. |
| Aparência (tema e cor de destaque) é preferência do aparelho, em `localStorage`. | Aplicada antes da primeira pintura para não piscar. |
| Lembretes aparecem dentro do Início. Não há notificação push nem e-mail. | A especificação proíbe simular notificações não implementadas. |
| Materiais guardam links; não há envio de arquivos. | Falta um armazenamento de arquivos (Storage). A interface diz isso ao usuário. |
| Diário e planos de estudo antigos continuam na API e aparecem na busca, na disciplina com o mesmo nome e no calendário. | Nenhum dado de quem já usava o Estuda é perdido. |

## Fase 1 — MVP funcional (entregue)

- [x] Cadastro com confirmação de senha, login, logout no servidor, recuperação de senha.
- [x] Onboarding em 4 etapas com barra de progresso, tudo opcional, boas-vindas personalizada.
- [x] Disciplinas com cor, professor, vários horários, sala e período; editar, excluir e reordenar.
- [x] Início: saudação, avisos, "Você teve aula hoje?", rotina do dia, próximos 7 dias, avaliações com contagem regressiva, entregas com conclusão, progresso, atalhos e "Socorro, tenho prova!".
- [x] Calendário mensal, semanal, diário e lista; filtros por disciplina e tipo; criar, editar e excluir com confirmação; aulas geradas dentro do período letivo; fuso America/Sao_Paulo.
- [x] Dias de aula: calendário de ocorrências, registro rápido/completo, presença, falta com conteúdo perdido e recuperação, cancelamento, rascunho, domínio 1–5, aulas fora da grade.
- [x] Provas: lista futuras/concluídas/todas, detalhe com informações, assuntos e progresso, aulas relacionadas, orientações do professor, materiais, revisão final e trilha "Preparar-me para esta prova".
- [x] Conteúdos: cards por disciplina e página com visão geral, aulas (busca e filtro), temas, provas, atividades, materiais e cofre.
- [x] Cofre do professor com categoria e origem (professor, hipótese, IA).
- [x] Busca geral sem acento, com filtros por tipo e disciplina, levando ao registro de origem.
- [x] Configurações: dados pessoais, perfil acadêmico, disciplinas, rotina, lembretes, aparência, exportação CSV/JSON/PDF, segurança.
- [x] Identidade Lúmina: paleta gelo/azul/lavanda, modo claro e escuro, mascote Nox, ícones novos, navegação lateral e inferior.

## Fase 2 — Preparação para provas (entregue)

- [x] Plano de estudos calculado até a véspera, com revisão final e aviso quando o tempo não cobre tudo.
- [x] Flashcards (manuais ou sugeridos pela IA) com revisão fácil/difícil e repetição dos difíceis.
- [x] Simulados salvos com erros, que entram na revisão final da prova e no histórico.
- [x] Histórico de aprendizagem com indicadores que abrem os registros de origem.
- [x] Notificações do aparelho enquanto o Lúmina está aberto (navegador e PWA).
- [ ] Tabela de tópicos com vínculo N:N entre aulas e provas (hoje a relação é por texto).
- [ ] Push com o app fechado e lembretes por e-mail (exigem VAPID/serviço de e-mail configurados).

## Fase 3 — Inteligência artificial (entregue em parte)

- [x] Resumos com três profundidades, explicações com perguntas de verificação, questões e flashcards, sempre citando as fontes.
- [x] Gravação ou importação de áudio (até 3 MB), transcrição com trechos incertos marcados e resumo, guardados no registro da aula.
- [x] Envio de arquivos (PDF, foto, áudio, documentos) guardados no PostgreSQL, com cota de 60 MB por conta.
- [ ] Extração de texto de PDFs para a busca e para a IA.

## Decisões da segunda rodada

| Decisão | Motivo |
| --- | --- |
| Visual no padrão de apps nativos: fonte do sistema, listas agrupadas, uma cor de destaque sólida, sem gradientes nem sombras em cartões. | Evita os sinais típicos de interface gerada por IA e segue a referência Apple pedida na especificação. |
| Arquivos em `bytea` no PostgreSQL, até 3 MB cada. | Não há serviço de armazenamento configurado; 3 MB em base64 cabe no limite do proxy da Vercel. |
| Arquivos abrem por link de uso único (2 minutos). | Funciona no navegador, no iPhone e no app Android sem colocar o token da sessão na URL. |
| O service worker não guarda respostas da API. | Elas têm dados pessoais e arquivos. |

## Limitações conhecidas

- Banco de produção no Neon (gratuito, sem expiração) desde 2026-10-14; os dados do banco antigo do Render foram perdidos quando ele expirou.
- Recuperação de senha em produção depende de `RESEND_API_KEY`, `MAIL_FROM` e `APP_URL` na API.
- Notificações não funcionam dentro do app Android (WebView) nem com o Lúmina fechado.
- No iPhone, o Lúmina é instalado como PWA pelo Safari. Um app nativo na App Store exige conta Apple Developer paga.

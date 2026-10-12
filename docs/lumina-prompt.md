# Prompt completo — Lúmina | Plataforma inteligente de estudos

> Resumo fiel do prompt original enviado pelo chat, organizado por seção. Requisitos e regras foram mantidos; exemplos e repetições foram condensados.

## 1. Contexto do projeto

Quero desenvolver uma plataforma web responsiva chamada **Lúmina**, um assistente pessoal de estudos voltado para estudantes universitários.

O objetivo é resolver um problema muito comum: quando chega a semana de provas, os alunos não sabem exatamente o que estudar, quais conteúdos os professores já ensinaram, em quais aulas encontrar cada assunto e por onde começar.

Durante o semestre, o estudante deverá conseguir registrar o conteúdo de cada aula, salvar observações dos professores, organizar materiais e cadastrar provas, trabalhos e atividades. Quando precisar estudar, o sistema deverá reunir essas informações e ajudar a construir um plano de estudos personalizado.

O Lúmina deve funcionar como um sistema de organização acadêmica integrado a um assistente inteligente de aprendizagem.

**Sua principal promessa é: “Você registra o semestre. O Lúmina organiza seus estudos.”**

Não quero apenas um protótipo estático, uma landing page ou uma demonstração visual. Quero construir uma aplicação funcional, com navegação real, formulários operacionais, persistência de dados, autenticação e uma arquitetura preparada para receber funcionalidades de inteligência artificial.

Desenvolva o projeto por etapas, priorizando primeiro uma base funcional e depois as funções avançadas. Trabalhe com autonomia dentro deste escopo: inspecione o repositório e o ambiente antes de alterar arquivos, aproveite corretamente o que já existe, evite recriar soluções que já funcionam e não faça mudanças amplas sem necessidade. Se houver decisões técnicas em aberto, escolha a alternativa mais simples, segura, sustentável e compatível com o projeto; registre a decisão quando ela afetar a arquitetura. Só interrompa para perguntar algo quando a resposta for realmente indispensável para continuar com segurança.

## 2. Identidade visual e design

A estética deve ser inspirada na experiência visual dos produtos Apple: organizada, minimalista, intuitiva, elegante e agradável de usar. Não copie interfaces ou marcas da Apple. Desenvolva uma identidade própria para o Lúmina.

### Paleta e estilo

- Branco e tons de gelo como base.
- Azul suave, lavanda e lilás como cores principais.
- Gradientes discretos e luminosos.
- Cards com cantos arredondados.
- Sombras leves e bordas delicadas.
- Tipografia moderna, limpa e legível.
- Ícones visuais consistentes e de boa qualidade.
- Ilustrações delicadas, pequenas animações e microinterações.
- Espaçamento generoso, evitando poluição visual.

O design deve transmitir tranquilidade, organização, criatividade e confiança. A experiência precisa ser bonita sem prejudicar a produtividade.

Cada disciplina deve possuir uma cor personalizável. Essa mesma cor deve aparecer consistentemente no calendário, nos cards, nas provas, nas aulas e nos indicadores relacionados àquela matéria. Garanta contraste suficiente para leitura e acessibilidade nos modos claro e escuro; não dependa apenas da cor para comunicar estados ou tipos de evento.

Disponibilize modo claro e modo escuro, além de uma opção para personalizar a aparência.

### Mascote

Crie uma mascote original chamada **Nox**, um gatinho místico que acompanha o estudante. Aparência encantadora, inspiração em gatos mágicos, olhos expressivos, elementos de lua e estrelas, estética delicada, preferencialmente em tons escuros de azul e lilás.

Ele poderá aparecer na tela de boas-vindas, no processo de configuração da conta, em estados vazios, na área de estudos com IA e em mensagens motivacionais e de conclusão de tarefas. Discreto e simpático, sem ocupar excessivamente o espaço de trabalho. Ilustrações consistentes do mesmo personagem.

### Responsividade

Funcionar em computadores, notebooks, tablets e celulares Android e iPhone. Em telas grandes, barra lateral; em dispositivos móveis, barra inferior ou menu compacto. Calendários, tabelas, formulários, cards e gráficos reorganizados para telas pequenas, sem cortes, rolagem horizontal desnecessária ou botões difíceis de tocar. Todo o conteúdo em português brasileiro.

## 3. Login e configuração inicial

Onboarding em etapas, simples, visual e agradável, com barra de progresso e perguntas diretas.

- **Etapa 1 — Criar conta:** nome, e-mail, senha, confirmação da senha. Autenticação real e segura, recuperação de senha, validação dos campos e opção de sair da conta.
- **Etapa 2 — Perfil acadêmico:** faculdade, curso, semestre ou período atual, turno, semestre letivo com mês de início e fim. Editáveis depois nas configurações.
- **Etapa 3 — Disciplinas:** nome, professor, cor, dia da semana, horário de início e término, sala ou local, data de início e término do período letivo. Mais de uma aula da mesma disciplina por semana. Adicionar, editar, remover e reorganizar; alterações refletem na agenda e telas relacionadas.
- **Etapa 4 — Rotina:** minutos disponíveis por dia, horários preferidos, dias e horários disponíveis, lembretes, aparência, preferências de organização.

Nenhuma pergunta obrigatória além do necessário; o estudante completa depois. Ao concluir, mensagem de boas-vindas personalizada e dashboard.

## 4. Estrutura principal

Navegação: Início, Calendário, Provas, Conteúdos, Dias de aula, Estudar com IA, Configurações. Consistente, ícones claros, rótulos legíveis, indicação da seção atual.

### Dashboard / Início

- Saudação personalizada (“Olá, Mariana! Vamos organizar seus estudos?”).
- Calendário compacto com próximos dias e compromissos; aulas nas cores das matérias; provas, trabalhos, atividades, entregas e outros eventos diferenciados.
- Próximas avaliações: disciplina, nome, data, contagem regressiva, situação da preparação, acesso aos detalhes.
- Próximas entregas, com opção de marcar como concluída.
- Registro do dia: “Você teve aula hoje?” — registrar aula, registrar falta, aula cancelada, continuar registro não finalizado. Lembrete discreto se houver aula na grade ainda não registrada.
- Minha rotina de hoje: aulas, tarefas e sessões de estudo planejadas.
- Progresso: conteúdos revisados, tópicos pendentes, tarefas concluídas — sem confundir tarefas concluídas com domínio do conteúdo.
- Atalhos: registrar aula, adicionar prova, cadastrar atividade, começar a estudar.

## 5. Calendário geral

Visualizações mensal, semanal, diária e lista. Reúne aulas recorrentes, provas, trabalhos, atividades, prazos, sessões de estudo e outros compromissos. Cor da disciplina; provas e entregas com identificação adicional. Criar eventos, editar datas e horários, remover com confirmação, detalhes ao clicar, filtros por disciplina e tipo, navegação entre semanas e meses, ir para hoje, lembretes. Disciplinas com horários fixos geram ocorrências dentro do período letivo. Cada ocorrência permite registrar presença, falta ou cancelamento sem remover a aula da grade. Fuso America/Sao_Paulo e datas no formato brasileiro.

## 6. Módulo de provas

Cards de todas as avaliações por data e disciplina; filtros futuras, concluídas e todas. Cada prova: nome, disciplina, data e horário, local, formato, assuntos, instruções do professor, quantidade e tipos de questões, materiais de referência, observações pessoais, status da preparação.

Detalhes: informações gerais; conteúdos cobrados; aulas relacionadas; orientações do professor (com data e aula de origem); materiais; meu progresso (não iniciado, em estudo, revisado, dominado); como estudar; simulado; revisão final. Botão “Preparar-me para esta prova” que reúne conteúdos, encontra aulas relacionadas e ajuda a construir uma trilha. Nunca inventar o que cairá; sem assuntos informados, pedir para completar.

## 7. Conteúdos e disciplinas

Cards das disciplinas: cor e ícone, nome, professor, aulas registradas, próxima avaliação, tarefas pendentes. Página da disciplina: visão geral, aulas (cronológicas, filtros por data e assunto), conteúdos, provas, trabalhos e atividades, materiais, observações do professor. Cada aula acessível dali. Busca e filtros por data, tema ou palavra-chave. Qualquer registro editável.

## 8. Dia de aula

Calendário com todas as ocorrências do semestre. Ao selecionar uma aula, formulário: situação (presente, faltei, cancelada, ainda não registrado); o que era esperado; tema principal; o que o professor ensinou; observações importantes; informações sobre a prova; materiais da aula (PDFs, fotos, documentos, links, áudio quando permitido); nível de domínio de 1 a 5 (percepção do aluno). Registro rápido com o essencial; salvar como rascunho. Falta: aula continua no calendário, permite informar conteúdo perdido, anexar material e indicar se foi recuperado. Abrir um registro não marca a aula como estudada.

## 9. Gravação, transcrição e resumo

Gravar ou importar áudio quando permitido; transcrição; conferência; resumo por tópicos (assunto, conceitos, exemplos, orientações, provas, dúvidas); revisão pelo aluno; associação à aula, disciplina, tópicos e avaliações. Transcrição original disponível e editável. Não inventar frases; marcar trechos incertos. Respeitar permissões, legislação e privacidade; avisar antes de iniciar. Sem integração configurada, mostrar indisponibilidade clara, sem simular.

## 10. Cofre de informações dos professores

Registro: informação, disciplina, data informada, aula relacionada, avaliação ou atividade relacionada, categoria, status de confirmação. Categorias: formato da prova, conteúdos cobrados, data de avaliação, tipo e quantidade de questões, orientações para trabalhos, materiais indicados, mudanças de planejamento. Distinguir o que o professor informou (confirmado), hipóteses pessoais e sugestões da IA. Previsão da IA nunca vira orientação oficial.

## 11. Estudar com IA

IA usa prioritariamente registros, anotações e materiais do próprio estudante.

- **A — Resumir minhas aulas:** revisão rápida, resumo completo, conceitos essenciais.
- **B — Flashcards:** revisar, editar, marcar fácil/difícil, repetir os não dominados.
- **C — Simulado:** múltipla escolha, V/F, associação, estudo de caso, dissertativas; quantidade, dificuldade, tipo, disciplina, conteúdos, formato; feedback e explicação após cada resposta; registrar desempenho.
- **D — Explicar o que não entendi:** linguagem simples, exemplos, perguntas de verificação; mais resumido ou detalhado.
- **E — Plano de estudos:** data da prova, conteúdos confirmados, dias disponíveis, minutos por dia, domínio informado, resultados de simulados, materiais. Distribuição realista com revisão e prática. Tempo insuficiente: informar e sugerir prioridades sem prometer domínio.
- **F — Socorro, tenho prova!:** botão de acesso rápido; escolher avaliação; fluxo: conteúdos confirmados, aulas e materiais, assuntos não estudados, organização pelo tempo, resumos e exercícios, progresso, revisão final.

Regras: usar materiais do aluno; informar de quais aulas ou arquivos veio a explicação; não inventar conteúdo ensinado; não afirmar que algo cairá sem base; sinalizar falta de material; diferenciar confirmado, interpretação e sugestão; resultados editáveis; revisão rápida curta. Chamadas seguras no servidor; chaves nunca no navegador.

## 12. Busca geral

Barra de pesquisa nas principais páginas. Disciplinas, aulas, assuntos, observações dos professores, provas, trabalhos, materiais e documentos (texto extraído quando houver suporte). Ex.: “CMYK” mostra aulas, tópicos, provas e materiais com o termo. Filtros por disciplina, data e tipo. Resultados levam ao registro de origem.

## 13. Lembretes e notificações

Lembretes personalizados e controláveis (aula não registrada, prova chegando, trabalho com prazo, conteúdos pendentes, hora da sessão). Configurar antecedência, horário e tipo. Evitar excesso. Não simular notificações não implementadas; indicar como ativar o que exigir configuração.

## 14. Histórico de aprendizagem

Aulas registradas e pendentes, conteúdos para revisar, provas futuras, tarefas concluídas, resultados de simulados, assuntos com mais erros, evolução das revisões. Cada indicador abre os registros de origem. Sem métricas sem dados reais; explicar quando o indicador aparecerá. Evolução pessoal, sem comparação entre alunos.

## 15. Configurações

Dados pessoais; faculdade, curso e semestre; disciplinas e horários; cores; aparência; lembretes; disponibilidade semanal; preferências da IA; arquivos; segurança e acesso; exportação (PDF para consulta, CSV para dados tabulares).

## 16. Banco de dados

Relacional: usuários, perfis acadêmicos, semestres, disciplinas, horários recorrentes, ocorrências de aula, registros de aula, tópicos, materiais e arquivos, provas, tópicos das provas, observações dos professores, trabalhos e atividades, eventos, planos de estudo, sessões de estudo, questões e respostas, resultados de simulados, histórico de revisões, preferências e lembretes. Tópico ligado a várias aulas e avaliações; aula com vários materiais, observações e conteúdos; prova com vários tópicos apontando para as aulas. Todo registro vinculado ao usuário. Integridade sem órfãos; modelo extensível.

## 17. Tecnologia

Sugestão: Next.js + TypeScript, Tailwind, Supabase (PostgreSQL, Auth, Storage), IA por endpoints no servidor, transcrição futura. Pode adaptar preservando os requisitos. Obrigatório: componentes reutilizáveis, validação, mensagens de erro compreensíveis, carregamento, estados vazios, confirmação antes de ações destrutivas, persistência real, falhas de rede, responsivo, controle de acesso, rotas privadas protegidas, variáveis de ambiente, políticas de acesso, código sustentável. Sem segredos no frontend. Sem dados de demonstração como reais. Integrações sem chave: preparar estrutura e indicar o que falta.

## 18. Experiência de uso

Prioridades: registrar aula em poucos passos, achar aula antiga, cadastrar prova sem campos desnecessários, ver o que falta estudar, gerar plano, consultar orientação de professor, anexar e recuperar materiais, entender o progresso. Tela inicial sem excesso. Hierarquia clara, textos curtos, ícones consistentes. Feedback só depois da ação concluída. Estados vazios acolhedores com o Nox.

## 19. Privacidade

Dados privados por padrão; isolamento entre alunos; autenticação segura; políticas por usuário; armazenamento privado; compartilhamento só explícito; exclusão e exportação; cuidado com gravações; comunicação clara sobre IA. Sem compartilhamento público por padrão.

## 20. Plano de desenvolvimento

- **Fase 1 — MVP:** cadastro e login, onboarding, disciplinas com cores e horários, dashboard, calendário, registro diário, presença/falta/cancelamento, materiais, provas com tópicos e datas, informações dos professores, busca básica, persistência e segurança. Útil sem IA.
- **Fase 2 — Preparação para provas:** relação tópicos-aulas-provas, mapa de conteúdos, cronograma, checklist de revisão, lembretes, flashcards, simulados, histórico de desempenho.
- **Fase 3 — IA:** resumos, explicações, questões, plano assistido, pesquisa em documentos, gravação/transcrição/resumo.

## 21. Entregável

Prioridade na Fase 1. Verificar: criar conta, configurar disciplinas e horários, ver calendário, registrar aula, marcar falta, adicionar material, cadastrar prova, consultar depois. Dados persistem após recarregar e novo login; cores consistentes; aulas nas datas corretas; editar e excluir; responsivo; isolamento entre usuários; botões com ação real; erros e carregamento tratados. Limitações do ambiente identificadas, sem fingir integrações.

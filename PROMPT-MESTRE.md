# Prompt mestre — estuda.

Use este documento como especificação integral para projetar, implementar, revisar ou reconstruir o **estuda.**, uma plataforma brasileira de organização acadêmica. Trate cada requisito como obrigatório, exceto quando uma limitação técnica ou legal documentada exigir uma adaptação explícita.

## Papel e padrão de qualidade

Você é uma equipe sênior composta por product designer, pesquisador de UX, arquiteto de software, engenheiro frontend, engenheiro backend, engenheiro mobile, especialista em segurança, acessibilidade, IA aplicada à educação, QA e DevOps.

Entregue um produto real, coerente e publicável. Não entregue telas de demonstração, cards decorativos, números fictícios, ações sem implementação, texto de preenchimento ou recursos pela metade. Cada informação apresentada deve ter uma origem verificável nos dados daquela conta.

O resultado deve parecer criado por uma equipe humana cuidadosa: nomenclatura consistente, microcopy natural em português brasileiro, decisões visuais intencionais, estados vazios úteis, feedback imediato e detalhes refinados. Não use clichês visuais de interfaces geradas por IA, excesso de gradientes, glassmorphism gratuito, sombras exageradas, emojis aleatórios ou blocos que apenas ocupam espaço.

## Visão do produto

O estuda. transforma o que a pessoa registra em um ciclo de aprendizagem:

1. a pessoa cria a própria conta;
2. informa curso, instituição e semestre se desejar;
3. cria suas próprias disciplinas e sessões de estudo;
4. registra o que realmente aconteceu em cada aula;
5. adiciona suas próprias referências à biblioteca;
6. gera questões contextualizadas usando sua matéria;
7. acompanha apenas métricas derivadas de registros reais;
8. usa música como apoio de foco sem interromper a navegação;
9. acessa os mesmos dados pelo site, PWA ou aplicativo móvel.

O produto não deve pressupor qual curso, disciplina, calendário, prova, nota, professor ou instituição a pessoa possui.

## Regra absoluta de verdade dos dados

Nunca pré-carregue ou simule:

- disciplinas;
- aulas;
- provas ou avaliações;
- notas;
- pendências;
- percentuais de desempenho;
- progresso do semestre;
- checklists;
- resumos;
- materiais;
- playlists;
- atividades recentes;
- recomendações que aparentem ser personalizadas;
- questões supostamente geradas por IA.

Uma conta nova começa vazia. Mostre estados vazios elegantes que expliquem a próxima ação. Somente depois de a pessoa registrar conteúdo os elementos correspondentes podem aparecer.

Exemplos de regras:

- “3 disciplinas” só pode aparecer se houver três nomes distintos registrados pela pessoa.
- “2 aulas” só pode aparecer se existirem dois registros reais no diário daquela disciplina.
- “1 pendência” só pode aparecer se existir uma sessão planejada e ainda não concluída.
- uma prova só pode aparecer se a pessoa criar uma avaliação; não deduza uma prova a partir de um plano comum.
- uma nota só pode aparecer se a pessoa cadastrar aquela nota.
- um percentual só pode ser exibido quando houver fórmula clara, dados suficientes e explicação acessível.
- não converta ausência de dados em zero de desempenho; use “Ainda não há dados suficientes”.
- nunca rotule uma questão estática como conteúdo produzido por IA.

## Conta e privacidade

Implemente:

- cadastro com nome, e-mail, senha e curso opcional;
- login e logout;
- sessão individual com expiração;
- edição de perfil;
- isolamento rigoroso dos dados por usuário;
- senhas derivadas com algoritmo seguro e salt individual;
- tokens de sessão aleatórios, persistidos apenas como hash no servidor;
- mensagens claras para credenciais incorretas, sessão expirada, indisponibilidade e validação;
- nenhuma chave, senha ou token no Git;
- `.env.example` sem valores secretos e `.env` ignorado;
- CORS limitado às origens reais de produção e desenvolvimento;
- consultas parametrizadas e validação de entrada.

## Arquitetura obrigatória

Organize o monorepo em:

- `Web/`: React e Vite, aplicação responsiva e PWA;
- `Api/`: Node.js, Express, PostgreSQL e OpenAPI 3;
- `Mobile/`: Expo/React Native para Android e iOS;
- `README.md`: apresentação profissional, links públicos, instalação e arquitetura;
- `DEPLOY.md`: operação e publicação;
- manifesto PWA, service worker, ícones e página 404;
- testes de API e validação de build.

A API deve possuir versionamento em `/api/v1`, health check, documentação Swagger, autenticação Bearer, respostas JSON consistentes e códigos HTTP corretos.

## Central

A Central deve funcionar como resumo verdadeiro da conta:

- saudação baseada no horário e no primeiro nome real;
- próximas sessões derivadas do planejamento;
- calendário do mês atual calculado dinamicamente;
- acesso rápido ao diário, planejamento, revisão e biblioteca;
- disciplinas derivadas da união entre planejamentos e registros do diário;
- recomendação derivada do registro mais recente, priorizando dúvidas reais;
- estado vazio quando ainda não houver conteúdo;
- nenhum card de “próxima prova” sem avaliação cadastrada;
- nenhum “continue de onde parou” com matéria inventada;
- nenhum tempo recomendado arbitrário.

## Estudos e planejamento

Permita que a pessoa escreva livremente:

- nome da disciplina;
- conteúdo ou objetivo;
- data opcional;
- horário opcional;
- prioridade.

Não ofereça uma lista pré-preenchida de disciplinas. Disciplinas anteriores da própria conta podem ser sugeridas, desde que identificadas como histórico pessoal.

Mostre sessões planejadas, permita concluí-las e confirme sucesso ou falha. Nunca mostre progresso percentual sem histórico suficiente. Diferencie claramente “planejado”, “registrado” e “concluído”.

## Diário de Aula

O diário deve aceitar:

- disciplina livre;
- data;
- conteúdo previsto;
- conteúdo realmente dado;
- ponto alcançado;
- o que foi compreendido;
- o que não foi compreendido;
- avisos, prazos e avaliações mencionados pela pessoa;
- notas pessoais;
- referências.

Salvar deve persistir e sincronizar. “Salvar e revisar” deve salvar antes de abrir a revisão com IA. Os registros do diário alimentam recomendações e contexto da IA.

## Revisão com IA

Use o nome “Revisão com IA”, não “provas prontas” nem linguagem que indique a existência de uma avaliação real.

Fluxo:

1. a pessoa informa disciplina e assunto;
2. pode colar anotações manualmente;
3. se o campo ficar vazio, reúna apenas diário e biblioteca daquela mesma disciplina;
4. envie contexto limitado e normalizado para o Gemini;
5. gere a quantidade solicitada de questões originais;
6. cada questão possui quatro alternativas, uma correta, dificuldade e explicação;
7. corrija a seleção imediatamente e explique a resposta;
8. identifique claramente que a revisão foi gerada naquele momento.

Não use banco oculto de questões genéricas como se fosse IA. Se o provedor falhar, mostre erro honesto e ofereça “Tentar novamente”. Não invente uma revisão de contingência.

O prompt do servidor deve proibir fatos externos quando a pessoa fornecer contexto e solicitar questões específicas, relevantes e não ambíguas. Valide o JSON estruturado antes de responder. Aplique limite de requisições por usuário.

## Biblioteca pessoal

A Biblioteca começa vazia. A pessoa pode criar, pesquisar, filtrar, abrir e remover materiais próprios.

Tipos permitidos:

- link;
- PDF;
- slides;
- artigo;
- livro;
- anotação.

Campos:

- título;
- tipo;
- disciplina opcional;
- URL quando aplicável;
- observações.

Não exiba Slides de Direção de Arte, Teorias da Comunicação, Behance ou qualquer outra referência fictícia. Valide URLs e use estados de sucesso, erro e confirmação adequados.

## Desempenho honesto

Construa o painel apenas com dados reais:

- quantidade de disciplinas distintas;
- número de sessões planejadas;
- número de registros no diário;
- distribuição por disciplina;
- histórico de atividade quando houver eventos reais;
- avaliações e notas somente após cadastro explícito desses recursos.

Não mostre média geral, curva de evolução, notas, 78%, 42 aulas ou 12 pendências sem registros que sustentem cada valor. Quando não houver dados, explique como formar o histórico.

## Spotify — dois modos corretos

### Modo incorporado

- aceite um link público fornecido pela pessoa;
- suporte playlist, álbum, faixa, show e episódio;
- não carregue playlist padrão;
- converta o link para o formato oficial de embed;
- mantenha o iframe montado no componente raiz durante toda a navegação interna;
- inclua `allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"`;
- não recrie o iframe ao trocar de página;
- preserve o estado expandido/recolhido;
- informe que disponibilidade de faixa completa depende do Spotify, login e suporte a mídia criptografada do navegador.

### Modo Spotify Premium

Para reprodução completa com controles próprios, implemente a solução oficial:

- Spotify Web Playback SDK;
- Authorization Code com PKCE;
- Client ID público configurado por variável de ambiente;
- redirect URI exata e autorizada no painel do Spotify;
- scopes `streaming`, `user-read-email`, `user-read-private`, `user-read-playback-state` e `user-modify-playback-state`;
- renovação de access token com refresh token;
- dispositivo Spotify Connect chamado `estuda. — foco`;
- transferência e início de reprodução somente após gesto da pessoa;
- play, pause, anterior, próxima e seleção do conteúdo configurado;
- volume de 0 a 100 em navegadores que permitem JavaScript;
- Media Session habilitada;
- mensagens para conta sem Premium, token expirado, autoplay bloqueado e dispositivo indisponível;
- botão de desconexão que remova os tokens locais.

No iPhone, respeite a plataforma: o volume é controlado pelos botões físicos e não pode ser alterado por JavaScript. Não tente contornar DRM, assinatura Premium, políticas de autoplay ou termos do Spotify.

O player deve existir acima do roteamento da aplicação para continuar tocando ao navegar entre Central, Estudos, Diário, Revisão, Biblioteca, Desempenho e Perfil. Não o limite à página Perfil.

## Direção visual

Use o Notion como referência de princípios, não como cópia:

- hierarquia editorial clara;
- muito espaço útil, sem desperdício;
- estrutura previsível;
- foco no conteúdo da pessoa;
- componentes discretos;
- ações próximas do contexto;
- densidade adaptável.

Crie identidade própria para o estuda.:

- base quente, legível e sofisticada;
- azul-marinho profundo como âncora;
- violeta usado com moderação;
- cores de disciplinas apenas para identificação, nunca como grandes fundos lavados;
- tipografia com contraste forte;
- cartões com bordas discretas e sombras leves;
- cantos consistentes;
- estados de hover, foco, ativo, desabilitado e carregamento;
- ícone exclusivo do produto em favicon, PWA, Android e iOS.

Proíba texto cinza-claro sobre branco, texto azul-escuro sobre gradiente escuro, controles nativos sem estilização e grandes áreas pastel com contraste insuficiente. Atenda WCAG AA para texto e controles.

## Responsividade

Valide ao menos:

- 375 × 667;
- 390 × 844;
- 768 × 1024;
- 1024 × 768;
- 1366 × 768;
- 1440 × 900.

Requisitos:

- nenhum scroll horizontal;
- menu lateral em desktop;
- menu móvel ou navegação inferior em telas pequenas;
- safe areas do iPhone;
- formulários com largura adequada;
- cards reorganizados em uma, duas ou três colunas;
- botões tocáveis com pelo menos 44 px quando apropriado;
- player sem cobrir navegação, mensagens ou formulários;
- teclado móvel não pode impedir o envio;
- imagens e ícones otimizados.

## PWA e aplicativos

A PWA deve:

- ser instalável no Safari do iPhone/iPad e navegadores compatíveis;
- possuir manifesto completo, theme color e ícones adequados;
- possuir service worker versionado;
- abrir em modo standalone;
- ter atalhos úteis;
- funcionar por tempo indeterminado enquanto a URL pública existir;
- atualizar caches sem manter versões quebradas.

O app Expo deve usar a mesma plataforma pública e os mesmos dados. Gere APK Android permanente em GitHub Release. Valide o projeto iOS por build de simulador; explique que TestFlight/App Store exigem Apple Developer, enquanto a PWA não exige.

## Qualidade de navegação e conteúdo

Verifique:

- logo clicável;
- e-mail com `mailto:`;
- telefone com `tel:` somente se existir um número real;
- todos os links e botões;
- menu móvel completo;
- títulos de página por rota;
- favicon;
- meta description;
- ano de copyright dinâmico;
- rodapé sem links falsos;
- página 404 própria com retorno à Central;
- feedback de sucesso e erro;
- sessão expirada retornando ao login;
- ausência de `href="#"`, Lorem Ipsum, TODO, handlers vazios e navegação sem destino;
- placeholders usados apenas como exemplos de formato, nunca como conteúdo persistido.

## Testes obrigatórios

Execute em loop até não encontrar falhas:

1. instalar dependências em ambiente limpo;
2. rodar testes da API;
3. rodar build web;
4. rodar auditoria de dependências;
5. rodar Expo Doctor;
6. exportar Android e iOS;
7. testar cadastro e login reais;
8. editar perfil;
9. criar e concluir planejamento;
10. salvar diário;
11. criar, abrir e remover material;
12. gerar questões com Gemini usando matéria registrada;
13. validar erro honesto quando Gemini falhar;
14. validar embed Spotify com mídia criptografada;
15. validar login Premium, reprodução, controles e volume quando as credenciais estiverem configuradas;
16. iniciar música, navegar por todas as páginas e confirmar que o player não é remontado;
17. testar PWA, manifesto, service worker e 404;
18. medir largura do documento em todos os breakpoints;
19. verificar console e requisições com erro;
20. repetir após a publicação nas URLs definitivas.

Crie dados temporários de QA identificáveis e remova o que puder ao terminar. Não confunda dados de teste com conteúdo de apresentação.

## Publicação

- GitHub público com histórico de commits pequenos, objetivos e naturais;
- nenhuma alegação de que código humano deve ocultar uso de ferramentas;
- README com proposta, funcionalidades reais, arquitetura, instalação, segurança e links;
- release versionada com APK, checksum e build de simulador;
- API e PostgreSQL no Render;
- frontend/PWA na Vercel;
- Swagger público;
- health check público;
- variáveis de ambiente configuradas somente nos provedores;
- repositório destacado no perfil do GitHub após validação final.

## Critérios de aceite finais

O trabalho só termina quando:

- uma conta nova aparece realmente vazia;
- nenhum dado acadêmico é inventado;
- todos os dados criados sobrevivem a recarregamento e outro dispositivo;
- a IA usa a matéria da pessoa;
- falha de IA não vira questão genérica disfarçada;
- o Spotify embed preserva mídia criptografada e permanece entre páginas;
- o modo Premium possui controles reais, ressalvadas as limitações oficiais;
- contraste e legibilidade estão aprovados em todas as telas;
- não há overflow horizontal;
- site, API, Swagger, PWA e APK têm links públicos estáveis;
- testes locais e de produção passam;
- o README corresponde exatamente ao que está no ar;
- o Git está limpo e o projeto está destacado no perfil.

Ao encontrar uma divergência entre a interface e estes critérios, corrija a interface ou remova a alegação. Nunca preencha a lacuna com conteúdo fictício.

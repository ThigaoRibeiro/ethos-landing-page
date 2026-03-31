# Documentação da Fase 2: Integração RAG e Chat Inteligente (Ethos)

A Fase 2 do projeto culminou na transformação da landing page estática do Ethos em uma aplicação rodando um **Assistente Especializado com Inteligência Artificial**, alimentado diretamente por uma base de dados no Google Drive. O foco desta fase foi conectar o motor do Google Gemini à documentação do CONCEA e integrar uma interface interativa diretamente na primeira dobra do site.

Abaixo, os detalhes técnicos e as conquistas implementadas no backend e frontend:

---

## 1. Core de Inteligência e Base de Dados (RAG)

A estrutura fundacional do AI foi desacoplada em serviços especializados no `/server`:

### Conexão OAuth e Google Drive (`services/drive.js`)
- **Autenticação Segura:** Implementada a autorização OAuth 2.0 (via `credentials.json` + `tokens.json`) exigida pelo ecossistema do GCP.
- **Navegação Inteligente de Pastas:** O servidor localiza a pasta raiz (`Ethos`), a subpasta `Documentation` (para PDFs) e a subpasta `Prompt_Persona` (para a injeção da identidade visual/escrita `V1`).
- **Extração de Texto (Parsing):** Ferramenta `pdf-parse` agregada para ler e varrer milhares de caracteres de PDF em buffers diretos para a memória Node.

### Retrieval-Augmented Generation (`services/rag.js`)
- **Vetorização em Memória:** Todos os textos do *Guia do CONCEA* e derivados (~3 milhões de letras) são cortados em **chunks** (`CHUNK_SIZE = 800 tokens`, `OVERLAP = 100 tokens`) para manter coesão semântica.
- **Embedding Assíncrono:** Para respeitar o "Rate Limit" (15 RPM) das APIs Gemini Free Tier, criamos um loop serial asíncrono que vetoriza os chunks em segundo plano durante a inicialização (`bootstrap()`), evitando travar o carregamento do painel (UI).
- **Match por Similaridade de Cosseno:** Para recuperar os dados perfeitamente, o chat do usuário é vetorizado e comparado matematicamente (`cosineSimilarity`) com a base vetada, repassando só os PDFs de limiar `> 0.15` à IA.

### Orquestrador da IA (`services/gemini.js`)
- **Engenharia de Prompt Combinada:** O prompt dinâmico injeta 4 partes simultâneas antes do preenchimento:
  1. Persona Base (`IDENTIDADE_PERSONA_V1.txt`)
  2. Instrução Estruturada (Obrigatoriedade de resposta em JSON)
  3. Contexto Base documental (Chunks da similaridade)
  4. Histórico da conversa (Memória de longo prazo do chat em até 3 turnos, ou 6 mensagens)
- **Sanitização de Payload:** Expressões regulares e tratamentos de fallback (`parseJsonResponse`) para prevenir vazamento e exposição do código `.json` caso a IA escorregue e retorne blocos de "markdown bruto".

---

## 2. Refatoração e Segurança do Servidor (`server.js`)

- **Bootlocking Assíncrono:** Modificado o carregamento express do servidor para permitir que a porta (`3001`) seja ouvida e aceite conexões HTTP instantaneamente enquanto 3000+ chunks do RAG são laticínios "mastigados" em `background`.
- **Servidor Estático Isolado:** Protegidas as credenciais e lógicas do diretório `server/`. O middleware do Express passou a servir, exclusivamente, arquivos em rotas como `/css`, `/js`, e `/assets`, retornando `404` para tentativas suspeitas.
- **APIs Expostas:**
  - `POST /api/chat`: Processa a conversa, gera embeddings e devolve respostas.
  - `GET /api/status`: Rota de "Polling" que informa à interface a porcentagem de chunks convertidos em vetores no exato segundo consultado.

---

## 3. Interface Visual do Chat (`index.html`, `js/main.js`, `css/styles.css`)

- **Chat Flutuante (FAB):** Remoção dos links velhos externos redirecionando pro *NotebookLM*. A plataforma agora invoca um modal flutuante na própria landing com Glassmorphism (filtros de desfoque) sobre as dobras.
- **Experiência Visual e Estado:** 
  - Subtítulo em Cabeçalho interativo: Um indicador em amarelo ("Carregando base... XX%") mostra o acompanhamento do `polling` da RAG. 
  - Uma vez que o carregamento se depara em 100%, sinaliza Verde (`Guia de Ciência Animal`).
  - Apresentação de "Toast deslizante" (pop-up no pé da UI) com o somatório dos trechos indexados pelo Drive sinalizando a aprovação do setup.
- **Escape HTML:** Regras para renderização de listagens, negrito, itálicos sem dependência em frameworks externos, junto com a sanitização das entradas do usuário.
- **Persistência de Sessões:** Criação do cacheamento local no navegador (`localStorage`) para persistir o recarregamento na F5, permitindo retomar de onde se parou.
- **Estados de Falha:** Bolhas vermelhas de falha se ocorrer demoras e botão visual de "Repetir Carregamento".

---

### Conclusão

A **Fase 2** foi estruturada desde o zero como uma PoC avançada de engenharia Prompt+RAG em Node puro. Diferente dos geradores convencionais, o Ethos foi restringido rigidamente pela Persona e arquitetura pra evitar alucinações ("inventar dados"), focando o "Conhecimento de Mundo" puramente em base de PDFs regulatórios do CONCEA.

Com essa documentação salva na nova branch, você conta com uma linha mestre de infraestrutura moderna em Javascript, ideal tanto para uso *as is* quanto para planejamentos de arquitetura superior no futuro.

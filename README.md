# Ethos - Seu Guia de Ciencia Animal

Landing page institucional com chat integrado do projeto Ethos, uma plataforma educativa e de apoio sobre ciencia de animais de laboratorio, manejo, etica, bem-estar animal e legislacao brasileira.

## Sobre

O Ethos conecta estudantes, pesquisadores e profissionais a orientacoes baseadas em referencias brasileiras sobre ciencia animal. Na implementacao atual, a propria landing page hospeda o chat e envia as perguntas para um backend com Gemini API, usando base documental carregada do Google Drive.

## Estrutura do Projeto

```text
├── index.html              # Pagina principal
├── css/
│   └── styles.css          # Design system e estilos
├── js/
│   └── main.js             # Interacoes da landing e do chat
├── assets/
│   └── images/             # Imagens do projeto
├── server/
│   ├── server.js           # Backend Express
│   ├── services/           # Gemini, Drive e RAG
│   ├── middleware/         # Rate limiting e middlewares
│   ├── config/             # Persona e instrucoes do Ethos
│   ├── .env.example        # Exemplo de configuracao
│   └── credentials/        # Credenciais locais do Google (nao versionadas)
├── README.md               # Documentacao do projeto
└── CONTEXT.md              # Contexto, escopo e diretrizes
```

## Como Executar

1. Clone o repositorio.
2. Entre em `server/`.
3. Instale as dependencias com `npm install`.
4. Crie `server/.env` a partir de `server/.env.example`.
5. Configure a `GEMINI_API_KEY`.
6. Configure `GOOGLE_DRIVE_FOLDER_ID`.
7. Adicione as credenciais do Google em `server/credentials/`.
8. Inicie o backend com `npm start` dentro de `server/`.
9. Abra `http://localhost:3001` no navegador.

## Variaveis de Ambiente

- `GEMINI_API_KEY`: chave da Gemini API.
- `GOOGLE_DRIVE_FOLDER_ID`: pasta raiz com documentos do Ethos no Google Drive.
- `PORT`: porta do servidor local.
- `ALLOWED_ORIGIN`: origem liberada para CORS.
- `ADMIN_KEY`: chave interna para rotas administrativas, como recarga de documentos.
- `RATE_LIMIT_MAX`: maximo de requisicoes por janela.
- `RATE_LIMIT_WINDOW_MS`: duracao da janela de rate limit.

## Credenciais do Google Drive

O backend aceita duas formas de autenticacao:

- Service Account em `server/credentials/service-account.json`
- OAuth Desktop App em `server/credentials/gcp-oauth.keys.json` e `server/credentials/tokens.json`

Para gerar `tokens.json`, execute:

```bash
node auth.js
```

O comando deve ser executado dentro de `server/`.

## Endpoints Principais

- `GET /`: landing page com chat integrado
- `POST /api/chat`: envia perguntas ao Ethos
- `GET /api/health`: health check
- `POST /api/reload-docs`: recarrega a base documental usando `x-admin-key`

## Tecnologias

- HTML5 semantico
- CSS3
- JavaScript vanilla (ES6+)
- Node.js com Express
- Gemini API
- Google Drive API
- RAG em memoria com embeddings

## Licenca

Projeto proprietario. Todos os direitos reservados.

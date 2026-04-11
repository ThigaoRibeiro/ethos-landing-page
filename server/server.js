import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import { chatRateLimiter } from './middleware/rateLimiter.js';
import { generateResponse } from './services/gemini.js';
import { loadDocuments, reloadDocuments } from './services/drive.js';
import { indexDocuments, resetIndex, retrieveRelevantChunks, getRagStatus } from './services/rag.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const STATIC_DIRS = {
  css: path.join(ROOT_DIR, 'css'),
  js: path.join(ROOT_DIR, 'js'),
  assets: path.join(ROOT_DIR, 'assets'),
};

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || `http://localhost:${PORT}`;

// ============================================================
// Middlewares Globais
// ============================================================

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json({ limit: '16kb' }));

// Serve apenas os arquivos públicos necessários para a landing page.
app.use('/css', express.static(STATIC_DIRS.css));
app.use('/js', express.static(STATIC_DIRS.js));
app.use('/assets', express.static(STATIC_DIRS.assets));

// ============================================================
// Rota: POST /api/chat
// ============================================================

app.post('/api/chat', chatRateLimiter, async (req, res) => {
  const startTime = Date.now();

  try {
    const { message, history } = req.body;

    // Validação de input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'O campo "message" é obrigatório e deve ser uma string.',
      });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'A mensagem não pode estar vazia.',
      });
    }

    if (trimmedMessage.length > 2000) {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'A mensagem é muito longa. Por favor, limite sua pergunta a 2000 caracteres.',
      });
    }

    // Valida e sanitiza o histórico
    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (msg) =>
              msg &&
              typeof msg.role === 'string' &&
              typeof msg.content === 'string' &&
              ['user', 'assistant'].includes(msg.role)
          )
          .slice(-6) // Máximo 6 mensagens (3 turnos)
      : [];

    // RAG: busca os chunks mais relevantes
    const chunks = await retrieveRelevantChunks(trimmedMessage, 5);

    // Gemini: gera a resposta
    const result = await generateResponse(trimmedMessage, chunks, safeHistory);

    const elapsed = Date.now() - startTime;
    console.log(
      `[Chat] ✓ Resposta em ${elapsed}ms | modelo: ${result.model} | chunks: ${chunks.length} | confidence: ${result.confidence}`
    );

    return res.status(200).json({
      answer: result.answer,
      sources: result.sources,
      disclaimer: result.disclaimer,
      confidence: result.confidence,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Chat] ✗ Erro em ${elapsed}ms:`, err.message);

    // Erro de timeout ou serviço indisponível
    if (err.message?.includes('indisponível') || err?.status === 503) {
      return res.status(503).json({
        error: 'service_unavailable',
        message: 'O serviço de IA está temporariamente indisponível. Tente novamente em instantes.',
      });
    }

    return res.status(500).json({
      error: 'internal_error',
      message: 'Ocorreu um erro inesperado. Tente novamente.',
    });
  }
});

// ============================================================
// Rota: POST /api/reload-docs  (Administrativa)
// ============================================================

app.post('/api/reload-docs', async (req, res) => {
  // Proteção simples: requer cabeçalho com chave interna
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    resetIndex();
    const docs = await reloadDocuments();
    await indexDocuments(docs);
    res.json({ message: `${docs.length} documento(s) recarregado(s) com sucesso.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Rota: GET /api/health  (Health check)
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// Rota: GET /api/status  (Estado do RAG)
// ============================================================

app.get('/api/status', (req, res) => {
  const rag = getRagStatus();
  res.json({
    server: 'ok',
    rag: {
      status: rag.status,           // 'idle' | 'indexing' | 'ready'
      totalDocs: rag.totalDocs,
      indexedDocs: rag.indexedDocs,
      totalChunks: rag.totalChunks,
      ready: rag.status === 'ready',
    },
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// Fallback: qualquer rota não encontrada devolve a landing page
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // Não devolve o HTML para caminhos que parecem arquivos estáticos.
  if (path.extname(req.path)) {
    res.status(404).end();
    return;
  }

  if (!req.path.startsWith('/server') && !req.path.startsWith('/.git')) {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
  } else {
    res.status(404).end();
  }
});

// ============================================================
// Inicialização do Servidor
// ============================================================

async function bootstrap() {
  console.log('\n🚀 Ethos Backend — Iniciando...\n');

  app.listen(PORT, () => {
    console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
    console.log(`📄 Landing page: http://localhost:${PORT}`);
    console.log(`🔗 API Chat:     http://localhost:${PORT}/api/chat`);
    console.log(`❤️  Health:       http://localhost:${PORT}/api/health\n`);
  });

  // Carrega documentos do Google Drive e indexa para RAG no background
  try {
    console.log('[Bootstrap] Carregando documentos do Google Drive para o RAG (em background)...');
    const docs = await loadDocuments();
    if (docs.length > 0) {
      console.log(`[Bootstrap] ${docs.length} documento(s) carregado(s). Iniciando indexação RAG pesada (Pode levar alguns minutos)...`);
      await indexDocuments(docs);
      console.log(`[RAG] Inteligência Documental operante! Todos os ${docs.length} PDFs estão no cérebro do Ethos.`);
    } else {
      console.warn('[Bootstrap] Nenhum documento carregado. Ethos operará sem base documental.');
    }
  } catch (err) {
    console.warn('[Bootstrap] Aviso: Erro ao carregar documentos:', err.message);
    console.warn('[Bootstrap] O servidor continuará operando, mas sem base documental.');
  }
}

bootstrap();

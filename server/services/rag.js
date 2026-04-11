import { generateEmbedding } from './gemini.js';

/**
 * Serviço de RAG (Retrieval-Augmented Generation)
 *
 * Responsável por:
 * 1. Chunking: Dividir documentos em blocos menores com overlap
 * 2. Indexação: Gerar e armazenar embeddings para cada bloco
 * 3. Busca: Encontrar os blocos mais relevantes para uma query
 */

// Índice vetorial em memória (não requer banco de dados externo)
let vectorIndex = [];
let indexedDocumentIds = new Set();

// Estado do RAG exposto para o endpoint de status
let ragState = {
  status: 'idle',       // 'idle' | 'indexing' | 'ready' | 'error'
  totalDocs: 0,
  indexedDocs: 0,
  totalChunks: 0,
  startedAt: null,
  readyAt: null,
};

export function getRagStatus() {
  return { ...ragState };
}

const CHUNK_SIZE = 800;        // tokens aproximados por bloco
const CHUNK_OVERLAP = 100;     // tokens de sobreposição entre blocos
const WORDS_PER_TOKEN = 0.75;  // aproximação: 1 token ≈ 0,75 palavras

/**
 * Calcula o tamanho aproximado em tokens.
 * Usa aproximação simples (palavras / 0.75) sem biblioteca de tokenização.
 */
function estimateTokens(text) {
  return Math.ceil(text.split(/\s+/).length / WORDS_PER_TOKEN);
}

/**
 * Divide um texto em chunks com overlap.
 * Opera por parágrafos para evitar cortes no meio de frases.
 *
 * @param {string} text - Texto do documento
 * @param {string} documentTitle - Título para rastreabilidade
 * @param {string} documentId - ID para deduplicação
 * @returns {Array<{id, title, content, chunkIndex}>}
 */
function chunkDocument(text, documentTitle, documentId) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks = [];
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;

  function saveChunk() {
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${documentId}-chunk-${chunkIndex}`,
        title: documentTitle,
        content: currentChunk.trim(),
        chunkIndex,
      });
      chunkIndex++;
    }
  }

  for (const paragraph of paragraphs) {
    const pTokens = estimateTokens(paragraph);

    if (currentTokens + pTokens > CHUNK_SIZE && currentChunk.length > 0) {
      saveChunk();
      // Mantém o overlap: pega as últimas palavras do chunk anterior
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / WORDS_PER_TOKEN));
      currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
      currentTokens = estimateTokens(currentChunk);
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens += pTokens;
    }
  }

  saveChunk(); // Salva o último chunk
  return chunks;
}

/**
 * Calcula a similaridade de cosseno entre dois vetores.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Valor entre -1 e 1
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Indexa uma lista de documentos gerando embeddings para cada chunk.
 * Pula documentos já indexados (deduplicação por ID).
 *
 * @param {Array<{id, title, content}>} documents
 */
export async function indexDocuments(documents) {
  if (!documents || documents.length === 0) {
    console.log('[RAG] Nenhum documento para indexar.');
    ragState.status = 'ready';
    ragState.readyAt = new Date().toISOString();
    return;
  }

  ragState.status = 'indexing';
  ragState.totalDocs = documents.length;
  ragState.indexedDocs = 0;
  ragState.startedAt = new Date().toISOString();

  let newChunks = 0;
  let skipped = 0;

  for (const doc of documents) {
    if (indexedDocumentIds.has(doc.id)) {
      skipped++;
      ragState.indexedDocs++;
      continue;
    }

    const chunks = chunkDocument(doc.content, doc.title, doc.id);
    console.log(`[RAG] Indexando "${doc.title}": ${chunks.length} chunk(s)...`);

    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(chunk.content);
        vectorIndex.push({ ...chunk, embedding });
        newChunks++;
      } catch (err) {
        console.warn(`[RAG] Erro ao gerar embedding para chunk "${chunk.id}": ${err.message}`);
      }
    }

    indexedDocumentIds.add(doc.id);
    ragState.indexedDocs++;
  }

  ragState.status = 'ready';
  ragState.totalChunks = vectorIndex.length;
  ragState.readyAt = new Date().toISOString();

  console.log(
    `[RAG] Indexação concluída: ${newChunks} chunk(s) novo(s), ${skipped} documento(s) já indexados.`
  );
  console.log(`[RAG] ✅ PRONTO — Total no índice: ${vectorIndex.length} chunk(s).`);
}

/**
 * Reseta o índice vetorial (usado ao recarregar documentos).
 */
export function resetIndex() {
  vectorIndex = [];
  indexedDocumentIds.clear();
  console.log('[RAG] Índice resetado.');
}

/**
 * Busca os chunks mais relevantes para uma query.
 *
 * @param {string} query - Pergunta do usuário
 * @param {number} topK - Número de resultados a retornar (padrão: 5)
 * @returns {Promise<Array<{id, title, content, similarity}>>}
 */
export async function retrieveRelevantChunks(query, topK = 5) {
  if (vectorIndex.length === 0) {
    console.warn('[RAG] Índice vazio. Ethos responderá sem base documental.');
    return [];
  }

  try {
    const queryEmbedding = await generateEmbedding(query);

    const scored = vectorIndex.map((chunk) => ({
      id: chunk.id,
      title: chunk.title,
      content: chunk.content,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    // Ordena por similaridade decrescente e retorna os top K
    const topChunks = scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .filter((chunk) => chunk.similarity > 0.15); // Limiar mínimo de relevância

    console.log(
      `[RAG] Query: "${query.slice(0, 50)}..." → ${topChunks.length} chunk(s) relevante(s)`
    );

    return topChunks;
  } catch (err) {
    console.error('[RAG] Erro ao buscar chunks:', err.message);
    return [];
  }
}

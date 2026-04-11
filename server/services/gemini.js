 import { GoogleGenAI } from '@google/genai';
import { ETHOS_PERSONA, RESPONSE_FORMAT_INSTRUCTION } from '../config/persona.js';

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

let ai;

function parseJsonResponse(rawText) {
  const normalized = (rawText || '').trim();
  if (!normalized) return null;

  const candidates = [normalized];
  const fencedMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Tenta o proximo formato candidato.
    }
  }

  return null;
}

function normalizeModelPayload(parsed, rawText) {
  // Se o parse falhou (parsed === null), e o rawText parece ser JSON bruto exposed,
  // usamos uma mensagem de fallback amigável em vez de vazar JSON para o usuário.
  let safeAnswer;
  if (typeof parsed?.answer === 'string' && parsed.answer.trim().length > 0) {
    safeAnswer = parsed.answer.trim();
  } else if (parsed === null) {
    // Parse falhou completamente — não vazar o JSON bruto
    safeAnswer = 'Desculpe, encontrei um problema ao formatar minha resposta. Por favor, tente novamente.';
  } else {
    safeAnswer = rawText;
  }

  const safeSources = Array.isArray(parsed?.sources)
    ? parsed.sources.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];

  const safeDisclaimer =
    typeof parsed?.disclaimer === 'string' && parsed.disclaimer.trim().length > 0
      ? parsed.disclaimer.trim()
      : null;

  const safeConfidence = ['high', 'medium', 'low'].includes(parsed?.confidence)
    ? parsed.confidence
    : 'low';

  return {
    answer: safeAnswer,
    sources: safeSources,
    disclaimer: safeDisclaimer,
    confidence: safeConfidence,
  };
}

function getClient() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY não configurada nas variáveis de ambiente.');
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

/**
 * Gera embedding vetorial para um texto.
 * Usado pelo serviço de RAG para indexação e busca por similaridade.
 *
 * @param {string} text - Texto a ser vetorizado
 * @returns {Promise<number[]>} Vetor de embedding
 */
export async function generateEmbedding(text) {
  const client = getClient();
  // Throttle: respeita o rate limit de 1500 RPM da API
  await new Promise((r) => setTimeout(r, 50));
  const response = await client.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
  });
  return response.embeddings[0].values;
}

/**
 * Monta o prompt estruturado com os 4 blocos:
 * 1. Persona + Regras
 * 2. Contexto RAG (trechos recuperados dos documentos)
 * 3. Histórico recente da conversa
 * 4. Pergunta atual do usuário
 */
function buildPrompt(userMessage, retrievedChunks, history) {
  // Bloco 1: Persona (System Instruction)
  // IMPORTANTE: A RESPONSE_FORMAT_INSTRUCTION é sempre adicionada ao final da persona,
  // mesmo quando a persona vem do Google Drive, para garantir o retorno em JSON.
  const persona = ETHOS_PERSONA + '\n\n' + RESPONSE_FORMAT_INSTRUCTION;

  // Bloco 2: Contexto documental (RAG)
  let context = '';
  if (retrievedChunks && retrievedChunks.length > 0) {
    context = '\n\n## CONTEXTO DOCUMENTAL (use apenas estas informações)\n\n';
    retrievedChunks.forEach((chunk, index) => {
      context += `### [DOCUMENTO ${index + 1}: ${chunk.title}]\n${chunk.content}\n\n`;
    });
  } else {
    context =
      '\n\n## CONTEXTO DOCUMENTAL\n\nNenhum documento relevante foi encontrado para esta pergunta. Se a pergunta for sobre seu nome, identidade ou apresentação, responda normalmente com base na sua persona.\n\n';
  }

  // Bloco 3: Histórico recente (até 6 mensagens = 3 turnos)
  let historyContext = '';
  if (history && history.length > 0) {
    const recentHistory = history.slice(-6);
    historyContext = '\n\n## HISTÓRICO RECENTE DA CONVERSA\n\n';
    recentHistory.forEach((msg) => {
      const role = msg.role === 'user' ? 'Usuário' : 'Ethos';
      historyContext += `**${role}**: ${msg.content}\n\n`;
    });
  }

  // Bloco 4: Pergunta atual
  const question = `\n\n## PERGUNTA ATUAL DO USUÁRIO\n\n${userMessage}`;

  return `${persona}${context}${historyContext}${question}`;
}

/**
 * Gera uma resposta do Gemini com base na pergunta, contexto RAG e histórico.
 *
 * @param {string} userMessage - Pergunta do usuário
 * @param {Array} retrievedChunks - Trechos documentais recuperados pelo RAG
 * @param {Array} history - Histórico recente da conversa [{role, content}]
 * @returns {Promise<{answer, sources, disclaimer, confidence}>}
 */
export async function generateResponse(userMessage, retrievedChunks = [], history = []) {
  const client = getClient();
  const prompt = buildPrompt(userMessage, retrievedChunks, history);

  // Tenta com o modelo primário, faz fallback se necessário
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.2,     // Baixa criatividade: respostas mais factuais
          topP: 0.8,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      });

      const rawText = response.text.trim();
      const parsed = parseJsonResponse(rawText);
      const normalizedPayload = normalizeModelPayload(parsed, rawText);

      return {
        answer: normalizedPayload.answer,
        sources: normalizedPayload.sources,
        disclaimer: normalizedPayload.disclaimer,
        confidence: normalizedPayload.confidence,
        model,
      };
    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.status === 503;
      if (isRateLimit && model === PRIMARY_MODEL) {
        console.warn(`[Gemini] Primário (${PRIMARY_MODEL}) indisponível. Tentando fallback...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Todos os modelos Gemini estão indisponíveis no momento.');
}

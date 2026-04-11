import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setPersona } from '../config/persona.js';

/**
 * Serviço de integração com Google Drive.
 *
 * Responsável por:
 * - Autenticar via OAuth 2.0 (Desktop App) ou Service Account
 * - Listar e baixar documentos da pasta configurada no Drive
 * - Suporte a arquivos .txt, .md e Google Docs (exportados como texto)
 */

let driveClient = null;
let cachedDocuments = [];
let lastFetchTime = null;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');

function resolveCredentialPath(filename) {
  const candidates = [
    path.join(SERVER_DIR, 'credentials', filename),
    path.join(process.cwd(), 'credentials', filename),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

/**
 * Inicializa o cliente do Google Drive.
 * Tenta autenticar via Service Account primeiro, depois OAuth.
 */
async function getAuthClient() {
  // Tenta Service Account (ideal para produção sem interação humana)
  const serviceAccountPath = resolveCredentialPath('service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    const auth = new google.auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return auth;
  }

  // Fallback: OAuth 2.0 Desktop App
  const oauthKeysPath = resolveCredentialPath('gcp-oauth.keys.json');
  const tokensPath = resolveCredentialPath('tokens.json');

  if (!fs.existsSync(oauthKeysPath)) {
    throw new Error(
      'Credenciais do Google Drive não encontradas.\n' +
        'Configure uma das opções:\n' +
        '  1. Service Account: credentials/service-account.json\n' +
        '  2. OAuth Desktop App: credentials/gcp-oauth.keys.json + tokens.json\n' +
        'Consulte o README.md para instruções detalhadas.'
    );
  }

  const keys = JSON.parse(fs.readFileSync(oauthKeysPath, 'utf-8'));
  const { client_id, client_secret, redirect_uris } = keys.installed || keys.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(tokensPath)) {
    const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
    oAuth2Client.setCredentials(tokens);
    return oAuth2Client;
  }

  throw new Error(
    'Tokens OAuth não encontrados. Execute `node server/auth.js` para autorizar o acesso ao Google Drive.'
  );
}

/**
 * Extrai o conteúdo textual de um arquivo do Drive.
 * Suporte: Google Docs (exporta como txt), .txt, .md
 */
async function extractFileContent(drive, file) {
  try {
    if (file.mimeType === 'application/vnd.google-apps.document') {
      // Google Docs → exportar como texto simples
      const response = await drive.files.export({
        fileId: file.id,
        mimeType: 'text/plain',
      });
      return response.data;
    }

    if (
      file.mimeType === 'text/plain' ||
      file.mimeType === 'text/markdown' ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md')
    ) {
      const response = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'text' }
      );
      return response.data;
    }

    // PDF — tenta baixar como texto (limitado, mas funciona para PDFs simples)
    if (file.mimeType === 'application/pdf') {
      const response = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      // Importação dinâmica do pdf-parse para evitar erro em outros contextos
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const data = await pdfParse(Buffer.from(response.data));
      return data.text;
    }

    return null;
  } catch (err) {
    console.warn(`[Drive] Não foi possível extrair conteúdo de "${file.name}": ${err.message}`);
    return null;
  }
}

/**
 * Carrega todos os documentos da pasta configurada no Google Drive.
 *
 * @param {boolean} force - Se true, ignora o cache e busca novamente
 * @returns {Promise<Array<{id, title, content, mimeType}>>}
 */
export async function loadDocuments(force = false) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    console.warn('[Drive] GOOGLE_DRIVE_FOLDER_ID não configurado. Ethos operará sem base documental.');
    return [];
  }

  // Retorna cache se ainda válido
  if (!force && cachedDocuments.length > 0 && lastFetchTime) {
    const elapsed = Date.now() - lastFetchTime;
    if (elapsed < CACHE_TTL_MS) {
      console.log(`[Drive] Usando cache (${cachedDocuments.length} documentos)`);
      return cachedDocuments;
    }
  }

  try {
    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // 1. Encontra as subpastas (Documentation e Prompt_Persona)
    const foldersResponse = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });

    const subfolders = foldersResponse.data.files || [];
    const docFolder = subfolders.find((f) => f.name.toLowerCase() === 'documentation' || f.name.toLowerCase().includes('documentation'));
    const promptFolder = subfolders.find((f) => f.name.toLowerCase() === 'prompt_persona' || f.name.toLowerCase().includes('prompt_persona'));

    let docFolderId = folderId; // Fallback: usa a raiz se não houver pasta "Documentation"
    if (docFolder) {
      docFolderId = docFolder.id;
      console.log(`[Drive] Subpasta "Documentation" encontrada (ID: ${docFolderId}). Restringindo busca de conhecimento a ela.`);
    }

    // 2. Extrai e configura o Prompt Persona (V1)
    if (promptFolder) {
      console.log(`[Drive] Subpasta "Prompt_Persona" encontrada (ID: ${promptFolder.id}). Procurando versao V1...`);
      const promptFilesResp = await drive.files.list({
        // Busca qualquer arquivo de texto ou documento (GDocs/Word) na pasta de prompt
        q: `'${promptFolder.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
      });
      
      const promptFiles = promptFilesResp.data.files || [];
      // O usuário indicou usar "o V1"
      const v1Prompt = promptFiles.find((f) => f.name.toUpperCase().includes('V1'));

      if (v1Prompt) {
        console.log(`[Drive] Prompt da Persona detectado: "${v1Prompt.name}". Extraindo conteúdo...`);
        const personaText = await extractFileContent(drive, v1Prompt);
        if (personaText) {
          setPersona(personaText);
          console.log('[Drive] ✓ System Persona interno substituído com sucesso pelo documento do Google Drive!');
        }
      } else {
        console.log('[Drive] Aviso: Nenhum texto com "V1" no nome encontrado na pasta Prompt_Persona. Usando persona padrão.');
      }
    }

    // 3. Lista e extrai conteúdo dos documentos da pasta "Documentation" (RAG)
    const listResponse = await drive.files.list({
      q: `'${docFolderId}' in parents and trashed = false and (
        mimeType = 'application/vnd.google-apps.document' or
        mimeType = 'text/plain' or
        mimeType = 'text/markdown' or
        mimeType = 'application/pdf'
      )`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      pageSize: 100,
    });

    const files = listResponse.data.files || [];
    console.log(`[Drive] ${files.length} arquivo(s) documental(is) encontrado(s) para o banco de base de conhecimento RAG.`);

    const documents = [];
    for (const file of files) {
      const content = await extractFileContent(drive, file);
      if (content && content.trim().length > 0) {
        documents.push({
          id: file.id,
          title: file.name,
          content: content.trim(),
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
        });
        console.log(`[Drive] ✓ RAG: "${file.name}" carregado (${content.length} chars)`);
      }
    }

    cachedDocuments = documents;
    lastFetchTime = Date.now();
    return documents;
  } catch (err) {
    console.error('[Drive] Erro ao carregar documentos:', err.message);
    // Retorna cache anterior se houver, mesmo expirado
    if (cachedDocuments.length > 0) {
      console.warn('[Drive] Usando cache anterior devido ao erro.');
      return cachedDocuments;
    }
    return [];
  }
}

/**
 * Força o recarregamento da base documental.
 * Chamado pelo endpoint POST /api/reload-docs.
 */
export async function reloadDocuments() {
  console.log('[Drive] Recarregando documentos forçadamente...');
  cachedDocuments = [];
  lastFetchTime = null;
  return loadDocuments(true);
}

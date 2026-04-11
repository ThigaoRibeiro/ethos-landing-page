/**
 * Script de autenticação OAuth 2.0 para o Google Drive.
 *
 * Este script precisa ser executado UMA VEZ para gerar o arquivo tokens.json,
 * que permite ao servidor acessar o Google Drive sem interação manual.
 *
 * Pré-requisitos:
 * 1. Baixe as credenciais OAuth Desktop App do Google Cloud Console
 * 2. Salve como: server/credentials/gcp-oauth.keys.json
 *
 * Uso:
 *   node server/auth.js
 */

import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const KEYS_PATH = path.join(CREDENTIALS_DIR, 'gcp-oauth.keys.json');
const TOKENS_PATH = path.join(CREDENTIALS_DIR, 'tokens.json');

async function authenticate() {
  if (!fs.existsSync(KEYS_PATH)) {
    console.error(`\n❌ Arquivo de credenciais não encontrado: ${KEYS_PATH}`);
    console.error('\nPara configurar:');
    console.error('  1. Acesse: https://console.cloud.google.com');
    console.error('  2. APIs & Services → Credentials → Create Credentials → OAuth client ID');
    console.error('  3. Tipo: "Desktop App"');
    console.error('  4. Baixe o JSON e salve em: server/credentials/gcp-oauth.keys.json\n');
    process.exit(1);
  }

  const keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf-8'));
  const { client_id, client_secret } = keys.installed || keys.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3002/oauth2callback'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
    prompt: 'consent',
  });

  console.log('\n🔐 Autenticação do Google Drive\n');
  console.log('Abra o link abaixo no seu navegador:\n');
  console.log(authUrl);
  console.log('\nApós autorizar, você será redirecionado para localhost:3002...\n');

  // Servidor temporário para capturar o código de autorização
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const params = new url.URL(req.url, 'http://localhost:3002').searchParams;
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        res.end(`<h1>Erro: ${error}</h1>`);
        server.close();
        reject(new Error(error));
        return;
      }

      if (code) {
        res.end('<h1>✅ Autenticação concluída! Pode fechar esta aba.</h1>');
        server.close();
        resolve(code);
      }
    });

    server.listen(3002);
  });

  const { tokens } = await oAuth2Client.getToken(code);

  // Garante que o diretório existe
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }

  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n✅ Tokens salvos em: ${TOKENS_PATH}`);
  console.log('Agora você pode iniciar o servidor: npm start\n');
  process.exit(0);
}

authenticate().catch((err) => {
  console.error('Erro na autenticação:', err.message);
  process.exit(1);
});

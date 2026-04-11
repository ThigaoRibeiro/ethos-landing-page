# Ethos - Contexto do Projeto

## Objetivo

Criar uma plataforma digital educativa chamada **Ethos - Seu Guia de Ciencia Animal**, que auxilia estudantes, pesquisadores, profissionais de bioterio, tecnicos e membros de comites de etica a encontrar orientacoes baseadas em referencias brasileiras sobre ciencia de animais de laboratorio.

## Escopo Atual

- Landing page institucional apresentando o Ethos
- Chat integrado dentro da propria pagina
- Respostas geradas via Gemini API
- Base documental carregada do Google Drive
- Recuperacao de contexto via RAG
- Historico local da conversa no navegador

## O Que Ja Esta Implementado

- Interface de chat embutida na landing page
- Backend Express servindo a pagina e a API
- Integracao com Gemini para resposta e embeddings
- Indexacao em memoria dos documentos
- Carregamento de documentos e prompt de persona via Google Drive
- Rate limiting basico e rota de health check

## Publico-Alvo

- Estudantes de ciencias da vida
- Pesquisadores academicos
- Profissionais de bioterio
- Tecnicos de laboratorio
- Membros de comites de etica (CEUAs)
- Interessados em ciencia animal no contexto brasileiro

## Tom de Voz

| Atributo  | Descricao |
|-----------|-----------|
| Acessivel | Linguagem clara, sem jargao desnecessario |
| Educativo | Foco em orientar e informar |
| Humano    | Proximo, empatico, acolhedor |
| Confiavel | Baseado em referencias oficiais brasileiras |
| Claro     | Direto, sem ambiguidade |
| Acolhedor | Inclusivo e receptivo a todos os perfis |

## Identidade Visual

- **Paleta**: azul, verde, branco, cinza claro
- **Estilo**: clean, moderno, cientifico, institucional, elegante
- **Tipografia**: Inter (Google Fonts)
- **Recursos visuais**: gradientes suaves, glassmorphism, micro-animacoes

## Restricoes Atuais

1. O Ethos deve responder com base documental controlada
2. O sistema nao deve inventar leis, normas ou orientacoes fora da base carregada
3. O conteudo tem carater informativo e educativo
4. As respostas nao substituem avaliacao institucional, etica, juridica ou regulatoria
5. Credenciais e chaves nunca devem ficar expostas no front-end

## Visao Futura

- Melhorar o mecanismo de busca e ranqueamento documental
- Exibir referencias com mais contexto por resposta
- Adicionar painel de atualizacoes regulatorias
- Evoluir memoria de conversa para persistencia no backend
- Suportar multiplos idiomas, se fizer sentido para o produto

## Diretrizes de Desenvolvimento

- **Mensagens de Commit**: Todas as mensagens de commit devem ser escritas em Portugues do Brasil.
- **Seguranca**: Chaves da API e credenciais do Google devem ficar somente no backend.
- **Resposta do Ethos**: Sempre priorizar confiabilidade documental em vez de criatividade.

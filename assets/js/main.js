/* ============================================
   Ethos — Main JavaScript (Fase 2: Chat integrado)
   ============================================ */

(function () {
  'use strict';

  // ============================================================
  // Configuração
  // ============================================================
  const API_URL = '/api/chat';
  const STATUS_URL = '/api/status';
  const STORAGE_KEY = 'ethos-chat-history';
  const MAX_HISTORY = 6; // Máximo de mensagens enviadas ao backend (3 turnos)

  // ============================================================
  // Referências de DOM
  // ============================================================
  const header       = document.getElementById('header');
  const menuToggle   = document.getElementById('menuToggle');
  const headerNav    = document.getElementById('headerNav');
  const chatFab      = document.getElementById('chatFab');
  const chatFabBadge = document.getElementById('chatFabBadge');
  const chatPanel    = document.getElementById('chatPanel');
  const chatClose    = document.getElementById('chatClose');
  const chatClearBtn = document.getElementById('chatClearBtn');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm     = document.getElementById('chatForm');
  const chatInput    = document.getElementById('chatInput');
  const chatSend     = document.getElementById('chatSend');

  // Botões CTA que abrem o chat
  const ctaButtons  = document.querySelectorAll('#mainCtaLink, #headerCtaLink, #ctaLink');
  // Exemplos de perguntas que preenchem o input e abrem o chat
  const exampleBtns = document.querySelectorAll('.example-item[data-question]');

  // ============================================================
  // Estado local da conversa
  // ============================================================
  let conversationHistory = []; // Array de { role: 'user'|'assistant', content: string }
  let isLoading = false;
  let lastFailedMessage = null; // Guarda última mensagem com erro para retry

  // ============================================================
  // Persistência (localStorage)
  // ============================================================
  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory));
    } catch {
      // localStorage pode estar indisponível (modo privado, limites)
    }
  }

  function loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (msg) =>
              msg &&
              typeof msg.role === 'string' &&
              typeof msg.content === 'string' &&
              ['user', 'assistant'].includes(msg.role)
          );
        }
      }
    } catch {
      // Ignora erros de parse
    }
    return [];
  }

  function clearHistory() {
    conversationHistory = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignora
    }
  }

  // ============================================================
  // Renderização de Markdown simplificado
  // (Sem dependência externa — suporta negrito, itálico, listas, parágrafos)
  // ============================================================
  function applyInlineFormatting(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      .replace(/_([^_\n]+?)_/g, '<em>$1</em>');
  }

  function renderMarkdown(text) {
    if (!text) return '';
    const normalizedText = escapeHtml(text).replace(/\r\n?/g, '\n').trim();
    if (!normalizedText) return '';

    const blocks = normalizedText
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    return blocks
      .map((block) => {
        const lines = block
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        const unorderedItems = lines.map((line) => line.match(/^[-*]\s+(.+)$/));
        if (unorderedItems.length > 0 && unorderedItems.every(Boolean)) {
          return `<ul>${unorderedItems
            .map(([, item]) => `<li>${applyInlineFormatting(item)}</li>`)
            .join('')}</ul>`;
        }

        const orderedItems = lines.map((line) => line.match(/^\d+\.\s+(.+)$/));
        if (orderedItems.length > 0 && orderedItems.every(Boolean)) {
          return `<ol>${orderedItems
            .map(([, item]) => `<li>${applyInlineFormatting(item)}</li>`)
            .join('')}</ol>`;
        }

        return `<p>${lines.map((line) => applyInlineFormatting(line)).join('<br>')}</p>`;
      })
      .join('');
  }

  // ============================================================
  // Construção de Elementos do Chat
  // ============================================================

  /** Mensagem de boas-vindas exibida ao abrir o chat sem histórico */
  function createWelcomeMessage() {
    const div = document.createElement('div');
    div.className = 'chat-welcome';
    div.id = 'chatWelcome';
    div.innerHTML = `
      <div class="chat-welcome-icon">🧬</div>
      <h3>Olá! Sou o Ethos</h3>
      <p>Seu guia de ciência animal. Pergunte sobre manejo, legislação brasileira, ética em pesquisa, bem-estar animal e muito mais.</p>
    `;
    return div;
  }

  /** Cria uma bolha de mensagem */
  function createBubble(role, content, sources, disclaimer) {
    const bubble = document.createElement('div');
    const bubbleRoleClass = role === 'assistant' ? 'ethos' : role;
    bubble.className = `chat-bubble ${bubbleRoleClass}`;

    const avatarText = role === 'user' ? 'Você' : 'E';
    const avatar = document.createElement('div');
    avatar.className = 'chat-bubble-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = avatarText === 'Você' ? 'V' : 'E';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-bubble-content';

    const textDiv = document.createElement('div');
    textDiv.className = 'chat-bubble-text';
    textDiv.innerHTML = role === 'user'
      ? escapeHtml(content)
      : renderMarkdown(content);

    contentDiv.appendChild(textDiv);

    // Fontes documentais (apenas para respostas do Ethos)
    if (role === 'assistant' && sources && sources.length > 0) {
      const sourcesDiv = document.createElement('div');
      sourcesDiv.className = 'chat-sources';
      sourcesDiv.innerHTML = `
        <div class="chat-sources-label">📄 Fontes utilizadas</div>
        <ul class="chat-sources-list">
          ${sources.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      `;
      contentDiv.appendChild(sourcesDiv);
    }

    // Disclaimer ético (apenas quando retornado pela API)
    if (role === 'assistant' && disclaimer) {
      const disclaimerDiv = document.createElement('div');
      disclaimerDiv.className = 'chat-bubble-disclaimer';
      disclaimerDiv.textContent = disclaimer;
      contentDiv.appendChild(disclaimerDiv);
    }

    bubble.appendChild(avatar);
    bubble.appendChild(contentDiv);
    return bubble;
  }

  /** Cria o indicador de "digitando..." */
  function createTypingIndicator() {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-typing';
    wrapper.id = 'chatTyping';
    wrapper.innerHTML = `
      <div class="chat-bubble-avatar" aria-hidden="true">E</div>
      <div class="chat-typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    return wrapper;
  }

  /** Cria um estado de erro com botão de retry */
  function createErrorBubble(errorMessage, retryMessage) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble ethos';

    const avatar = document.createElement('div');
    avatar.className = 'chat-bubble-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'E';

    const errorDiv = document.createElement('div');
    errorDiv.className = 'chat-error';

    const msg = document.createElement('span');
    msg.textContent = errorMessage;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'chat-retry-btn';
    retryBtn.type = 'button';
    retryBtn.textContent = '↺ Tentar novamente';
    retryBtn.addEventListener('click', () => {
      wrapper.remove();
      if (retryMessage) {
        sendMessage(retryMessage, { appendUserBubble: false });
      }
    });

    errorDiv.appendChild(msg);
    errorDiv.appendChild(retryBtn);
    wrapper.appendChild(avatar);
    wrapper.appendChild(errorDiv);
    return wrapper;
  }

  /** Escape HTML para evitar XSS nas mensagens do usuário */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /** Rola para o final da área de mensagens */
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function closeMobileMenu() {
    if (!headerNav || !menuToggle) return;

    headerNav.classList.remove('open');
    menuToggle.classList.remove('active');

    const spans = menuToggle.querySelectorAll('span');
    spans.forEach((span) => {
      span.style.transform = '';
      span.style.opacity = '';
    });
  }

  // ============================================================
  // Controle do Painel de Chat
  // ============================================================
  function openChat() {
    chatPanel.hidden = false;
    chatFab.setAttribute('aria-expanded', 'true');
    chatInput.focus();

    // Esconde o badge ao abrir
    chatFabBadge.classList.add('hidden');

    // Se não há histórico, exibe boas-vindas
    if (chatMessages.children.length === 0) {
      renderHistory();
    }

    scrollToBottom();
  }

  function closeChat() {
    chatPanel.hidden = true;
    chatFab.setAttribute('aria-expanded', 'false');
    chatFab.focus();
  }

  function toggleChat() {
    if (chatPanel.hidden) {
      openChat();
    } else {
      closeChat();
    }
  }

  /** Renderiza (ou re-renderiza) todo o histórico salvo */
  function renderHistory() {
    chatMessages.innerHTML = '';

    if (conversationHistory.length === 0) {
      chatMessages.appendChild(createWelcomeMessage());
      return;
    }

    conversationHistory.forEach((msg) => {
      const bubble = createBubble(msg.role, msg.content, msg.sources, msg.disclaimer);
      chatMessages.appendChild(bubble);
    });

    scrollToBottom();
  }

  /** Limpa toda a conversa */
  function clearConversation() {
    if (!confirm('Limpar toda a conversa? Esta ação não pode ser desfeita.')) return;
    clearHistory();
    renderHistory();
    lastFailedMessage = null;
  }

  // ============================================================
  // Envio de Mensagem e Integração com API
  // ============================================================
  async function sendMessage(messageText, options = {}) {
    if (isLoading || !messageText || !messageText.trim()) return;

    const trimmed = messageText.trim();
    const { appendUserBubble = true } = options;
    isLoading = true;
    lastFailedMessage = trimmed;

    // Remove mensagem de boas-vindas se ainda estiver visível
    const welcome = document.getElementById('chatWelcome');
    if (welcome) welcome.remove();

    if (appendUserBubble) {
      // Renderiza bolha do usuário apenas na primeira tentativa.
      const userBubble = createBubble('user', trimmed);
      chatMessages.appendChild(userBubble);
      scrollToBottom();
    }

    // Mostra indicador de digitação
    const typing = createTypingIndicator();
    chatMessages.appendChild(typing);
    scrollToBottom();

    // Bloqueia input durante o carregamento
    chatInput.disabled = true;
    chatSend.disabled = true;
    chatInput.value = '';

    try {
      // Monta histórico para enviar ao backend (sem sources/disclaimer)
      const historyForApi = conversationHistory
        .slice(-MAX_HISTORY)
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyForApi,
        }),
        signal: AbortSignal.timeout(35000), // 35s de timeout
      });

      // Remove o indicador de digitação
      typing.remove();

      if (!response.ok) {
        let errorMsg = 'Ocorreu um erro inesperado. Tente novamente.';
        try {
          const errData = await response.json();
          if (errData.message) errorMsg = errData.message;
        } catch {
          // Ignora erro de parse
        }
        const errorBubble = createErrorBubble(errorMsg, trimmed);
        chatMessages.appendChild(errorBubble);
        scrollToBottom();
        return;
      }

      const data = await response.json();
      const { answer, sources, disclaimer } = data;

      // Salva no histórico (user + assistant)
      conversationHistory.push({ role: 'user', content: trimmed });
      conversationHistory.push({ role: 'assistant', content: answer, sources, disclaimer });
      saveHistory();

      // Renderiza resposta do Ethos
      const ethosAnswer = createBubble('assistant', answer, sources, disclaimer);
      chatMessages.appendChild(ethosAnswer);
      scrollToBottom();

      lastFailedMessage = null;
    } catch (err) {
      typing.remove();

      let errorMsg = 'Não foi possível conectar ao servidor. Verifique sua conexão.';
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        errorMsg = 'A resposta demorou muito. Tente novamente em instantes.';
      }

      const errorBubble = createErrorBubble(errorMsg, trimmed);
      chatMessages.appendChild(errorBubble);
      scrollToBottom();
    } finally {
      isLoading = false;
      chatInput.disabled = false;
      chatSend.disabled = false;
      chatInput.focus();
    }
  }

  // ============================================================
  // Eventos do Chat
  // ============================================================

  // FAB abre/fecha o chat
  if (chatFab) {
    chatFab.addEventListener('click', toggleChat);
  }

  // Botão fechar
  if (chatClose) {
    chatClose.addEventListener('click', closeChat);
  }

  // Botão limpar conversa
  if (chatClearBtn) {
    chatClearBtn.addEventListener('click', clearConversation);
  }

  // Submit do formulário de chat
  if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const msg = chatInput.value.trim();
      if (msg) sendMessage(msg);
    });
  }

  // Enter no input (já coberto pelo submit do form, mas garante comportamento)
  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const msg = this.value.trim();
        if (msg) sendMessage(msg);
      }
    });
  }

  // Fecha o chat ao pressionar Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatPanel && !chatPanel.hidden) {
      closeChat();
    }
  });

  // Botões CTA abrem o chat
  ctaButtons.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      closeMobileMenu();
      openChat();
    });
  });

  // Exemplos de perguntas: abrem o chat e preenchem o input
  exampleBtns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const question = this.dataset.question;
      openChat();
      if (question) {
        chatInput.value = question;
        chatInput.focus();
      }
    });
  });

  // ============================================================
  // Header scroll effect
  // ============================================================
  function handleHeaderScroll() {
    if (!header) return;
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleHeaderScroll, { passive: true });
  handleHeaderScroll();

  // ============================================================
  // Mobile menu toggle
  // ============================================================
  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      headerNav.classList.toggle('open');
      this.classList.toggle('active');

      const spans = this.querySelectorAll('span');
      if (headerNav.classList.contains('open')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      }
    });

    headerNav.querySelectorAll('a, button').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  // ============================================================
  // Animações de scroll (IntersectionObserver)
  // ============================================================
  const animatedElements = document.querySelectorAll('.animate-on-scroll');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    animatedElements.forEach((el) => observer.observe(el));
  } else {
    animatedElements.forEach((el) => el.classList.add('visible'));
  }

  // ============================================================
  // Smooth scroll para links âncora
  // ============================================================
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      const target = document.querySelector(href);
      if (!href || href === '#' || !target) return;

      e.preventDefault();
      const headerHeight = document.getElementById('header').offsetHeight;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    });
  });

  // ============================================================
  // Inicialização: reidrata histórico do localStorage
  // ============================================================
  conversationHistory = loadHistory();

  // Exibe badge se tiver histórico salvo (indica que há conversa anterior)
  if (conversationHistory.length > 0 && chatFabBadge) {
    chatFabBadge.classList.remove('hidden');
  } else if (chatFabBadge) {
    chatFabBadge.classList.add('hidden');
  }

  // ============================================================
  // Polling do status do RAG — indicador no cabeçalho do chat
  // ============================================================
  (function startRagPolling() {
    let ragReady = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 120; // Polling por até 10 minutos (120 × 5s)

    const statusText = document.getElementById('chatStatusText');
    const statusDot = document.getElementById('chatStatusDot');

    function updateHeaderProgress(data) {
      if (!statusText || !statusDot) return;

      const rag = data.rag;

      if (rag.status === 'indexing') {
        const pct = rag.totalDocs > 0
          ? Math.round((rag.indexedDocs / rag.totalDocs) * 100)
          : 0;

        statusText.textContent = `Carregando base... ${pct}%`;
        statusDot.classList.add('indexing');
        statusDot.classList.remove('ready');
      } else if (rag.ready) {
        statusText.textContent = 'Guia de Ciência Animal';
        statusDot.classList.remove('indexing');
        statusDot.classList.add('ready');

        // Toast sutil no topo aparece por 6 segundos
        showReadyToast(rag.totalChunks || 0);
      }
    }

    function showReadyToast(totalChunks) {
      const existing = document.getElementById('ragReadyToast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'ragReadyToast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `
        <span class="rag-toast-icon">🧠</span>
        <div class="rag-toast-body">
          <strong>Base de conhecimento pronta!</strong>
          <span>${totalChunks.toLocaleString('pt-BR')} trechos documentais indexados. Pode perguntar!</span>
        </div>
        <button class="rag-toast-close" aria-label="Fechar">&#x2715;</button>
      `;
      document.body.appendChild(toast);

      const autoDismiss = setTimeout(() => toast.remove(), 8000);
      toast.querySelector('.rag-toast-close').addEventListener('click', () => {
        clearTimeout(autoDismiss);
        toast.remove();
      });

      requestAnimationFrame(() => toast.classList.add('visible'));
    }

    async function pollStatus() {
      if (ragReady || attempts >= MAX_ATTEMPTS) return;
      attempts++;

      try {
        const res = await fetch(STATUS_URL);
        if (!res.ok) return;
        const data = await res.json();

        updateHeaderProgress(data);

        if (data.rag?.ready) {
          ragReady = true;
          return;
        }
      } catch {
        // Servidor ainda subindo, ignorar
      }

      setTimeout(pollStatus, 3000);
    }

    // Marca como 'indexing' imediatamente ao carregar
    if (statusText) statusText.textContent = 'Carregando base... 0%';
    if (statusDot) statusDot.classList.add('indexing');

    setTimeout(pollStatus, 2000);
  })();

})();

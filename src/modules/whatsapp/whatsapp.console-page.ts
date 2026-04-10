export const WHATSAPP_CONSOLE_PAGE = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sevil Kids | Чаты WhatsApp</title>
  <style>
    :root {
      --bg:#edf4ff;
      --panel:#ffffff;
      --line:#d6e0f5;
      --text:#101828;
      --muted:#667085;
      --accent:#2563eb;
      --accent-2:#1d4ed8;
      --ok:#16a34a;
      --warn:#f59e0b;
      --danger:#dc2626;
      --in:#eef2ff;
      --out:#dbeafe;
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      font-family:Segoe UI, Tahoma, sans-serif;
      color:var(--text);
      background:linear-gradient(180deg,#eaf2ff 0%,#f8fbff 100%);
      height:100vh;
      overflow:hidden;
    }
    .hidden { display:none !important; }
    .screen {
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
    }
    .card {
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:22px;
      box-shadow:0 18px 50px rgba(37,99,235,.08);
    }
    .login {
      width:min(430px,100%);
      padding:28px;
    }
    .login h1 {
      margin:0 0 8px;
      font-size:28px;
    }
    .login p {
      margin:0 0 18px;
      color:var(--muted);
    }
    .field {
      display:flex;
      flex-direction:column;
      gap:8px;
      margin-bottom:14px;
    }
    .field input, textarea {
      width:100%;
      border:1px solid var(--line);
      border-radius:14px;
      padding:12px 14px;
      font:inherit;
      background:#fff;
    }
    .button {
      border:none;
      border-radius:14px;
      background:var(--accent);
      color:#fff;
      font-weight:700;
      cursor:pointer;
      padding:12px 18px;
      transition:filter .15s ease, transform .15s ease;
    }
    .button:hover { filter:brightness(.98); }
    .button:disabled { opacity:.6; cursor:not-allowed; }
    .button.secondary {
      background:#eff4ff;
      color:var(--accent-2);
      border:1px solid #bfd1ff;
    }
    .error {
      color:#b42318;
      min-height:20px;
      font-size:14px;
      margin-top:12px;
    }
    .app {
      display:grid;
      grid-template-columns:360px 1fr;
      height:100vh;
      overflow:hidden;
    }
    .sidebar {
      border-right:1px solid var(--line);
      background:#f8fbff;
      padding:18px;
      min-height:0;
      overflow:hidden;
    }
    .main {
      padding:18px;
      display:flex;
      flex-direction:column;
      gap:16px;
      min-height:0;
      overflow:hidden;
    }
    .panel-head {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:16px 18px;
      border-bottom:1px solid var(--line);
    }
    .status-pill {
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:8px 12px;
      border-radius:999px;
      background:#eef4ff;
      color:#1d4ed8;
      font-size:13px;
    }
    .dot {
      width:10px;
      height:10px;
      border-radius:50%;
      background:var(--warn);
    }
    .dot.ready { background:var(--ok); }
    .dot.error { background:var(--danger); }
    .chat-list {
      padding:12px;
      display:flex;
      flex-direction:column;
      gap:10px;
      max-height:calc(100vh - 190px);
      overflow:auto;
      overscroll-behavior:contain;
    }
    .chat-item {
      padding:14px;
      border:1px solid var(--line);
      border-radius:18px;
      background:#fff;
      cursor:pointer;
      transition:border-color .15s ease, background .15s ease;
    }
    .chat-item:hover { border-color:#9db7ff; }
    .chat-item.active {
      background:#eef4ff;
      border-color:#7aa2ff;
    }
    .chat-item strong {
      display:block;
      margin-bottom:6px;
      font-size:17px;
    }
    .muted { color:var(--muted); }
    .messages {
      flex:1;
      min-height:0;
      height:100%;
      max-height:100%;
      overflow:auto;
      overscroll-behavior:contain;
      display:flex;
      flex-direction:column;
      gap:10px;
      padding:18px;
    }
    .msg {
      max-width:74%;
      padding:12px 14px;
      border-radius:16px;
      white-space:pre-wrap;
      word-break:break-word;
      line-height:1.4;
    }
    .msg.in { align-self:flex-start; background:var(--in); }
    .msg.out { align-self:flex-end; background:var(--out); }
    .msg-title {
      font-size:12px;
      font-weight:700;
      margin-bottom:6px;
      color:#344054;
    }
    .composer {
      display:flex;
      gap:10px;
      padding:16px 18px;
      border-top:1px solid var(--line);
    }
    textarea {
      min-height:96px;
      resize:vertical;
    }
    .toggle {
      display:flex;
      align-items:center;
      gap:10px;
      user-select:none;
    }
    .toggle input {
      width:46px;
      height:24px;
      cursor:pointer;
    }
    .top-note {
      padding:10px 18px 0;
      font-size:13px;
      color:var(--muted);
    }
    .action-error {
      color:#b42318;
      font-size:14px;
      min-height:20px;
      padding:0 18px 8px;
    }
    .qr-wrap {
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:16px;
      padding:28px;
      text-align:center;
    }
    .qr-wrap img {
      width:320px;
      height:320px;
      max-width:min(320px,78vw);
      max-height:min(320px,78vw);
      border-radius:16px;
      border:1px solid var(--line);
      background:#fff;
      padding:10px;
      object-fit:contain;
    }
    @media (max-width:960px) {
      .app { grid-template-columns:1fr; }
      .sidebar {
        border-right:none;
        border-bottom:1px solid var(--line);
      }
      .chat-list { max-height:280px; }
      .msg { max-width:88%; }
      .composer { flex-direction:column; }
    }
  </style>
</head>
<body>
  <section id="loginScreen" class="screen">
    <div class="card login">
      <h1>Консоль Sevil Kids</h1>
      <p>Введите логин и пароль, чтобы открыть чаты WhatsApp.</p>
      <div class="field">
        <label for="loginInput">Логин</label>
        <input id="loginInput" value="sevilkids" autocomplete="username" />
      </div>
      <div class="field">
        <label for="passwordInput">Пароль</label>
        <input id="passwordInput" type="password" value="sevil2026" autocomplete="current-password" />
      </div>
      <button id="loginButton" class="button" type="button">Войти</button>
      <div id="loginError" class="error"></div>
    </div>
  </section>

  <section id="appScreen" class="hidden">
    <div class="app">
      <aside class="sidebar">
        <div class="card" style="height:100%;">
          <div class="panel-head">
            <div>
              <strong>Чаты</strong>
              <div id="leftStatus" class="muted">Подключаем WhatsApp...</div>
            </div>
            <button id="refreshButton" class="button secondary" type="button">Обновить</button>
          </div>
          <div id="chatList" class="chat-list">
            <div class="muted">Пока нет чатов.</div>
          </div>
        </div>
      </aside>

      <main class="main">
        <div class="card" style="display:flex; flex-direction:column; flex:1; min-height:0; height:calc(100vh - 36px); max-height:calc(100vh - 36px); overflow:hidden;">
          <div class="panel-head">
            <div>
              <strong id="chatTitle">Сессия WhatsApp</strong>
              <div id="chatMeta" class="muted">Статус подключения появится здесь</div>
            </div>
            <label class="toggle">
              <span class="muted">Бот включен</span>
              <input id="botToggle" type="checkbox" disabled />
            </label>
          </div>

          <div id="clientStatusWrap" class="messages">
            <div id="statusPill" class="status-pill"><span class="dot"></span><span>Инициализация</span></div>
            <div id="qrContainer" class="qr-wrap hidden">
              <div>
                <strong>Сканируйте QR в WhatsApp</strong>
                <div class="muted">После авторизации откроются чаты и ручная отправка сообщений.</div>
              </div>
              <img id="qrImage" alt="WhatsApp QR" />
            </div>
            <div id="statusText" class="muted">Запускаем встроенный клиент WhatsApp...</div>
          </div>

          <div id="chatArea" class="hidden" style="display:flex; flex-direction:column; flex:1; min-height:0; height:100%; overflow:hidden;">
            <div id="topNote" class="top-note hidden"></div>
            <div id="actionError" class="action-error"></div>
            <div id="messages" class="messages"><div class="muted">Выберите чат слева.</div></div>
            <form id="composer" class="composer">
              <textarea id="messageInput" placeholder="Введите сообщение..." disabled></textarea>
              <button id="sendButton" class="button" type="submit" disabled>Отправить</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  </section>

  <script>
    const state = {
      token: sessionStorage.getItem('console_token') || '',
      chats: [],
      selectedKey: null,
      statusTimer: null,
      chatsTimer: null,
      messagesTimer: null,
      busy: false,
      typing: false,
      lastChatsSignature: '',
      currentClientStatus: 'initializing'
    };

    const loginScreen = document.getElementById('loginScreen');
    const appScreen = document.getElementById('appScreen');
    const loginInput = document.getElementById('loginInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginButton = document.getElementById('loginButton');
    const loginError = document.getElementById('loginError');
    const leftStatus = document.getElementById('leftStatus');
    const chatList = document.getElementById('chatList');
    const chatTitle = document.getElementById('chatTitle');
    const chatMeta = document.getElementById('chatMeta');
    const botToggle = document.getElementById('botToggle');
    const messages = document.getElementById('messages');
    const composer = document.getElementById('composer');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const refreshButton = document.getElementById('refreshButton');
    const clientStatusWrap = document.getElementById('clientStatusWrap');
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const qrContainer = document.getElementById('qrContainer');
    const qrImage = document.getElementById('qrImage');
    const chatArea = document.getElementById('chatArea');
    const topNote = document.getElementById('topNote');
    const actionError = document.getElementById('actionError');

    function escapeHtml(value) {
      return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    }

    function authHeaders() {
      return state.token ? { 'X-Console-Auth': state.token } : {};
    }

    async function parseError(response) {
      try {
        const text = await response.text();
        return text || response.statusText || 'Ошибка запроса';
      } catch (error) {
        return response.statusText || 'Ошибка запроса';
      }
    }

    async function request(url, options) {
      const headers = { ...authHeaders(), ...(options && options.headers ? options.headers : {}) };
      if (!headers['Content-Type'] && options && options.body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        logout();
        throw new Error('Сессия интерфейса истекла. Войдите снова.');
      }

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      return response.json();
    }

    function setActionError(message) {
      actionError.textContent = message || '';
    }

    function setTopNote(message) {
      topNote.textContent = message || '';
      topNote.classList.toggle('hidden', !message);
    }

    function logout() {
      sessionStorage.removeItem('console_token');
      state.token = '';
      state.selectedKey = null;
      state.chats = [];
      state.lastChatsSignature = '';
      if (state.statusTimer) clearInterval(state.statusTimer);
      if (state.chatsTimer) clearInterval(state.chatsTimer);
      if (state.messagesTimer) clearInterval(state.messagesTimer);
      loginScreen.classList.remove('hidden');
      appScreen.classList.add('hidden');
    }

    function formatDate(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString('ru-RU');
    }

    function chatSignature(items) {
      return JSON.stringify((items || []).map((item) => [
        item.routeKey,
        item.displayName,
        item.currentMode,
        item.currentStep,
        item.botEnabled,
        item.allowBotReplies,
        item.lastMessageText,
        item.lastIncomingAt,
        item.lastOutgoingAt
      ]));
    }

    function getSelectedChat() {
      return state.chats.find((item) => item.routeKey === state.selectedKey) || null;
    }

    async function login() {
      loginError.textContent = '';

      try {
        const response = await fetch('/api/whatsapp/console/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            login: loginInput.value.trim(),
            password: passwordInput.value.trim()
          })
        });

        if (!response.ok) {
          throw new Error('Неверный логин или пароль');
        }

        const json = await response.json();
        state.token = json.token;
        sessionStorage.setItem('console_token', state.token);
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        await bootstrapConsole();
      } catch (error) {
        loginError.textContent = error.message || 'Не удалось войти';
      }
    }

    async function bootstrapConsole() {
      await loadClientStatus();

      if (state.statusTimer) clearInterval(state.statusTimer);
      if (state.chatsTimer) clearInterval(state.chatsTimer);
      if (state.messagesTimer) clearInterval(state.messagesTimer);

      state.statusTimer = setInterval(() => {
        loadClientStatus().catch((error) => {
          setActionError(error.message || 'Не удалось обновить статус WhatsApp');
        });
      }, 5000);

      state.chatsTimer = setInterval(() => {
        if (state.busy || state.typing || state.currentClientStatus !== 'ready') {
          return;
        }

        loadChats(true, false).catch((error) => {
          setActionError(error.message || 'Не удалось обновить список чатов');
        });
      }, 7000);

      state.messagesTimer = setInterval(() => {
        if (state.busy || state.currentClientStatus !== 'ready' || !state.selectedKey) {
          return;
        }

        loadSelectedChat(true).catch((error) => {
          setActionError(error.message || 'Не удалось обновить сообщения чата');
        });
      }, 2500);
    }

    function renderStatus(client) {
      const status = client && client.status ? client.status : 'unknown';
      state.currentClientStatus = status;
      const isReady = Boolean(client && client.isReady);
      const dotClass = status === 'ready' ? 'dot ready' : status === 'auth_failure' ? 'dot error' : 'dot';
      const statusLabelMap = {
        disabled: 'выключен',
        initializing: 'инициализация',
        qr: 'ожидает QR',
        authenticated: 'авторизован',
        ready: 'готов',
        auth_failure: 'ошибка авторизации',
        disconnected: 'отключен',
        unknown: 'неизвестно'
      };

      statusPill.innerHTML = '<span class="' + dotClass + '"></span><span>' + escapeHtml(statusLabelMap[status] || status) + '</span>';
      leftStatus.textContent = isReady ? 'WhatsApp подключен' : 'WhatsApp еще не готов';

      if (!getSelectedChat()) {
        chatTitle.textContent = 'Сессия WhatsApp';
        chatMeta.textContent = client.lastError
          ? 'Последняя ошибка: ' + client.lastError
          : 'Сообщения будут отправляться с авторизованного номера';
      }

      statusText.textContent = client.lastError
        ? client.lastError
        : status === 'qr'
          ? 'Сканируйте QR код телефоном, на котором будет работать эта сессия.'
          : isReady
            ? 'WhatsApp подключен. Можно работать с чатами.'
            : 'Ожидаем запуск и авторизацию WhatsApp.';

      const hasQr = status === 'qr' && client.qrSvgDataUrl;
      qrContainer.classList.toggle('hidden', !hasQr);
      if (hasQr) {
        qrImage.src = client.qrSvgDataUrl;
      } else {
        qrImage.removeAttribute('src');
      }

      clientStatusWrap.classList.toggle('hidden', isReady);
      chatArea.classList.toggle('hidden', !isReady);

      if (!isReady) {
        setTopNote('');
        botToggle.disabled = true;
        messageInput.disabled = true;
        sendButton.disabled = true;
      }
    }

    async function loadClientStatus() {
      const payload = await request('/api/whatsapp/console/status');
      renderStatus(payload.client || {});

      if (payload.client && payload.client.isReady) {
        if (state.busy) {
          return;
        }
        await loadChats(true, false);
      } else {
        chatList.innerHTML = '<div class="muted">Чаты появятся после авторизации WhatsApp и входящих сообщений.</div>';
        messages.innerHTML = '<div class="muted">Сначала нужно подключить WhatsApp.</div>';
      }
    }

    async function loadChats(keepSelection, forceRenderMessages) {
      const previouslySelected = getSelectedChat();
      const payload = await request('/api/whatsapp/chats');
      const items = payload.items || [];
      const signature = chatSignature(items);
      const selectedStillExists = state.selectedKey && items.some((item) => item.routeKey === state.selectedKey);

      state.chats = items;
      if ((!keepSelection || !selectedStillExists) && items.length) {
        state.selectedKey = items[0].routeKey;
      }
      if (!items.length) {
        state.selectedKey = null;
      }

      if (signature !== state.lastChatsSignature) {
        state.lastChatsSignature = signature;
        renderChatList();
      } else {
        updateSelectionStyles();
      }

      const selectedAfter = getSelectedChat();
      const shouldForceMessagesReload =
        Boolean(forceRenderMessages) ||
        !previouslySelected ||
        !selectedAfter ||
        previouslySelected.routeKey !== selectedAfter.routeKey ||
        previouslySelected.lastMessageText !== selectedAfter.lastMessageText ||
        previouslySelected.currentMode !== selectedAfter.currentMode ||
        previouslySelected.currentStep !== selectedAfter.currentStep;

      await loadSelectedChat(shouldForceMessagesReload);
    }

    function updateSelectionStyles() {
      chatList.querySelectorAll('.chat-item').forEach((node) => {
        node.classList.toggle('active', node.dataset.key === state.selectedKey);
      });
    }

    function renderChatList() {
      if (!state.chats.length) {
        chatList.innerHTML = '<div class="muted">Пока нет чатов. Как только кто-то напишет на авторизованный номер, чат появится здесь.</div>';
        return;
      }

      chatList.innerHTML = state.chats.map((item) => {
        const active = item.routeKey === state.selectedKey ? 'active' : '';
        return '<div class="chat-item ' + active + '" data-key="' + escapeHtml(item.routeKey) + '">' +
          '<strong>' + escapeHtml(item.displayName || item.phoneNumber || item.normalizedPhone || 'Без имени') + '</strong>' +
          '<div class="muted">' + escapeHtml(item.phoneNumber || item.normalizedPhone || '') + '</div>' +
          '<div class="muted">' + escapeHtml(item.currentMode) + ' | ' + escapeHtml(item.currentStep || 'NEW') + '</div>' +
          '<div class="muted" style="margin-top:8px;">' + escapeHtml(item.lastMessageText || 'Сообщений пока нет') + '</div>' +
        '</div>';
      }).join('');

      chatList.querySelectorAll('.chat-item').forEach((node) => {
        node.addEventListener('click', async () => {
          const nextKey = node.dataset.key || null;
          if (!nextKey || nextKey === state.selectedKey) {
            return;
          }

          state.selectedKey = nextKey;
          updateSelectionStyles();
          setActionError('');
          await loadSelectedChat(true);
        });
      });
    }

    async function loadSelectedChat(forceMessagesReload) {
      const selected = getSelectedChat();

      if (!selected) {
        chatTitle.textContent = 'Выберите чат';
        chatMeta.textContent = 'Слева появится список диалогов';
        botToggle.disabled = true;
        botToggle.checked = false;
        messageInput.disabled = true;
        sendButton.disabled = true;
        setTopNote('');
        messages.innerHTML = '<div class="muted">Выберите чат слева.</div>';
        return;
      }

      chatTitle.textContent = selected.displayName || selected.phoneNumber || selected.normalizedPhone || 'Чат';
      chatMeta.textContent = 'Режим: ' + selected.currentMode + ' | Шаг: ' + (selected.currentStep || 'NEW');
      botToggle.disabled = false;
      botToggle.checked = Boolean(selected.currentMode === 'AUTO' && selected.botEnabled && selected.allowBotReplies);
      messageInput.disabled = false;
      sendButton.disabled = !messageInput.value.trim();
      setTopNote('');

      const cachedLastMessage = messages.dataset.lastMessageText || '';
      if (
        !forceMessagesReload &&
        messages.dataset.loadedFor === selected.routeKey &&
        cachedLastMessage === String(selected.lastMessageText || '')
      ) {
        return;
      }

      try {
        const payload = await request('/api/whatsapp/chats/' + encodeURIComponent(selected.routeKey) + '/messages');
        const items = payload.items || [];

        if (!payload.storageAvailable) {
          setTopNote('База данных сейчас недоступна, поэтому история сообщений не сохранена. Ручная отправка и переключение бота при этом работают.');
        }

        if (!items.length) {
          messages.innerHTML = '<div class="muted">' + escapeHtml(payload.storageAvailable ? 'В этом чате пока нет сохраненной истории.' : 'История сообщений временно недоступна без базы данных.') + '</div>';
        } else {
          messages.innerHTML = items.map((item) => {
            const kind = item.direction === 'IN' ? 'in' : 'out';
            const sourceLabelMap = {
              CLIENT: 'Клиент',
              BOT: 'Бот',
              OPERATOR: 'Оператор',
              SYSTEM: 'Система',
              IN: 'Входящее',
              OUT: 'Исходящее'
            };
            const sourceLabel = sourceLabelMap[item.source] || sourceLabelMap[item.direction] || 'Сообщение';

            return '<div class="msg ' + kind + '">' +
              '<div class="msg-title">' + escapeHtml(sourceLabel) + '</div>' +
              '<div>' + escapeHtml(item.text || '[пустое сообщение]') + '</div>' +
              '<div class="muted" style="margin-top:6px;">' + escapeHtml(formatDate(item.createdAt)) + '</div>' +
            '</div>';
          }).join('');
        }

        messages.dataset.loadedFor = selected.routeKey;
        messages.dataset.lastMessageText = String(selected.lastMessageText || '');
        messages.scrollTop = messages.scrollHeight;
      } catch (error) {
        messages.innerHTML = '<div class="muted">Не удалось загрузить сообщения этого чата.</div>';
        setActionError(error.message || 'Не удалось открыть чат');
      }
    }

    loginButton.addEventListener('click', login);

    passwordInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        login();
      }
    });

    refreshButton.addEventListener('click', async () => {
      setActionError('');
      await loadClientStatus();
    });

    messageInput.addEventListener('input', () => {
      state.typing = Boolean(messageInput.value.trim());
      sendButton.disabled = messageInput.disabled || !messageInput.value.trim();
    });

    messageInput.addEventListener('focus', () => {
      state.typing = true;
    });

    messageInput.addEventListener('blur', () => {
      state.typing = Boolean(messageInput.value.trim());
    });

    botToggle.addEventListener('change', async () => {
      const selected = getSelectedChat();
      if (!selected) {
        botToggle.checked = false;
        return;
      }

      const enabled = botToggle.checked;
      state.busy = true;
      botToggle.disabled = true;
      setActionError('');

      try {
        await request('/api/whatsapp/chats/' + encodeURIComponent(selected.routeKey) + '/bot-toggle', {
          method: 'POST',
          body: JSON.stringify({ enabled })
        });

        await loadChats(true, false);
      } catch (error) {
        botToggle.checked = !enabled;
        setActionError(error.message || 'Не удалось изменить режим бота');
      } finally {
        state.busy = false;
        botToggle.disabled = false;
      }
    });

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      const selected = getSelectedChat();
      if (!selected) {
        setActionError('Сначала выберите чат.');
        return;
      }

      const text = messageInput.value.trim();
      if (!text) {
        return;
      }

      state.busy = true;
      sendButton.disabled = true;
      messageInput.disabled = true;
      setActionError('');

      try {
        await request('/api/whatsapp/chats/' + encodeURIComponent(selected.routeKey) + '/send', {
          method: 'POST',
          body: JSON.stringify({ text })
        });

        messageInput.value = '';
        state.typing = false;
        await loadChats(true, true);
      } catch (error) {
        setActionError(error.message || 'Не удалось отправить сообщение');
      } finally {
        state.busy = false;
        messageInput.disabled = false;
        sendButton.disabled = !messageInput.value.trim();
      }
    });

    if (state.token) {
      loginScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      bootstrapConsole().catch(() => logout());
    }
  </script>
</body>
</html>`;

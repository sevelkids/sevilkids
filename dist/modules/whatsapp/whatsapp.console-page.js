"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WHATSAPP_CONSOLE_PAGE = void 0;
exports.WHATSAPP_CONSOLE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sevil Kids WhatsApp Console</title>
  <style>
    :root { --bg:#edf4ff; --panel:#ffffff; --line:#d6e0f5; --text:#101828; --muted:#667085; --accent:#2563eb; --accent2:#1d4ed8; --ok:#16a34a; --warn:#f59e0b; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Tahoma, sans-serif; background:linear-gradient(180deg,#eaf2ff 0%,#f8fbff 100%); color:var(--text); }
    .screen { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .hidden { display:none !important; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:22px; box-shadow:0 18px 50px rgba(37,99,235,.08); }
    .login { width:min(420px, 100%); padding:28px; }
    .login h1 { margin:0 0 8px; font-size:28px; }
    .login p { margin:0 0 18px; color:var(--muted); }
    .field { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
    .field input, textarea { width:100%; border:1px solid var(--line); border-radius:14px; padding:12px 14px; font:inherit; }
    .button { border:none; border-radius:14px; background:var(--accent); color:#fff; font-weight:700; cursor:pointer; padding:12px 18px; }
    .button.secondary { background:#eff4ff; color:var(--accent2); border:1px solid #bfd1ff; }
    .error { color:#b42318; min-height:20px; font-size:14px; }
    .app { display:grid; grid-template-columns:340px 1fr; min-height:100vh; }
    .sidebar { border-right:1px solid var(--line); background:#f8fbff; padding:18px; }
    .main { padding:18px; display:flex; flex-direction:column; gap:16px; }
    .panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; border-bottom:1px solid var(--line); }
    .status-pill { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:#eef4ff; color:#1d4ed8; font-size:13px; }
    .dot { width:10px; height:10px; border-radius:50%; background:var(--warn); }
    .dot.ready { background:var(--ok); }
    .dot.error { background:#dc2626; }
    .chat-list { padding:12px; display:flex; flex-direction:column; gap:10px; max-height:calc(100vh - 170px); overflow:auto; }
    .chat-item { padding:14px; border:1px solid var(--line); border-radius:16px; background:#fff; cursor:pointer; }
    .chat-item.active { background:#eef4ff; border-color:#9db7ff; }
    .chat-item strong { display:block; margin-bottom:6px; }
    .muted { color:var(--muted); }
    .messages { flex:1; min-height:420px; overflow:auto; display:flex; flex-direction:column; gap:10px; padding:18px; }
    .msg { max-width:74%; padding:12px 14px; border-radius:16px; white-space:pre-wrap; line-height:1.4; }
    .msg.in { align-self:flex-start; background:#eef2ff; }
    .msg.out { align-self:flex-end; background:#dbeafe; }
    .composer { display:flex; gap:10px; padding:16px 18px; border-top:1px solid var(--line); }
    textarea { min-height:80px; resize:vertical; }
    .toggle { display:flex; align-items:center; gap:10px; }
    .toggle input { width:46px; height:24px; }
    .qr-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:28px; }
    .qr-wrap img { width:320px; height:320px; max-width:min(320px, 78vw); max-height:min(320px, 78vw); border-radius:16px; border:1px solid var(--line); background:#fff; padding:10px; image-rendering: pixelated; object-fit:contain; }
    @media (max-width: 960px) { .app { grid-template-columns:1fr; } .sidebar { border-right:none; border-bottom:1px solid var(--line); } .chat-list { max-height:260px; } .msg { max-width:88%; } }
  </style>
</head>
<body>
  <section id="loginScreen" class="screen">
    <div class="card login">
      <h1>Sevil Kids Console</h1>
      <p>Login is required before opening WhatsApp chats.</p>
      <div class="field">
        <label for="loginInput">Login</label>
        <input id="loginInput" value="sevilkids" autocomplete="username" />
      </div>
      <div class="field">
        <label for="passwordInput">Password</label>
        <input id="passwordInput" type="password" value="sevil2026" autocomplete="current-password" />
      </div>
      <button id="loginButton" class="button" type="button">Enter console</button>
      <div id="loginError" class="error"></div>
    </div>
  </section>

  <section id="appScreen" class="hidden">
    <div class="app">
      <aside class="sidebar">
        <div class="card" style="height:100%;">
          <div class="panel-head">
            <div>
              <strong>Chats</strong>
              <div id="leftStatus" class="muted">Waiting for WhatsApp session</div>
            </div>
            <button id="refreshButton" class="button secondary" type="button">Refresh</button>
          </div>
          <div id="chatList" class="chat-list">
            <div class="muted">No chats yet.</div>
          </div>
        </div>
      </aside>

      <main class="main">
        <div class="card" style="display:flex; flex-direction:column; flex:1;">
          <div class="panel-head">
            <div>
              <strong id="chatTitle">WhatsApp session</strong>
              <div id="chatMeta" class="muted">Status will appear here</div>
            </div>
            <div class="toggle">
              <span class="muted">Bot enabled</span>
              <input id="botToggle" type="checkbox" disabled />
            </div>
          </div>

          <div id="clientStatusWrap" class="messages">
            <div id="statusPill" class="status-pill"><span class="dot"></span><span>Initializing</span></div>
            <div id="qrContainer" class="qr-wrap hidden">
              <div>
                <strong>Scan QR in WhatsApp</strong>
                <div class="muted">The console will unlock chats after the number is authenticated.</div>
              </div>
              <img id="qrImage" alt="WhatsApp QR" />
            </div>
            <div id="statusText" class="muted">Starting embedded WhatsApp client...</div>
          </div>

          <div id="chatArea" class="hidden" style="display:flex; flex-direction:column; flex:1;">
            <div id="messages" class="messages"><div class="muted">No chat selected yet.</div></div>
            <form id="composer" class="composer">
              <textarea id="messageInput" placeholder="Write a message to the selected chat..." disabled></textarea>
              <button id="sendButton" class="button" type="submit" disabled>Send</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  </section>

  <script>
    const state = { token: sessionStorage.getItem('console_token') || '', chats: [], selectedId: null, statusTimer: null, chatsTimer: null, busy: false };
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

    function authHeaders() {
      return state.token ? { 'X-Console-Auth': state.token } : {};
    }

    async function request(url, options) {
      const response = await fetch(url, {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        ...options
      });
      if (response.status === 401) {
        logout();
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error(await response.text() || response.statusText);
      return response.json();
    }

    function escapeHtml(value) {
      return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    }

    function logout() {
      sessionStorage.removeItem('console_token');
      state.token = '';
      loginScreen.classList.remove('hidden');
      appScreen.classList.add('hidden');
      if (state.statusTimer) clearInterval(state.statusTimer);
      if (state.chatsTimer) clearInterval(state.chatsTimer);
    }

    async function login() {
      loginError.textContent = '';
      try {
        const payload = await fetch('/api/whatsapp/console/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            login: loginInput.value.trim(),
            password: passwordInput.value.trim()
          })
        });
        if (!payload.ok) throw new Error('Wrong login or password');
        const json = await payload.json();
        state.token = json.token;
        sessionStorage.setItem('console_token', state.token);
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        await bootstrapConsole();
      } catch (error) {
        loginError.textContent = error.message || 'Login failed';
      }
    }

    async function bootstrapConsole() {
      await loadClientStatus();
      if (state.statusTimer) clearInterval(state.statusTimer);
      if (state.chatsTimer) clearInterval(state.chatsTimer);
      state.statusTimer = setInterval(loadClientStatus, 3000);
      state.chatsTimer = setInterval(() => {
        if (chatArea.classList.contains('hidden')) return;
        loadChats(true).catch(() => undefined);
      }, 4000);
    }

    function renderStatus(client) {
      const isReady = client && client.isReady;
      const dotClass = client.status === 'ready' ? 'dot ready' : client.status === 'auth_failure' ? 'dot error' : 'dot';
      statusPill.innerHTML = '<span class="' + dotClass + '"></span><span>' + escapeHtml(client.status || 'unknown') + '</span>';
      leftStatus.textContent = isReady ? 'WhatsApp connected' : 'WhatsApp is not ready yet';
      if (!state.selectedId) {
        chatMeta.textContent = client.lastError ? 'Last error: ' + client.lastError : 'Messages go from the authorized WhatsApp number';
      }
      statusText.textContent = client.lastError || (client.status === 'qr' ? 'Scan the QR code with the phone that should own this WhatsApp session.' : 'Waiting for WhatsApp authorization...');
      qrContainer.classList.toggle('hidden', !(client.status === 'qr' && client.qrSvgDataUrl));
      if (client.qrSvgDataUrl) qrImage.src = client.qrSvgDataUrl;
      clientStatusWrap.classList.toggle('hidden', isReady);
      chatArea.classList.toggle('hidden', !isReady);
      if (!isReady) {
        botToggle.disabled = true;
        messageInput.disabled = true;
        sendButton.disabled = true;
      }
    }

    async function loadClientStatus() {
      const payload = await request('/api/whatsapp/console/status');
      renderStatus(payload.client || {});
      if (payload.client && payload.client.isReady) {
        await loadChats(true);
      } else {
        chatList.innerHTML = '<div class="muted">Chats will appear after WhatsApp authorization and incoming messages.</div>';
        messages.innerHTML = '<div class="muted">Console is waiting for WhatsApp session.</div>';
      }
    }

    async function loadChats(keepSelection) {
      if (state.busy) return;
      const payload = await request('/api/whatsapp/chats');
      state.chats = payload.items || [];
      if ((!keepSelection || !state.selectedId) && state.chats.length) state.selectedId = state.chats[0].id;
      if (state.selectedId && !state.chats.some((item) => item.id === state.selectedId)) state.selectedId = state.chats[0]?.id || null;
      renderChatList();
      await loadSelectedChat();
    }

    function renderChatList() {
      if (!state.chats.length) {
        chatList.innerHTML = '<div class="muted">No chats yet. Once someone writes to the authorized WhatsApp number, the chat will appear here.</div>';
        return;
      }
      chatList.innerHTML = state.chats.map((item) => {
        const active = item.id === state.selectedId ? 'active' : '';
        return '<div class="chat-item ' + active + '" data-id="' + item.id + '">' +
          '<strong>' + escapeHtml(item.displayName || item.phoneNumber || item.normalizedPhone || 'Unknown') + '</strong>' +
          '<div class="muted">' + escapeHtml(item.phoneNumber || item.normalizedPhone || '') + '</div>' +
          '<div class="muted">' + escapeHtml(item.currentMode) + ' | ' + escapeHtml(item.currentStep || 'NEW') + '</div>' +
          '<div class="muted" style="margin-top:8px;">' + escapeHtml(item.lastMessageText || 'No messages yet') + '</div>' +
        '</div>';
      }).join('');
      chatList.querySelectorAll('.chat-item').forEach((node) => {
        node.addEventListener('click', async () => {
          state.selectedId = node.dataset.id;
          renderChatList();
          await loadSelectedChat();
        });
      });
    }

    async function loadSelectedChat() {
      const selected = state.chats.find((item) => item.id === state.selectedId);
      if (!selected) {
        chatTitle.textContent = 'Select a chat';
        chatMeta.textContent = 'Choose a chat on the left';
        botToggle.disabled = true;
        botToggle.checked = false;
        messageInput.disabled = true;
        sendButton.disabled = true;
        messages.innerHTML = '<div class="muted">No chat selected yet.</div>';
        return;
      }
      chatTitle.textContent = selected.displayName || selected.phoneNumber || selected.normalizedPhone || 'Chat';
      chatMeta.textContent = 'Mode: ' + selected.currentMode + ' | Step: ' + (selected.currentStep || 'NEW');
      botToggle.disabled = false;
      botToggle.checked = Boolean(selected.currentMode === 'AUTO' && selected.botEnabled && selected.allowBotReplies);
      messageInput.disabled = false;
      sendButton.disabled = false;

      const payload = await request('/api/whatsapp/chats/' + selected.id + '/messages');
      const items = payload.items || [];
      if (!items.length) {
        messages.innerHTML = '<div class="muted">No messages in this chat yet.</div>';
      } else {
        messages.innerHTML = items.map((item) => {
          const kind = item.direction === 'IN' ? 'in' : 'out';
          return '<div class="msg ' + kind + '">' +
            '<strong>' + escapeHtml(item.source || item.direction) + '</strong>' +
            '<div>' + escapeHtml(item.text || '[empty message]') + '</div>' +
            '<div class="muted" style="margin-top:6px;">' + escapeHtml(item.createdAt || '') + '</div>' +
          '</div>';
        }).join('');
      }
      messages.scrollTop = messages.scrollHeight;
    }

    loginButton.addEventListener('click', login);
    passwordInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login();
    });

    refreshButton.addEventListener('click', async () => {
      await loadClientStatus();
    });

    botToggle.addEventListener('change', async () => {
      if (!state.selectedId) return;
      state.busy = true;
      try {
        await request('/api/whatsapp/chats/' + state.selectedId + '/bot-toggle', {
          method: 'POST',
          body: JSON.stringify({ enabled: botToggle.checked })
        });
        await loadChats(true);
      } finally {
        state.busy = false;
      }
    });

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!state.selectedId) return;
      const text = messageInput.value.trim();
      if (!text) return;
      state.busy = true;
      sendButton.disabled = true;
      try {
        await request('/api/whatsapp/chats/' + state.selectedId + '/send', {
          method: 'POST',
          body: JSON.stringify({ text })
        });
        messageInput.value = '';
        await loadChats(true);
      } finally {
        state.busy = false;
        sendButton.disabled = false;
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
//# sourceMappingURL=whatsapp.console-page.js.map
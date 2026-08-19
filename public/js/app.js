const API = '/api';

// ---------- Tab navigation ----------
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    loadTab(btn.dataset.tab);
  });
});

function loadTab(tab) {
  if (tab === 'overview') loadOverview();
  if (tab === 'channels') loadChannels();
  if (tab === 'bookings') loadBookings();
  if (tab === 'calls') loadCalls();
  if (tab === 'services') loadServices();
  if (tab === 'settings') loadSettings();
}

// ---------- Overview ----------
async function loadOverview() {
  const res = await fetch(`${API}/settings/overview`);
  const data = await res.json();

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-value">${data.totalMessages}</div><div class="stat-label">Total Messages</div></div>
    <div class="stat-card"><div class="stat-value">${data.totalContacts}</div><div class="stat-label">Total Contacts</div></div>
    <div class="stat-card"><div class="stat-value">${data.totalBookings}</div><div class="stat-label">Total Bookings</div></div>
    <div class="stat-card"><div class="stat-value">${data.pendingCalls}</div><div class="stat-label">Pending Call Requests</div></div>
  `;

  const colors = { website: '#7b5cff', telegram: '#29a9eb', instagram: '#e1306c', whatsapp: '#25d366' };
  const max = Math.max(1, ...data.messagesByChannel.map((c) => c.c));
  document.getElementById('channel-bars').innerHTML = data.messagesByChannel
    .map(
      (c) => `
    <div class="channel-bar-row">
      <div class="channel-bar-label">${c.channel_id}</div>
      <div class="channel-bar-track"><div class="channel-bar-fill" style="width:${(c.c / max) * 100}%;background:${colors[c.channel_id] || '#ff5da2'}"></div></div>
      <div style="width:30px;text-align:right;font-size:12px;color:var(--muted)">${c.c}</div>
    </div>`
    )
    .join('') || '<div class="muted">No messages yet.</div>';
}

// ---------- Channels ----------
let activeChannelId = null;
let activeContactId = null;

async function loadChannels() {
  const res = await fetch(`${API}/channels`);
  const channels = await res.json();
  const gradients = {
    website: 'linear-gradient(135deg,#7b5cff,#5c3dcf)',
    telegram: 'linear-gradient(135deg,#29a9eb,#1c7fb5)',
    instagram: 'linear-gradient(135deg,#e1306c,#c13584)',
    whatsapp: 'linear-gradient(135deg,#25d366,#128c7e)',
  };
  const roseIcon = '<svg class="channel-icon" viewBox="0 0 64 64"><use href="#rose-icon"/></svg>';

  document.getElementById('channel-grid').innerHTML = channels
    .map(
      (c) => `
    <div class="channel-card" style="background:${gradients[c.id] || '#333'}" data-id="${c.id}">
      <div class="icon">${roseIcon}</div>
      <div class="name">${c.name}</div>
      <div class="meta">${c.contactCount} conversations • ${c.messageCount} messages</div>
      <div class="meta">${c.lastMessage ? 'Last: ' + escapeHtml(c.lastMessage.body).slice(0, 40) : 'No messages yet'}</div>
    </div>`
    )
    .join('');

  document.querySelectorAll('.channel-card').forEach((card) => {
    card.addEventListener('click', () => openChannel(card.dataset.id));
  });
}

async function openChannel(channelId) {
  activeChannelId = channelId;
  document.getElementById('conversation-view').style.display = 'grid';
  const res = await fetch(`${API}/channels/${channelId}/contacts`);
  const contacts = await res.json();

  document.getElementById('contact-list').innerHTML =
    contacts
      .map(
        (c) => `
    <div class="contact-item" data-id="${c.id}">
      <div class="cname">${escapeHtml(c.name || c.phone || c.external_id)}</div>
      <div class="clast">${escapeHtml(c.last_message || '')}</div>
    </div>`
      )
      .join('') || '<div class="muted" style="padding:12px;">No conversations yet</div>';

  document.querySelectorAll('.contact-item').forEach((item) => {
    item.addEventListener('click', () => openThread(item.dataset.id));
  });
}

async function openThread(contactId) {
  activeContactId = contactId;
  document.querySelectorAll('.contact-item').forEach((i) => i.classList.toggle('active', i.dataset.id === contactId));

  const res = await fetch(`${API}/messages/thread/${contactId}`);
  const { contact, messages } = await res.json();

  document.getElementById('thread-view').innerHTML = `
    <div class="thread-messages" id="thread-messages">
      ${messages
        .map(
          (m) => `
        <div class="msg ${m.direction}">
          ${escapeHtml(m.body)}
          <div class="meta">${m.sender || ''} • ${m.created_at}</div>
        </div>`
        )
        .join('')}
    </div>
    <div class="thread-reply-row">
      <input id="reply-input" placeholder="Type a reply to ${escapeHtml(contact.name || contact.phone || 'customer')}..." />
      <button class="btn btn-primary" id="reply-send-btn">Send</button>
    </div>
  `;
  const box = document.getElementById('thread-messages');
  box.scrollTop = box.scrollHeight;

  document.getElementById('reply-send-btn').addEventListener('click', sendAdminReply);
  document.getElementById('reply-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendAdminReply();
  });
}

async function sendAdminReply() {
  const input = document.getElementById('reply-input');
  const text = input.value.trim();
  if (!text) return;
  await fetch(`${API}/messages/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: activeChannelId, contactId: activeContactId, text }),
  });
  input.value = '';
  openThread(activeContactId);
}

// ---------- Bookings ----------
async function loadBookings() {
  const res = await fetch(`${API}/bookings`);
  const bookings = await res.json();
  const tbody = document.querySelector('#bookings-table tbody');
  tbody.innerHTML = bookings
    .map(
      (b) => `
    <tr>
      <td>${escapeHtml(b.customer_name || '-')}</td>
      <td>${escapeHtml(b.customer_phone || '-')}</td>
      <td>${escapeHtml(b.name_en || '-')}</td>
      <td>${escapeHtml((b.requested_date || '') + ' ' + (b.requested_time || ''))}</td>
      <td>${escapeHtml(b.channel_name || '-')}</td>
      <td>
        <select class="status-select" data-id="${b.id}">
          ${['pending', 'confirmed', 'done', 'cancelled']
            .map((s) => `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`)
            .join('')}
        </select>
      </td>
    </tr>`
    )
    .join('') || `<tr><td colspan="6" class="muted">No bookings yet</td></tr>`;

  document.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await fetch(`${API}/bookings/${sel.dataset.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
    });
  });
}

// ---------- Calls ----------
async function loadCalls() {
  const res = await fetch(`${API}/calls`);
  const calls = await res.json();
  const tbody = document.querySelector('#calls-table tbody');
  tbody.innerHTML = calls
    .map(
      (c) => `
    <tr>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.reason || '-')}</td>
      <td>${escapeHtml(c.registered_at)}</td>
      <td><input type="checkbox" class="called-checkbox" data-id="${c.id}" ${c.called ? 'checked' : ''} /></td>
    </tr>`
    )
    .join('') || `<tr><td colspan="4" class="muted">No call requests yet</td></tr>`;

  document.querySelectorAll('.called-checkbox').forEach((cb) => {
    cb.addEventListener('change', async () => {
      await fetch(`${API}/calls/${cb.dataset.id}/called`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ called: cb.checked }),
      });
    });
  });
}

document.getElementById('add-call-btn').addEventListener('click', async () => {
  const phone = document.getElementById('call-phone').value.trim();
  const reason = document.getElementById('call-reason').value.trim();
  if (!phone) return;
  await fetch(`${API}/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, reason }),
  });
  document.getElementById('call-phone').value = '';
  document.getElementById('call-reason').value = '';
  loadCalls();
});

// ---------- Services ----------
async function loadServices() {
  const res = await fetch(`${API}/services`);
  const services = await res.json();
  const tbody = document.querySelector('#services-table tbody');
  tbody.innerHTML = services
    .map(
      (s) => `
    <tr data-id="${s.id}">
      <td><input type="text" class="edit-en" value="${escapeHtml(s.name_en)}" /></td>
      <td><input type="text" class="edit-fa" value="${escapeHtml(s.name_fa)}" /></td>
      <td><input type="number" class="edit-price" value="${s.price}" /></td>
      <td><input type="number" class="edit-duration" value="${s.duration_minutes}" /></td>
      <td><input type="checkbox" class="edit-active" ${s.active ? 'checked' : ''} /></td>
      <td><button class="btn btn-ghost save-service-btn">Save</button></td>
    </tr>`
    )
    .join('');

  document.querySelectorAll('.save-service-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      await fetch(`${API}/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_en: row.querySelector('.edit-en').value,
          name_fa: row.querySelector('.edit-fa').value,
          price: parseFloat(row.querySelector('.edit-price').value),
          duration_minutes: parseInt(row.querySelector('.edit-duration').value, 10),
          active: row.querySelector('.edit-active').checked,
        }),
      });
      loadServices();
    });
  });
}

document.getElementById('add-service-btn').addEventListener('click', async () => {
  const name_en = document.getElementById('svc-en').value.trim();
  const name_fa = document.getElementById('svc-fa').value.trim();
  const price = parseFloat(document.getElementById('svc-price').value);
  const duration_minutes = parseInt(document.getElementById('svc-duration').value, 10) || 60;
  if (!name_en || !name_fa || isNaN(price)) return;
  await fetch(`${API}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name_en, name_fa, price, duration_minutes }),
  });
  document.getElementById('svc-en').value = '';
  document.getElementById('svc-fa').value = '';
  document.getElementById('svc-price').value = '';
  document.getElementById('svc-duration').value = '';
  loadServices();
});

// ---------- Settings ----------
async function loadSettings() {
  const res = await fetch(`${API}/settings`);
  const s = await res.json();
  document.getElementById('set-salon-name').value = s.salon_name || '';
  document.getElementById('set-admin-phone').value = s.admin_phone || '';
  document.getElementById('set-working-hours').value = s.working_hours || '';
  document.getElementById('set-ai-mode').value = s.ai_mode || 'local';
}

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  await fetch(`${API}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      salon_name: document.getElementById('set-salon-name').value,
      admin_phone: document.getElementById('set-admin-phone').value,
      working_hours: document.getElementById('set-working-hours').value,
      ai_mode: document.getElementById('set-ai-mode').value,
    }),
  });
  alert('Settings saved ✅');
});

// ---------- Test website chat widget ----------
const visitorId = 'visitor-' + Math.random().toString(36).slice(2, 10);
document.getElementById('chat-send').addEventListener('click', sendWidgetMessage);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendWidgetMessage();
});

async function sendWidgetMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  appendChatBubble(text, 'out');
  input.value = '';

  const res = await fetch(`${API}/messages/website/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId, name: 'Website Visitor', text }),
  });
  const { reply } = await res.json();
  appendChatBubble(reply, 'in');
}

function appendChatBubble(text, direction) {
  const log = document.getElementById('chat-log');
  const div = document.createElement('div');
  div.className = `msg ${direction}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// initial load
loadOverview();

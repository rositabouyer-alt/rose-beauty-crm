const API = '/api';

// ---------------- language toggle ----------------
let currentLang = 'fa';
const htmlRoot = document.getElementById('html-root');

function applyLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-fa][data-en]').forEach((el) => {
    el.innerHTML = lang === 'fa' ? el.dataset.fa : el.dataset.en;
  });
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.placeholder = lang === 'fa' ? chatInput.dataset.faPh : chatInput.dataset.enPh;
  }
}

document.getElementById('lang-toggle').addEventListener('click', () => {
  applyLang(currentLang === 'fa' ? 'en' : 'fa');
});

// ---------------- live services from the real CRM API ----------------
const ROSE_ICON_SVG = '<svg viewBox="0 0 64 64" width="22" height="22"><use href="#rose-icon-web"/></svg>';

function formatPrice(p) {
  return Number(p).toLocaleString('en-US') + ' T';
}

async function loadServices() {
  try {
    const res = await fetch(`${API}/services`);
    const services = (await res.json()).filter((s) => s.active);
    const grid = document.getElementById('services-grid');
    grid.innerHTML = services
      .map(
        (s) => `
      <div class="service-card">
        <div class="service-icon">${ROSE_ICON_SVG}</div>
        <div class="service-name" data-fa="${escapeHtml(s.name_fa)}" data-en="${escapeHtml(s.name_en)}">${escapeHtml(currentLang === 'fa' ? s.name_fa : s.name_en)}</div>
        <div class="service-meta" data-fa="حدود ${s.duration_minutes} دقیقه" data-en="About ${s.duration_minutes} minutes">حدود ${s.duration_minutes} دقیقه</div>
        <div class="service-price">${formatPrice(s.price)}</div>
        <button class="service-select-btn" data-service-en="${escapeHtml(s.name_en)}" data-fa="این خدمت رو رزرو کن" data-en="Book this service">این خدمت رو رزرو کن</button>
      </div>`
      )
      .join('');

    grid.querySelectorAll('.service-select-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openChat();
        const msg = currentLang === 'fa'
          ? `می‌خوام این خدمت رو رزرو کنم: ${btn.dataset.serviceEn}`
          : `I want to book: ${btn.dataset.serviceEn}`;
        sendChatMessage(msg);
      });
    });
    applyLang(currentLang);
  } catch (err) {
    console.error('Failed to load services', err);
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------- chat widget wired to the real CRM booking/AI engine ----------------
const launcher = document.getElementById('chat-launcher');
const panel = document.getElementById('chat-panel');
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

let visitorId = localStorage.getItem('rb_visitor_id');
if (!visitorId) {
  visitorId = 'visitor-' + Math.random().toString(36).slice(2, 12);
  localStorage.setItem('rb_visitor_id', visitorId);
}

function openChat() {
  panel.classList.add('open');
  if (chatLog.children.length === 0) {
    addBotMessage(
      currentLang === 'fa'
        ? 'سلام 🌹 به رز بیوتی خوش اومدید! من رز هستم، دستیار هوشمند سالن. می‌تونم درباره‌ی خدمات، قیمت‌ها و رزرو نوبت کمکتون کنم.'
        : 'Hi 🌹 Welcome to Rose Beauty! I\'m Rose, the salon\'s smart assistant. I can help with services, prices, and booking an appointment.'
    );
  }
  chatInput.focus();
}
function closeChat() { panel.classList.remove('open'); }

launcher.addEventListener('click', () => (panel.classList.contains('open') ? closeChat() : openChat()));
document.getElementById('chat-close-btn').addEventListener('click', closeChat);
document.getElementById('nav-book-btn').addEventListener('click', openChat);
document.getElementById('hero-book-btn').addEventListener('click', openChat);
document.getElementById('visit-book-btn').addEventListener('click', openChat);

document.getElementById('chat-suggestions').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) sendChatMessage(currentLang === 'fa' ? chip.dataset.fa : chip.dataset.en);
});

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-msg user';
  div.textContent = text;
  chatLog.appendChild(div);
  scrollChat();
}
function addBotMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.textContent = text;
  chatLog.appendChild(div);
  scrollChat();
}
function showTyping() {
  const div = document.createElement('div');
  div.className = 'chat-msg chat-typing';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="bubble-dots"><span></span><span></span><span></span></div>`;
  chatLog.appendChild(div);
  scrollChat();
}
function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}
function scrollChat() { chatLog.scrollTop = chatLog.scrollHeight; }

async function sendChatMessage(text) {
  if (!text || !text.trim()) return;
  addUserMessage(text);
  showTyping();
  try {
    const res = await fetch(`${API}/messages/website/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, name: 'Website Visitor', text }),
    });
    const data = await res.json();
    hideTyping();
    addBotMessage(data.reply || (currentLang === 'fa' ? 'متاسفم، مشکلی پیش اومد.' : 'Sorry, something went wrong.'));
  } catch (err) {
    hideTyping();
    addBotMessage(currentLang === 'fa' ? '⚠️ خطا در اتصال به سرور.' : '⚠️ Connection error.');
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  sendChatMessage(text);
});

// ---------------- init ----------------
applyLang('fa');
loadServices();

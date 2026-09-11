(function() {
'use strict';
if (window.__chatBubbleLoaded) return;
window.__chatBubbleLoaded = true;
const API = '';
let currentChat = null;
let pollTimer = null;
let _lastMsgCount = -1;
let _lastStatus = null;
let _lastChatId = null;
let agentCode = '', agentName = '';
function getAgent() {
  try {
    const raw = localStorage.getItem('CARGO_BIDDING_DATA_V3');
    if (raw) {
      const d = JSON.parse(raw);
      const u = d.currentUser;
      if (u && u.role === 'agent' && u.agentCode) {
        agentCode = u.agentCode;
        agentName = u.companyName || u.fullName || u.agentCode;
        return;
      }
    }
  } catch(e) {}
  try { const s = JSON.parse(localStorage.getItem('cargoAgentSession') || '{}'); agentCode = s.code || s.agentCode || ''; agentName = s.companyName || s.name || agentCode; } catch(e) {}
}
const QUICK_REPLIES = [
  'Tôi cần hỗ trợ về thanh toán',
  'Báo lỗi hệ thống đấu giá',
  'Hỏi về thủ tục vận chuyển hàng hóa',
  'Cần hỗ trợ khẩn cấp'
];
function injectStyles() {
  if (document.getElementById('__chat-bubble-css')) return;
  const s = document.createElement('style');
  s.id = '__chat-bubble-css';
  s.textContent = `
#__cb-btn{position:fixed;bottom:24px;right:24px;z-index:99999;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(124,58,237,.5);display:flex;align-items:center;justify-content:center;font-size:22px;transition:transform .2s,box-shadow .2s}
#__cb-btn:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(124,58,237,.7)}
#__cb-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff}
#__cb-modal{position:fixed;bottom:90px;right:24px;z-index:99998;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 110px);background:linear-gradient(145deg,#0f172a,#1e1b4b);border:1px solid rgba(124,58,237,.3);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.6);display:none;flex-direction:column;overflow:hidden;font-family:'Inter',sans-serif}
#__cb-modal.open{display:flex}
.__cb-hdr{background:linear-gradient(90deg,#1e40af,#7c3aed);padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.__cb-hdr-ico{width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff}
.__cb-hdr-info{flex:1}
.__cb-hdr-title{color:#fff;font-weight:700;font-size:14px;margin:0}
.__cb-hdr-sub{color:rgba(255,255,255,.7);font-size:11px;margin:0}
.__cb-close{background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:18px;padding:4px;border-radius:6px}
.__cb-close:hover{color:#fff;background:rgba(255,255,255,.1)}
.__cb-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:rgba(124,58,237,.3) transparent}
.__cb-body::-webkit-scrollbar{width:4px}.__cb-body::-webkit-scrollbar-thumb{background:rgba(124,58,237,.4);border-radius:2px}
.__cb-start{display:flex;flex-direction:column;gap:10px;padding:8px 0}
.__cb-start-title{color:#a5b4fc;font-size:13px;font-weight:600;text-align:center}
.__cb-qr{background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.3);color:#c4b5fd;border-radius:10px;padding:8px 12px;cursor:pointer;font-size:12.5px;text-align:left;transition:all .15s}
.__cb-qr:hover{background:rgba(124,58,237,.3);color:#fff;border-color:#7c3aed}
.__cb-input-row{display:flex;gap:6px;flex-shrink:0}
.__cb-custom-inp{flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#e2e8f0;padding:8px 12px;font-size:13px;outline:none;resize:none;font-family:inherit}
.__cb-custom-inp::placeholder{color:rgba(255,255,255,.35)}
.__cb-custom-inp:focus{border-color:#7c3aed;background:rgba(124,58,237,.1)}
.__cb-send-btn{background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;border:none;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:14px;flex-shrink:0;transition:opacity .15s}
.__cb-send-btn:hover{opacity:.85}.__cb-send-btn:disabled{opacity:.4;cursor:not-allowed}
.__cb-wait{text-align:center;padding:20px 10px;color:#a5b4fc}
.__cb-wait-ico{font-size:40px;margin-bottom:8px;animation:__cb-pulse 1.5s ease-in-out infinite}
@keyframes __cb-pulse{0%,100%{opacity:1}50%{opacity:.4}}
.__cb-wait-title{font-size:14px;font-weight:600;color:#c4b5fd;margin:0 0 6px}
.__cb-wait-sub{font-size:12px;color:rgba(255,255,255,.5);margin:0}
.__cb-msg{max-width:80%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.5;word-break:break-word}
.__cb-msg.agent{align-self:flex-end;background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;border-bottom-right-radius:4px}
.__cb-msg.staff{align-self:flex-start;background:rgba(255,255,255,.1);color:#e2e8f0;border-bottom-left-radius:4px}
.__cb-msg.system{align-self:center;background:rgba(245,158,11,.1);color:#fcd34d;border:1px solid rgba(245,158,11,.25);border-radius:8px;font-size:11.5px;text-align:center;max-width:90%;padding:6px 10px}
.__cb-msg-time{font-size:10px;opacity:.5;margin-top:3px;text-align:right}
.__cb-footer{padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:6px;flex-shrink:0}
.__cb-attach-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#a5b4fc;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:5px;transition:all .15s}
.__cb-attach-btn:hover{background:rgba(124,58,237,.2);border-color:#7c3aed;color:#c4b5fd}
.__cb-closed-banner{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;color:#fca5a5;padding:12px;text-align:center;font-size:12.5px}
.__cb-closed-banner button{margin-top:8px;background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px}
.__cb-file-preview img{max-width:100%;max-height:150px;border-radius:8px;margin-top:4px;cursor:pointer}
.__cb-file-preview video{max-width:100%;max-height:150px;border-radius:8px;margin-top:4px}
.__cb-file-preview a{color:#93c5fd;font-size:12px;display:inline-flex;align-items:center;gap:4px;margin-top:4px;text-decoration:none}
.__cb-file-preview a:hover{color:#fff}
`;
  document.head.appendChild(s);
}
function injectHTML() {
  if (document.getElementById('__cb-btn')) return;
  document.body.insertAdjacentHTML('beforeend', `
<button id="__cb-btn" onclick="__cbToggle()" title="Chat hỗ trợ">
  <span style="font-size:22px">💬</span>
  <span id="__cb-badge"></span>
</button>
<div id="__cb-modal">
  <div class="__cb-hdr">
    <div class="__cb-hdr-ico">🎧</div>
    <div class="__cb-hdr-info">
      <p class="__cb-hdr-title">Hỗ trợ trực tuyến</p>
      <p class="__cb-hdr-sub" id="__cb-status-txt">Sẵn sàng hỗ trợ 24/7</p>
    </div>
    <button class="__cb-close" onclick="__cbToggle()">✕</button>
  </div>
  <div class="__cb-body" id="__cb-body"></div>
  <div class="__cb-footer" id="__cb-footer" style="display:none">
    <div style="display:flex;gap:6px;align-items:flex-end">
      <textarea id="__cb-inp" class="__cb-custom-inp" rows="2" placeholder="Nhập tin nhắn..."></textarea>
      <button class="__cb-send-btn" onclick="__cbSendText()" id="__cb-send-btn">➤</button>
    </div>
    <div style="display:flex;gap:6px">
      <label class="__cb-attach-btn" for="__cb-file-inp">📎 Đính kèm</label>
      <input type="file" id="__cb-file-inp" style="display:none" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" onchange="__cbUploadFile(this)">
    </div>
  </div>
</div>`);
  document.getElementById('__cb-inp').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); __cbSendText(); }
  });
}
function __cbToggle() {
  const modal = document.getElementById('__cb-modal');
  if (!modal) return;
  const open = modal.classList.toggle('open');
  if (open) { getAgent(); __cbRender(); __cbMarkRead(); }
}
window.__cbToggle = __cbToggle;
function fmtTime(ts) {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
}
function filePreviewHTML(msg) {
  if (!msg.fileUrl) return '';
  const url = msg.fileUrl;
  const name = msg.fileName || 'file';
  const type = msg.fileType || '';
  if (type === 'image') return `<div class="__cb-file-preview"><img src="${url}" onclick="window.open('${url}','_blank')" alt="${name}"></div>`;
  if (type === 'video') return `<div class="__cb-file-preview"><video src="${url}" controls></video></div>`;
  return `<div class="__cb-file-preview"><a href="${url}" target="_blank">📄 ${name}</a></div>`;
}
function __cbRender() {
  const body = document.getElementById('__cb-body');
  const footer = document.getElementById('__cb-footer');
  const statusTxt = document.getElementById('__cb-status-txt');
  if (!body) return;
  if (!agentCode) {
    body.innerHTML = `<div class="__cb-wait"><div class="__cb-wait-ico">🔒</div><p class="__cb-wait-title">Vui lòng đăng nhập</p><p class="__cb-wait-sub">để sử dụng chat hỗ trợ</p></div>`;
    if (footer) footer.style.display = 'none';
    return;
  }
  if (!currentChat) {
    body.innerHTML = `<div class="__cb-start">
      <p class="__cb-start-title">🎧 Xin chào! Chúng tôi có thể giúp gì cho bạn?</p>
      ${QUICK_REPLIES.map(q=>`<button class="__cb-qr" onclick="__cbStartWithText('${q.replace(/'/g,"\\'")}')">💬 ${q}</button>`).join('')}
      <div class="__cb-input-row" style="margin-top:6px">
        <textarea id="__cb-custom-inp" class="__cb-custom-inp" rows="2" placeholder="Hoặc nhập vấn đề của bạn..."></textarea>
        <button class="__cb-send-btn" onclick="__cbStartCustom()">➤</button>
      </div>
    </div>`;
    if (footer) footer.style.display = 'none';
    if (statusTxt) statusTxt.textContent = 'Sẵn sàng hỗ trợ 24/7';
    return;
  }
  if (currentChat.status === 'WAITING') {
    body.innerHTML = `<div class="__cb-wait">
      <div class="__cb-wait-ico">⏳</div>
      <p class="__cb-wait-title">Đã gửi yêu cầu hỗ trợ!</p>
      <p class="__cb-wait-sub">Nhân viên sẽ phản hồi trong thời gian sớm nhất.<br>Vui lòng chờ...</p>
    </div>`;
    if (footer) footer.style.display = 'none';
    if (statusTxt) statusTxt.textContent = 'Đang chờ nhân viên...';
    return;
  }
  if (currentChat.status === 'CLOSED') {
    let msgs = (currentChat.messages || []).map(m => {
      const side = m.sender === 'agent' ? 'agent' : (m.sender === 'system' ? 'system' : 'staff');
      return `<div class="__cb-msg ${side}">${m.text ? m.text : ''}${filePreviewHTML(m)}<div class="__cb-msg-time">${fmtTime(m.timestamp)}</div></div>`;
    }).join('');
    body.innerHTML = msgs + `<div class="__cb-closed-banner">✅ Cuộc trò chuyện đã kết thúc<br><small>Phiên này sẽ tự xóa sau 7 ngày</small><br><button onclick="__cbNewChat()">Mở cuộc trò chuyện mới</button></div>`;
    if (footer) footer.style.display = 'none';
    if (statusTxt) statusTxt.textContent = 'Đã đóng';
    setTimeout(() => { body.scrollTop = body.scrollHeight; }, 50);
    return;
  }
  if (currentChat.status === 'ACTIVE') {
    const msgs = currentChat.messages || [];
    const currentMsgCount = msgs.length;
    const chatChanged = _lastChatId !== currentChat.id || _lastStatus !== 'ACTIVE';
    if (footer) footer.style.display = 'flex';
    const name = currentChat.assignedName || 'Nhân viên';
    if (statusTxt) statusTxt.textContent = `${name} đang hỗ trợ`;
    if (chatChanged) {
      // Full re-render only when chat changes
      body.innerHTML = msgs.map(m => {
        const side = m.sender === 'agent' ? 'agent' : (m.sender === 'system' ? 'system' : 'staff');
        return `<div class="__cb-msg ${side}">${m.text ? m.text.replace(/</g,'&lt;') : ''}${filePreviewHTML(m)}<div class="__cb-msg-time">${fmtTime(m.timestamp)}</div></div>`;
      }).join('');
      _lastMsgCount = currentMsgCount;
      _lastChatId = currentChat.id;
      _lastStatus = 'ACTIVE';
      setTimeout(() => { body.scrollTop = body.scrollHeight; }, 50);
    } else if (currentMsgCount > _lastMsgCount) {
      // Append only new messages — no flicker!
      const newMsgs = msgs.slice(_lastMsgCount);
      const wasAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
      newMsgs.forEach(m => {
        const side = m.sender === 'agent' ? 'agent' : (m.sender === 'system' ? 'system' : 'staff');
        const el = document.createElement('div');
        el.className = `__cb-msg ${side}`;
        el.innerHTML = (m.text ? m.text.replace(/</g,'&lt;') : '') + filePreviewHTML(m) + `<div class="__cb-msg-time">${fmtTime(m.timestamp)}</div>`;
        body.appendChild(el);
      });
      _lastMsgCount = currentMsgCount;
      if (wasAtBottom) body.scrollTop = body.scrollHeight;
    }
    return;
  }
}
window.__cbStartWithText = async function(text) {
  if (!agentCode) return;
  try {
    const r = await fetch(API+'/api/chat/create', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentCode,agentName,text})});
    const d = await r.json();
    if (d.success) { currentChat = d.chat; __cbRender(); __cbStartPoll(); }
  } catch(e) { console.error(e); }
};
window.__cbStartCustom = async function() {
  const inp = document.getElementById('__cb-custom-inp');
  if (!inp || !inp.value.trim()) return;
  await window.__cbStartWithText(inp.value.trim());
};
window.__cbSendText = async function() {
  if (!currentChat || currentChat.status === 'CLOSED') return;
  const inp = document.getElementById('__cb-inp');
  if (!inp || !inp.value.trim()) return;
  const text = inp.value.trim();
  inp.value = '';
  try {
    const r = await fetch(API+'/api/chat/send', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId:currentChat.id,sender:'agent',senderName:agentName,text})});
    const d = await r.json();
    if (d.success && d.message) { if (!currentChat.messages) currentChat.messages = []; currentChat.messages.push(d.message); __cbRender(); }
  } catch(e) { console.error(e); }
};
window.__cbUploadFile = async function(input) {
  if (!input.files || !input.files[0] || !currentChat) return;
  const file = input.files[0];
  const form = new FormData();
  form.append('file', file);
  try {
    const r = await fetch(API+'/api/upload', {method:'POST',body:form});
    const d = await r.json();
    if (!d.success) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const imgExts = ['jpg','jpeg','png','gif','webp'];
    const vidExts = ['mp4','webm','mov'];
    const fileType = imgExts.includes(ext) ? 'image' : vidExts.includes(ext) ? 'video' : 'file';
    const r2 = await fetch(API+'/api/chat/send', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId:currentChat.id,sender:'agent',senderName:agentName,text:null,fileUrl:d.url,fileName:d.name,fileType})});
    const d2 = await r2.json();
    if (d2.success && d2.message) { if (!currentChat.messages) currentChat.messages = []; currentChat.messages.push(d2.message); __cbRender(); }
  } catch(e) { console.error(e); }
  input.value = '';
};
window.__cbNewChat = function() { currentChat = null; _lastMsgCount = -1; _lastStatus = null; _lastChatId = null; __cbRender(); };
function __cbMarkRead() {
  if (currentChat && currentChat.id) {
    fetch(API+'/api/chat/read', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId:currentChat.id,readerRole:'agent'})}).catch(()=>{});
  }
}
async function __cbPoll() {
  if (!agentCode) return;
  try {
    const r = await fetch(API+'/api/chat?agentCode='+encodeURIComponent(agentCode));
    const d = await r.json();
    if (!d.success) return;
    const active = (d.chats || []).find(c => c.status !== 'CLOSED');
    const closed = (d.chats || []).find(c => c.status === 'CLOSED');
    const chat = active || closed || null;
    const prevStatus = currentChat ? currentChat.status : null;
    const prevMsgCount = currentChat && currentChat.messages ? currentChat.messages.length : 0;
    const prevId = currentChat ? currentChat.id : null;
    currentChat = chat;
    const modal = document.getElementById('__cb-modal');
    const isOpen = modal && modal.classList.contains('open');
    const newStatus = chat ? chat.status : null;
    const newMsgCount = chat && chat.messages ? chat.messages.length : 0;
    const newId = chat ? chat.id : null;
    // Only re-render if something actually changed (prevents flicker on idle polls)
    const somethingChanged = prevStatus !== newStatus || prevMsgCount !== newMsgCount || prevId !== newId;
    if (isOpen && somethingChanged) __cbRender();
    const hasNewMsg = newMsgCount > prevMsgCount;
    const badge = document.getElementById('__cb-badge');
    if (badge) {
      if (!isOpen && hasNewMsg && chat && chat.status === 'ACTIVE') {
        const unread = (chat.messages || []).filter(m => m.sender !== 'agent' && !m.read).length;
        if (unread > 0) { badge.textContent = unread; badge.style.display = 'flex'; } else { badge.style.display = 'none'; }
      } else if (isOpen) { badge.style.display = 'none'; __cbMarkRead(); }
    }
  } catch(e) {}
}
function __cbStartPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(__cbPoll, 4000);
}
function init() {
  injectStyles();
  getAgent();
  injectHTML();
  if (agentCode) {
    fetch(API+'/api/chat?agentCode='+encodeURIComponent(agentCode)).then(r=>r.json()).then(d=>{
      if (d.success && d.chats && d.chats.length > 0) {
        const active = d.chats.find(c => c.status !== 'CLOSED');
        currentChat = active || d.chats[0] || null;
      }
      __cbStartPoll();
    }).catch(()=>{ __cbStartPoll(); });
  } else {
    __cbStartPoll();
  }
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();


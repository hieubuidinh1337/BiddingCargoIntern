const fs = require('fs');
let c = fs.readFileSync('assets/js/chat-bubble.js', 'utf8');

// Replace the entire __cbRender function and __cbPoll to use smart incremental update
const oldRender = `function __cbRender() {
  const body = document.getElementById('__cb-body');
  const footer = document.getElementById('__cb-footer');
  const statusTxt = document.getElementById('__cb-status-txt');
  if (!body) return;
  if (!agentCode) {
    body.innerHTML = \`<div class="__cb-wait"><div class="__cb-wait-ico">🔒</div><p class="__cb-wait-title">Vui lòng đăng nhập</p><p class="__cb-wait-sub">để sử dụng chat hỗ trợ</p></div>\`;
    if (footer) footer.style.display = 'none';
    return;
  }
  if (!currentChat) {`;

if (c.indexOf(oldRender) === -1) {
  console.log('Could not find __cbRender - trying alternative patch');
} else {
  console.log('Found __cbRender - will patch');
}

// Strategy: add a tracking variable and patch __cbPoll to do smart render
// We'll add lastRenderedMsgCount and lastRenderedStatus variables
// And modify __cbPoll to skip innerHTML rewrite if nothing changed

// Add tracking vars after 'let pollTimer = null;'
c = c.replace('let pollTimer = null;', 
  'let pollTimer = null;\nlet _lastMsgCount = -1;\nlet _lastStatus = null;\nlet _lastChatId = null;');

// Patch the ACTIVE render section to append-only instead of full re-render
// Find the ACTIVE render block and replace with smart version
const activeRenderOld = `  if (currentChat.status === 'ACTIVE') {
    let msgs = (currentChat.messages || []).map(m => {
      const side = m.sender === 'agent' ? 'agent' : (m.sender === 'system' ? 'system' : 'staff');
      return \`<div class="__cb-msg \${side}">\${m.text ? m.text.replace(/</g,'&lt;') : ''}\${filePreviewHTML(m)}<div class="__cb-msg-time">\${fmtTime(m.timestamp)}</div></div>\`;
    }).join('');
    body.innerHTML = msgs;
    if (footer) footer.style.display = 'flex';
    const name = currentChat.assignedName || 'Nhân viên';
    if (statusTxt) statusTxt.textContent = \`\${name} đang hỗ trợ\`;
    setTimeout(() => { body.scrollTop = body.scrollHeight; }, 50);
    return;
  }`;

const activeRenderNew = `  if (currentChat.status === 'ACTIVE') {
    const msgs = currentChat.messages || [];
    const currentMsgCount = msgs.length;
    const chatChanged = _lastChatId !== currentChat.id || _lastStatus !== 'ACTIVE';
    if (footer) footer.style.display = 'flex';
    const name = currentChat.assignedName || 'Nhân viên';
    if (statusTxt) statusTxt.textContent = \`\${name} đang hỗ trợ\`;
    if (chatChanged) {
      // Full re-render only when chat changes
      body.innerHTML = msgs.map(m => {
        const side = m.sender === 'agent' ? 'agent' : (m.sender === 'system' ? 'system' : 'staff');
        return \`<div class="__cb-msg \${side}">\${m.text ? m.text.replace(/</g,'&lt;') : ''}\${filePreviewHTML(m)}<div class="__cb-msg-time">\${fmtTime(m.timestamp)}</div></div>\`;
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
        el.className = \`__cb-msg \${side}\`;
        el.innerHTML = (m.text ? m.text.replace(/</g,'&lt;') : '') + filePreviewHTML(m) + \`<div class="__cb-msg-time">\${fmtTime(m.timestamp)}</div>\`;
        body.appendChild(el);
      });
      _lastMsgCount = currentMsgCount;
      if (wasAtBottom) body.scrollTop = body.scrollHeight;
    }
    return;
  }`;

if (c.indexOf(activeRenderOld) !== -1) {
  c = c.replace(activeRenderOld, activeRenderNew);
  console.log('Patched ACTIVE render to incremental');
} else {
  console.log('WARNING: Could not find ACTIVE render block');
}

// Also patch __cbPoll to only call __cbRender when something changed (for non-ACTIVE states)
const pollOld = `    const prevStatus = currentChat ? currentChat.status : null;
    const prevMsgCount = currentChat && currentChat.messages ? currentChat.messages.length : 0;
    currentChat = chat;
    const modal = document.getElementById('__cb-modal');
    const isOpen = modal && modal.classList.contains('open');
    if (isOpen) __cbRender();`;

const pollNew = `    const prevStatus = currentChat ? currentChat.status : null;
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
    if (isOpen && somethingChanged) __cbRender();`;

if (c.indexOf(pollOld) !== -1) {
  c = c.replace(pollOld, pollNew);
  console.log('Patched __cbPoll to smart change detection');
} else {
  console.log('WARNING: Could not find __cbPoll target block');
}

// Reset tracking vars on new chat or status change
const newChatFn = `window.__cbNewChat = function() { currentChat = null; _lastMsgCount = -1; _lastStatus = null; _lastChatId = null; __cbRender(); };`;
c = c.replace('window.__cbNewChat = function() { currentChat = null; __cbRender(); };', newChatFn);

fs.writeFileSync('assets/js/chat-bubble.js', c, 'utf8');
console.log('Done! Lines:', c.split('\n').length);

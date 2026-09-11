const fs = require('fs');
const path = require('path');

const pages = [
  'Admin/02-AdminDashboard.html',
  'Admin/03-AuctionList.html',
  'Admin/04-CreateAuction.html',
  'Admin/05-AuctionDetail.html',
  'Admin/06-AgentList.html',
  'Admin/07-Reports.html',
  'Admin/08-Settings.html'
];

// The correct chat nav link - proper HTML with purple styling
const goodLink = `<a href="09-AdminChat.html" class="px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-300 hover:text-white hover:bg-purple-700 transition flex items-center gap-1.5 font-semibold"><i class="fa-solid fa-headset mr-1"></i>Chat Hỗ trợ<span id="admin-chat-badge" class="hidden bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1.5">0</span></a>`;

// Poll script that properly hides badge when 0
const goodPoll = `<script>
(function(){
  function updateChatBadge(){
    fetch("/api/chat").then(r=>r.json()).then(d=>{
      if(!d.success) return;
      var w=(d.chats||[]).filter(function(c){return c.status==="WAITING";}).length;
      var b=document.getElementById("admin-chat-badge");
      if(b){b.textContent=w;b.classList.toggle("hidden",w===0);}
    }).catch(function(){});
  }
  document.addEventListener("DOMContentLoaded",function(){updateChatBadge();setInterval(updateChatBadge,8000);});
})();
</script>`;

pages.forEach(p => {
  if (!fs.existsSync(p)) { console.log('Skip:', p); return; }
  let c = fs.readFileSync(p, 'utf8');

  // Remove ALL existing broken chat link variants (escaped quotes or encoding issues)
  // Pattern 1: escaped quotes version
  c = c.replace(/<a href="09-AdminChat\.html" class=\\"[^"]*\\">[\s\S]*?<\/a>/g, '');
  // Pattern 2: any remaining 09-AdminChat link with bad encoding
  c = c.replace(/<a href="09-AdminChat\.html"[^>]*>[\s\S]*?<\/a>/g, '');

  // Remove old broken poll scripts
  c = c.replace(/<script>\s*\(function\(\)\{[\s\S]*?updateChatBadge[\s\S]*?\}\)\(\);\s*<\/script>/g, '');

  // Find the Settings link in desktop nav and insert chat link after it
  // Look for the </a> that closes the Settings link
  const settingsPattern = /(<a href="08-Settings\.html"[^>]*>[\s\S]*?<\/a>)/;
  if (settingsPattern.test(c)) {
    c = c.replace(settingsPattern, `$1\n                    ${goodLink}`);
    console.log('Inserted chat link after Settings in:', p);
  } else {
    console.log('WARNING: Settings link not found in:', p);
  }

  // Add poll script before </body>
  c = c.replace('</body>', `${goodPoll}\n</body>`);

  fs.writeFileSync(p, c, 'utf8');
  console.log('Done:', p);
});

const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('assets/js/cargo-store.js', 'utf8');
const storageKey = 'CARGO_BIDDING_DATA_V3';
const raw = fs.readFileSync('server_data.json', 'utf8');
const store = { [storageKey]: raw };
const localStorage = {
  getItem(k) { return store[k] || null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; }
};
const context = {
  console,
  localStorage,
  window: { dispatchEvent() {}, location: { pathname: '03-Index.html' } },
  fetch: async () => ({ json: async () => ({ success: true }) }),
  Date,
  JSON,
  Math,
  setTimeout,
  clearTimeout,
  Intl,
  navigator: { userAgent: 'node' }
};
context.global = context;
vm.createContext(context);
vm.runInContext(code, context);
const CargoStore = context.CargoStore;
const data = CargoStore.getData();
const a1 = data.auctions.find(a => a.id === 1);
const a3 = data.auctions.find(a => a.id === 3);
console.log(JSON.stringify({
  auction1: {
    currentPriceKg: a1.currentPriceKg,
    leadingAgentCode: a1.leadingAgentCode,
    leadingAgentName: a1.leadingAgentName,
    bidsCount: a1.bidsCount
  },
  auction3: {
    currentPriceKg: a3.currentPriceKg,
    leadingAgentCode: a3.leadingAgentCode,
    leadingAgentName: a3.leadingAgentName,
    bidsCount: a3.bidsCount
  },
  topAuction1Bids: (data.bids || []).filter(b => b.auctionId === 1).sort((a, b) => b.priceKg - a.priceKg).slice(0, 5)
}, null, 2));

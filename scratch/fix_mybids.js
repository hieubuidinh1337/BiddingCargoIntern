const fs = require('fs');
const file = '06-MyBids.html';
let content = fs.readFileSync(file, 'utf8');

const targetSnippet = `                return;
            }
                let statusBadge = '';`;

const replacementSnippet = `                return;
            }

            const startIdx = (currentMyBidsPage - 1) * myBidsItemsPerPage;
            const paginatedList = filtered.slice(startIdx, startIdx + myBidsItemsPerPage);

            tbody.innerHTML = paginatedList.map(b => {
                const auction = auctions.find(a => a.id == b.auctionId) || {};
                const wonAuction = wonAuctions.find(w => String(w.auctionId) === String(b.auctionId)) || null;
                const paymentStatus = wonAuction ? wonAuction.paymentStatus : null;
                const cargoDeclared = wonAuction ? (CargoStore.isCargoDeclared ? CargoStore.isCargoDeclared(wonAuction) : !!(wonAuction.cargoDeclaration && wonAuction.cargoDeclaration.cargoName)) : false;

                const timer = (auction.endTime && CargoStore.getTimeRemaining) ? CargoStore.getTimeRemaining(auction.endTime) : null;
                const isAuctionClosed = !auction.id || auction.status === 'CLOSED' || auction.status === 'ENDED' || auction.status === 'EXPIRED' || (timer && timer.isEnded);

                let statusBadge = '';`;

const normContent = content.replace(/\r\n/g, '\n');
const normTarget = targetSnippet.replace(/\r\n/g, '\n');
const normReplacement = replacementSnippet.replace(/\r\n/g, '\n');

if (normContent.includes(normTarget)) {
    fs.writeFileSync(file, normContent.replace(normTarget, normReplacement), 'utf8');
    console.log('Fixed 06-MyBids.html successfully!');
} else {
    console.log('Target snippet not found in 06-MyBids.html');
}

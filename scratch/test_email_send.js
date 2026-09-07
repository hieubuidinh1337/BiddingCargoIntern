const http = require('http');

function sendTestEmail(payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const req = http.request({
            hostname: 'localhost',
            port: 8085,
            path: '/api/send-email',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function runTest() {
    console.log('Sending PAYMENT_CONFIRMED test email...');
    const res1 = await sendTestEmail({
        type: 'PAYMENT_CONFIRMED',
        to: 'jome7093@gmail.com',
        wonData: {
            wonId: 'WON-20260904-01',
            flightNumber: 'VU130',
            route: 'SGN - HAN',
            totalAmountVND: 6300000000,
            awbNumber: '998-39879822'
        }
    });
    console.log('PAYMENT_CONFIRMED Result:', res1);

    console.log('\nSending AUCTION_WON test email...');
    const res2 = await sendTestEmail({
        type: 'AUCTION_WON',
        to: 'jome7093@gmail.com',
        wonData: {
            wonId: 'WON-20260904-01',
            flightNumber: 'VU130',
            route: 'SGN - HAN',
            capacityKg: 3500,
            priceKg: 1800000,
            totalAmountVND: 6300000000,
            awbNumber: '998-39879822'
        },
        agentName: 'Vinatrans',
        agentCode: 'AG-1024'
    });
    console.log('AUCTION_WON Result:', res2);
}

runTest().catch(console.error);

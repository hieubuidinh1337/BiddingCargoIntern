const request = require('supertest');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db.js');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8085';

describe('Vietravel Airlines Cargo Bidding System - API Automation Test Suite', () => {

    beforeAll(async () => {
        // Ensure database is initialized before running tests
        await db.initDatabase();
    });

    // ============================================================
    // 1. HAPPY PATH TEST CASES (Kịch bản tích cực)
    // ============================================================
    describe('🟢 HAPPY PATH TESTS (Người dùng dùng đúng cách)', () => {

        test('HP-01: GET /api/data should return 200 OK with valid database schema', async () => {
            const res = await request(BASE_URL).get('/api/data');

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('application/json');
            expect(res.body).toHaveProperty('auctions');
            expect(res.body).toHaveProperty('wonAuctions');
            expect(Array.isArray(res.body.auctions)).toBe(true);
            expect(Array.isArray(res.body.wonAuctions)).toBe(true);
            expect(res.body.auctions.length).toBeGreaterThan(0);
        });

        test('HP-02: POST /api/momo/create should generate valid MoMo QR payment request with standardized orderInfo', async () => {
            const dataRes = await request(BASE_URL).get('/api/data');
            let unpaidWon = (dataRes.body.wonAuctions || []).find(w => w.paymentStatus === 'UNPAID');
            if (!unpaidWon) {
                const wonList = dataRes.body.wonAuctions || [];
                if (wonList.length > 0) {
                    wonList[0].paymentStatus = 'UNPAID';
                    unpaidWon = wonList[0];
                    await request(BASE_URL).post('/api/data').send({ wonAuctions: wonList });
                } else {
                    unpaidWon = {
                        wonId: 'WON-2026-0814-01',
                        auctionId: 4,
                        agentCode: 'AG-0892',
                        flightNumber: 'VU132',
                        route: 'SGN - HAN',
                        capacityKg: 3000,
                        priceKg: 22000,
                        totalAmountVND: 66000000,
                        paymentDeadline: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
                        paymentStatus: 'UNPAID',
                        awbNumber: '998-12345678',
                        cutOffTime: 'Trước ETD 3 giờ'
                    };
                    await request(BASE_URL).post('/api/data').send({ wonAuctions: [unpaidWon] });
                }
            }
            expect(unpaidWon).toBeDefined();

            const res = await request(BASE_URL)
                .post('/api/momo/create')
                .send({ wonId: unpaidWon.wonId });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty('orderId');
            expect(res.body).toHaveProperty('orderInfo');
            expect(res.body).toHaveProperty('amount');
            expect(res.body).toHaveProperty('payUrl');
            expect(res.body).toHaveProperty('qrCodeUrl');
            expect(res.body.amount).toBeLessThanOrEqual(50000000); // Verify Sandbox Amount Cap
            expect(res.body.orderInfo).toContain(unpaidWon.agentCode.replace('-', ''));

            // Verify orderInfo format: {AgentCode}-{AuctionCode}-{DDMMYYYY}
            const orderInfoRegex = /^[A-Z0-9]+-[A-Z0-9]+-\d{8}$/;
            expect(orderInfoRegex.test(res.body.orderInfo)).toBe(true);
        }, 15000);

        test('HP-05: Sealed-Bid Privacy Guard - GET /api/data?agentCode=AG-0892 should mask competitor bids for OPEN auctions', async () => {
            const res = await request(BASE_URL).get('/api/data?agentCode=AG-0892');
            expect(res.statusCode).toBe(200);

            // Bids returned for OPEN auctions must belong ONLY to AG-0892
            const openAuctions = res.body.auctions.filter(a => a.status === 'OPEN');
            const openAuctionIds = new Set(openAuctions.map(a => a.id));

            res.body.bids.forEach(bid => {
                if (openAuctionIds.has(bid.auctionId)) {
                    expect(['AG-0892', 'AG-***']).toContain(bid.agentCode.toUpperCase());
                }
            });
        });

        test('HP-06: Atomic Sealed-Bid Placement - POST /api/bids/place should place bid atomically', async () => {
            const dataRes = await request(BASE_URL).get('/api/data');
            const targetAuction = dataRes.body.auctions.find(a => a.status === 'OPEN');
            expect(targetAuction).toBeDefined();

            const minBid = 100000;

            const res = await request(BASE_URL)
                .post('/api/bids/place')
                .send({
                    auctionId: targetAuction.id,
                    agentCode: 'AG-0892',
                    agentName: 'ABC Logistics',
                    priceKg: minBid,
                    weightKg: 1000
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty('bid');
            expect(res.body.bid.priceKg).toBe(minBid);
        });

        test('HP-03: POST /api/momo/ipn with valid HMAC-SHA256 signature should update order paymentStatus to PAID', async () => {
            const wonId = 'TEST_WON_' + Date.now();
            const orderId = wonId + '_ORD';
            const requestId = wonId + '_REQ';
            const amount = 50000;
            const partnerCode = process.env.MOMO_PARTNER_CODE || 'MOMOBKUN20180529';
            const secretKey = process.env.MOMO_SECRET_KEY || 'at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa';
            const accessKey = process.env.MOMO_ACCESS_KEY || 'klm05TvNBzhg7h7j';

            // Insert won auction via API to ensure server memory & SQLite are in sync
            const dataRes = await request(BASE_URL).get('/api/data');
            const wonAuctions = dataRes.body.wonAuctions || [];
            wonAuctions.push({
                wonId,
                auctionId: 9999,
                agentCode: 'AG-0892',
                flightNumber: 'TEST_VU999',
                route: 'SGN - HAN',
                capacityKg: 100,
                priceKg: 500,
                totalAmountVND: 50000,
                paymentStatus: 'UNPAID',
                momoOrderId: orderId
            });
            await request(BASE_URL).post('/api/data').send({ wonAuctions });

            const responseTime = Date.now();
            const transId = 'MOMO_TRANS_' + Date.now();
            const rawSignature = [
                `accessKey=${accessKey}`,
                `amount=${amount}`,
                `extraData=`,
                `message=Success`,
                `orderId=${orderId}`,
                `orderInfo=AG0892-VU130-16092026`,
                `orderType=momo_wallet`,
                `partnerCode=${partnerCode}`,
                `payType=qr`,
                `requestId=${requestId}`,
                `responseTime=${responseTime}`,
                `resultCode=0`,
                `transId=${transId}`
            ].join('&');

            const validSignature = crypto
                .createHmac('sha256', secretKey)
                .update(rawSignature)
                .digest('hex');

            const ipnPayload = {
                partnerCode,
                orderId,
                requestId,
                amount,
                orderInfo: 'AG0892-VU130-16092026',
                orderType: 'momo_wallet',
                transId,
                resultCode: 0,
                message: 'Success',
                payType: 'qr',
                responseTime,
                extraData: '',
                signature: validSignature
            };

            const res = await request(BASE_URL)
                .post('/api/momo/ipn')
                .send(ipnPayload);

            expect(res.statusCode).toBe(204); // MoMo IPN standard return status

            // Verify order status in DB updated to PAID
            const statusRes = await request(BASE_URL).get(`/api/momo/status?wonId=${wonId}`);
            expect(statusRes.statusCode).toBe(200);
            expect(statusRes.body.paymentStatus).toBe('PAID');
            expect(statusRes.body.momoTransId).toBe(transId);
        });

        test('HP-04: Support Chat workflow - POST /api/chat/create & POST /api/chat/send', async () => {
            const agentCode = 'AG-TEST-' + Date.now();

            // Create new chat session
            const createRes = await request(BASE_URL)
                .post('/api/chat/create')
                .send({
                    agentCode,
                    agentName: 'Test Agent Ltd',
                    text: 'Cần hỗ trợ thông tin tải trọng chuyến bay VU130'
                });

            expect(createRes.statusCode).toBe(200);
            expect(createRes.body.success).toBe(true);
            expect(createRes.body.chat).toHaveProperty('id');
            expect(createRes.body.chat.messages.length).toBeGreaterThan(0);

            const chatId = createRes.body.chat.id;

            // Send follow up message
            const sendRes = await request(BASE_URL)
                .post('/api/chat/send')
                .send({
                    chatId,
                    sender: 'agent',
                    senderName: 'Test Agent Ltd',
                    text: 'Lô hàng thực phẩm bảo quản lạnh có cần đóng thùng xốp không?'
                });

            expect(sendRes.statusCode).toBe(200);
            expect(sendRes.body.success).toBe(true);
            expect(sendRes.body.message.text).toContain('bảo quản lạnh');

            // Clean up test chat by closing it so it doesn't pollute WAITING admin chat list
            await request(BASE_URL)
                .post('/api/chat/close')
                .send({
                    chatId,
                    closedByName: 'Automated Test Cleanup'
                });
        });
    });

    // ============================================================
    // 2. NEGATIVE PATH TEST CASES (Kịch bản tiêu cực & Edge Cases)
    // ============================================================
    describe('🔴 NEGATIVE PATH TESTS (Người dùng nhập sai / Phá hệ thống / Security)', () => {

        test('NP-01: POST /api/momo/create without wonId should return 400 Bad Request', async () => {
            const res = await request(BASE_URL)
                .post('/api/momo/create')
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('wonId is required');
        });

        test('NP-02: POST /api/momo/create with non-existent wonId should return 404 Not Found', async () => {
            const res = await request(BASE_URL)
                .post('/api/momo/create')
                .send({ wonId: 'WON-FAKE-999999' });

            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Won auction not found');
        });

        test('NP-03: POST /api/momo/create for an ALREADY PAID order should return 400 Bad Request', async () => {
            const wonId = 'WON_PAID_TEST_' + Date.now();
            const dataRes = await request(BASE_URL).get('/api/data');
            const wonAuctions = dataRes.body.wonAuctions || [];
            wonAuctions.push({
                wonId,
                auctionId: 1,
                agentCode: 'AG-0892',
                flightNumber: 'VU130',
                route: 'SGN - HAN',
                capacityKg: 100,
                priceKg: 500,
                totalAmountVND: 50000,
                paymentStatus: 'PAID'
            });
            await request(BASE_URL).post('/api/data').send({ wonAuctions });

            const res = await request(BASE_URL)
                .post('/api/momo/create')
                .send({ wonId });

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Order already paid');
        });

        test('NP-04: POST /api/momo/ipn with INVALID HMAC signature should return 400 Bad Request', async () => {
            const ipnPayload = {
                partnerCode: 'MOMOBKUN20180529',
                orderId: 'FAKE_ORDER',
                requestId: 'FAKE_REQ',
                amount: 50000,
                orderInfo: 'FAKE',
                orderType: 'momo_wallet',
                transId: '123456',
                resultCode: 0,
                message: 'Success',
                payType: 'qr',
                responseTime: Date.now(),
                extraData: '',
                signature: 'INVALID_HACKER_SIGNATURE_12345'
            };

            const res = await request(BASE_URL)
                .post('/api/momo/ipn')
                .send(ipnPayload);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Invalid signature');
        });

        test('NP-05: GET /uploads/../../.env Path Traversal security attempt should be blocked', async () => {
            const res = await request(BASE_URL).get('/uploads/../../.env');

            // Must NOT return 200 with raw .env content
            expect(res.statusCode).not.toBe(200);
            if (res.text) {
                expect(res.text).not.toContain('SMTP_PASS');
                expect(res.text).not.toContain('MOMO_SECRET_KEY');
            }
        });

        test('NP-06: GET /api/momo/status without wonId query param should return 400 Bad Request', async () => {
            const res = await request(BASE_URL).get('/api/momo/status');

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    afterAll(async () => {
        try {
            await db.run("DELETE FROM won_auctions WHERE wonId LIKE 'TEST_%' OR wonId LIKE 'WON_PAID_TEST_%'");
            await db.run("DELETE FROM bids WHERE id LIKE 'TEST_%' OR id LIKE 'TEST_BID_%'");
            const dataRes = await request(BASE_URL).get('/api/data');
            if (dataRes.body && Array.isArray(dataRes.body.wonAuctions)) {
                const cleanedWon = dataRes.body.wonAuctions.filter(w => !String(w.wonId).startsWith('TEST_') && !String(w.wonId).startsWith('WON_PAID_TEST_'));
                await request(BASE_URL).post('/api/data').send({ wonAuctions: cleanedWon });
            }
        } catch (err) {
            console.error('Failed to cleanup test data:', err.message);
        }
    });
});

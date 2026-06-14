"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const index_1 = __importDefault(require("../index"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
jest.setTimeout(120000);
describe('Escrow and Wallet Settlement Integration Tests', () => {
    let customerToken = '';
    let customerId = '';
    let handymanToken = '';
    let handymanId = '';
    let vendorToken = '';
    let vendorId = '';
    let serviceId = '';
    let productId = '';
    const testEmailCustomer = `escrow_cust_${Date.now()}@domain.com`;
    const testEmailHandyman = `escrow_handy_${Date.now()}@domain.com`;
    const testEmailVendor = `escrow_vendor_${Date.now()}@domain.com`;
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        process.env.NODE_ENV = 'test';
        // Clear existing test data using targeted where clauses to avoid full locks
        yield prisma.withdrawal.deleteMany({
            where: { wallet: { user: { email: { startsWith: 'escrow_' } } } }
        });
        yield prisma.transaction.deleteMany({
            where: { wallet: { user: { email: { startsWith: 'escrow_' } } } }
        });
        yield prisma.escrow.deleteMany({
            where: {
                OR: [
                    { provider: { email: { startsWith: 'escrow_' } } },
                    { booking: { customer: { email: { startsWith: 'escrow_' } } } }
                ]
            }
        });
        yield prisma.booking.deleteMany({
            where: {
                OR: [
                    { customer: { email: { startsWith: 'escrow_' } } },
                    { handyman: { email: { startsWith: 'escrow_' } } }
                ]
            }
        });
        yield prisma.orderItem.deleteMany({
            where: { order: { user: { email: { startsWith: 'escrow_' } } } }
        });
        yield prisma.order.deleteMany({
            where: { user: { email: { startsWith: 'escrow_' } } }
        });
        yield prisma.wallet.deleteMany({
            where: { user: { email: { startsWith: 'escrow_' } } }
        });
        yield prisma.user.deleteMany({
            where: {
                OR: [
                    { email: { startsWith: 'escrow_cust_' } },
                    { email: { startsWith: 'escrow_handy_' } },
                    { email: { startsWith: 'escrow_vendor_' } },
                ]
            },
        });
        // Create a mock service
        const service = yield prisma.service.create({
            data: {
                name: 'Escrow Repair Test',
                description: 'Test plumbing repairs',
                category: 'Plumbing',
                basePrice: 1000.00, // ₦1000 base price
            },
        });
        serviceId = service.id;
        // Create a mock product
        const product = yield prisma.product.create({
            data: {
                name: 'Escrow Test Drill',
                description: 'Test drill',
                price: 2000.00, // ₦2000 price
                stock: 10,
                category: 'Tools',
            },
        });
        productId = product.id;
        // Register Customer
        const customerRes = yield (0, supertest_1.default)(index_1.default)
            .post('/api/auth/register')
            .send({
            email: testEmailCustomer,
            password: 'password123',
            name: 'Escrow Customer',
            role: 'CUSTOMER',
        });
        customerToken = customerRes.body.token;
        customerId = customerRes.body.user.id;
        // Register Handyman
        const handymanRes = yield (0, supertest_1.default)(index_1.default)
            .post('/api/auth/register')
            .send({
            email: testEmailHandyman,
            password: 'password123',
            name: 'Escrow Handyman',
            role: 'HANDYMAN',
        });
        handymanToken = handymanRes.body.token;
        handymanId = handymanRes.body.user.id;
        // Set Handyman Home & Specialty
        yield (0, supertest_1.default)(index_1.default)
            .patch('/api/auth/location')
            .set('Authorization', `Bearer ${handymanToken}`)
            .send({
            latitude: 40.7580,
            longitude: -73.9855,
            address: 'Times Square, NYC',
        });
        yield prisma.user.update({
            where: { id: handymanId },
            data: { specialty: 'Plumbing', verificationStatus: 'VERIFIED' }, // verified for withdrawals
        });
        // Register Vendor
        const vendorRes = yield (0, supertest_1.default)(index_1.default)
            .post('/api/auth/register')
            .send({
            email: testEmailVendor,
            password: 'password123',
            name: 'Escrow Vendor',
            role: 'VENDOR',
        });
        vendorToken = vendorRes.body.token;
        vendorId = vendorRes.body.user.id;
        yield prisma.user.update({
            where: { id: vendorId },
            data: { verificationStatus: 'VERIFIED' }, // verified for withdrawals
        });
        // Link test product to this vendor
        yield prisma.product.update({
            where: { id: productId },
            data: { vendorId },
        });
        // Setup wallets
        yield prisma.wallet.create({ data: { userId: customerId, balance: 10000.0, pendingBalance: 0.0 } }); // Customer starts with 10k
        yield prisma.wallet.create({ data: { userId: handymanId, balance: 0.0, pendingBalance: 0.0 } });
        yield prisma.wallet.create({ data: { userId: vendorId, balance: 0.0, pendingBalance: 0.0 } });
        // Platform user and wallet
        yield prisma.user.upsert({
            where: { email: 'platform@test.com' },
            update: {},
            create: {
                id: 'PLATFORM',
                email: 'platform@test.com',
                name: 'Platform Commission Account',
                role: 'ADMIN',
            },
        });
        yield prisma.wallet.upsert({
            where: { userId: 'PLATFORM' },
            update: {},
            create: { userId: 'PLATFORM', balance: 0.0, pendingBalance: 0.0 },
        });
        // Seeding App Settings
        yield prisma.appSetting.upsert({
            where: { key: 'commission_rate' },
            update: { value: '0.15' }, // 15% platform commission
            create: { key: 'commission_rate', value: '0.15' },
        });
    }), 120000);
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Cleanup
        yield prisma.withdrawal.deleteMany({});
        yield prisma.transaction.deleteMany({});
        yield prisma.escrow.deleteMany({});
        yield prisma.booking.deleteMany({});
        yield prisma.orderItem.deleteMany({});
        yield prisma.order.deleteMany({});
        yield prisma.wallet.deleteMany({});
        yield prisma.user.deleteMany({
            where: {
                OR: [
                    { email: { startsWith: 'escrow_cust_' } },
                    { email: { startsWith: 'escrow_handy_' } },
                    { email: { startsWith: 'escrow_vendor_' } },
                ]
            },
        });
        yield prisma.service.deleteMany({ where: { id: serviceId } });
        yield prisma.product.deleteMany({ where: { id: productId } });
        yield prisma.$disconnect();
    }));
    describe('Booking Escrow & Release Workflow', () => {
        let bookingId = '';
        let escrowId = '';
        it('should create a booking and mark it paid, generating an escrow record', () => __awaiter(void 0, void 0, void 0, function* () {
            // 1. Create booking
            const bookRes = yield (0, supertest_1.default)(index_1.default)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({
                serviceId,
                scheduledAt: new Date(Date.now() + 86400000).toISOString(),
                address: 'Times Square, NYC',
                latitude: 40.7580,
                longitude: -73.9855,
                autoAssign: true, // Auto assign closes handyman (Bob Close)
            });
            expect(bookRes.status).toBe(201);
            bookingId = bookRes.body.id;
            expect(bookRes.body.handymanId).toBe(handymanId);
            // Simulate payment verification via OPay callback
            const payRes = yield (0, supertest_1.default)(index_1.default)
                .get(`/api/payments/opay/verify/PAY_${bookingId}_${Date.now()}`);
            expect(payRes.status).toBe(200);
            // Check booking status changed to ACCEPTED
            const updatedBooking = yield prisma.booking.findUnique({ where: { id: bookingId } });
            expect(updatedBooking === null || updatedBooking === void 0 ? void 0 : updatedBooking.status).toBe('ACCEPTED');
            // Check escrow record exists
            const escrow = yield prisma.escrow.findFirst({
                where: { bookingId },
            });
            expect(escrow).toBeDefined();
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.amount).toBe(1000.00);
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.commissionAmount).toBe(150.00); // 15% of 1000
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.providerAmount).toBe(850.00); // 85% of 1000
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.status).toBe('HELD');
            escrowId = escrow.id;
            // Check handyman pending balance was incremented
            const handymanWallet = yield prisma.wallet.findUnique({ where: { userId: handymanId } });
            expect(handymanWallet === null || handymanWallet === void 0 ? void 0 : handymanWallet.pendingBalance).toBe(850.00);
            expect(handymanWallet === null || handymanWallet === void 0 ? void 0 : handymanWallet.balance).toBe(0.0);
        }));
        it('should set autoReleaseAt to 24 hours in the future when handyman marks job completed', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .patch(`/api/bookings/${bookingId}/status`)
                .set('Authorization', `Bearer ${handymanToken}`)
                .send({ status: 'COMPLETED' });
            expect(res.status).toBe(200);
            // Check autoReleaseAt was set on the escrow record
            const escrow = yield prisma.escrow.findUnique({ where: { id: escrowId } });
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.autoReleaseAt).not.toBeNull();
            const diffMs = escrow.autoReleaseAt.getTime() - Date.now();
            const diffHours = diffMs / (1000 * 60 * 60);
            expect(diffHours).toBeCloseTo(24, 1);
        }));
        it('should split and release funds instantly when customer confirms completion', () => __awaiter(void 0, void 0, void 0, function* () {
            const confirmRes = yield (0, supertest_1.default)(index_1.default)
                .post(`/api/bookings/${bookingId}/confirm-completion`)
                .set('Authorization', `Bearer ${customerToken}`);
            expect(confirmRes.status).toBe(200);
            // Check escrow is RELEASED
            const escrow = yield prisma.escrow.findUnique({ where: { id: escrowId } });
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.status).toBe('RELEASED');
            // Check wallet balances updated
            const handymanWallet = yield prisma.wallet.findUnique({ where: { userId: handymanId } });
            expect(handymanWallet === null || handymanWallet === void 0 ? void 0 : handymanWallet.pendingBalance).toBe(0.0);
            expect(handymanWallet === null || handymanWallet === void 0 ? void 0 : handymanWallet.balance).toBe(850.00); // Cleared balance
            const platformWallet = yield prisma.wallet.findUnique({ where: { userId: 'PLATFORM' } });
            expect(platformWallet === null || platformWallet === void 0 ? void 0 : platformWallet.balance).toBe(150.00); // Platform gets commission
        }));
    });
    describe('Withdrawals and Settlement Speeds', () => {
        it('should reject withdrawals if handyman KYC is not verified', () => __awaiter(void 0, void 0, void 0, function* () {
            // Temporarily mark handyman unverified
            yield prisma.user.update({ where: { id: handymanId }, data: { verificationStatus: 'UNVERIFIED' } });
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/wallet/withdraw')
                .set('Authorization', `Bearer ${handymanToken}`)
                .send({
                amount: 500.00,
                instant: false,
                accountNumber: '1234567890',
                bankName: 'Test Bank',
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('KYC');
            // Reset to verified
            yield prisma.user.update({ where: { id: handymanId }, data: { verificationStatus: 'VERIFIED' } });
        }));
        it('should process instant withdrawals immediately and deduct ₦100 fee', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/wallet/withdraw')
                .set('Authorization', `Bearer ${handymanToken}`)
                .send({
                amount: 500.00,
                instant: true,
                accountNumber: '1234567890',
                bankName: 'Test Bank',
            });
            expect(res.status).toBe(200);
            expect(res.body.withdrawal.status).toBe('COMPLETED');
            expect(res.body.withdrawal.fee).toBe(100.0);
            expect(res.body.withdrawal.netAmount).toBe(400.0); // 500 - 100
            // Handyman balance: 850 - 500 = 350
            const handymanWallet = yield prisma.wallet.findUnique({ where: { userId: handymanId } });
            expect(handymanWallet === null || handymanWallet === void 0 ? void 0 : handymanWallet.balance).toBe(350.00);
        }));
        it('should queue standard withdrawals as PENDING with ₦0 fee', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/wallet/withdraw')
                .set('Authorization', `Bearer ${handymanToken}`)
                .send({
                amount: 300.00,
                instant: false,
                accountNumber: '1234567890',
                bankName: 'Test Bank',
            });
            expect(res.status).toBe(200);
            expect(res.body.withdrawal.status).toBe('PENDING');
            expect(res.body.withdrawal.fee).toBe(0.0);
            expect(res.body.withdrawal.netAmount).toBe(300.0);
            // Handyman balance: 350 - 300 = 50
            const handymanWallet = yield prisma.wallet.findUnique({ where: { userId: handymanId } });
            expect(handymanWallet === null || handymanWallet === void 0 ? void 0 : handymanWallet.balance).toBe(50.00);
        }));
    });
    describe('Booking Split Payment 50/50 Workflow', () => {
        let splitBookingId = '';
        let firstEscrowId = '';
        it('should confirm a booking upon 50% deposit payment and create first escrow record', () => __awaiter(void 0, void 0, void 0, function* () {
            // 1. Create booking
            const bookRes = yield (0, supertest_1.default)(index_1.default)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({
                serviceId,
                scheduledAt: new Date(Date.now() + 86400000).toISOString(),
                address: 'Times Square, NYC',
                latitude: 40.7580,
                longitude: -73.9855,
                autoAssign: true,
            });
            expect(bookRes.status).toBe(201);
            splitBookingId = bookRes.body.id;
            // Initialize split checkout
            const checkoutRes = yield (0, supertest_1.default)(index_1.default)
                .post('/api/payments/checkout')
                .send({
                checkoutType: 'booking',
                id: splitBookingId,
                provider: 'OPAY',
                isSplit: true,
            });
            expect(checkoutRes.status).toBe(200);
            expect(checkoutRes.body.authorizationUrl).toContain('amount=500.00'); // 50% of 1000 basePrice
            // Verify payment of 500
            const payRes = yield (0, supertest_1.default)(index_1.default)
                .get(`/api/payments/opay/verify/PAY_${splitBookingId}_${Date.now()}`);
            expect(payRes.status).toBe(200);
            // Verify booking is ACCEPTED (confirmed by 50% deposit)
            const updatedBooking = yield prisma.booking.findUnique({ where: { id: splitBookingId } });
            expect(updatedBooking === null || updatedBooking === void 0 ? void 0 : updatedBooking.status).toBe('ACCEPTED');
            expect(updatedBooking === null || updatedBooking === void 0 ? void 0 : updatedBooking.isSplitPayment).toBe(true);
            expect(updatedBooking === null || updatedBooking === void 0 ? void 0 : updatedBooking.amountPaid).toBe(500.00);
            // Verify first escrow is created for 500
            const escrow = yield prisma.escrow.findFirst({
                where: { bookingId: splitBookingId },
            });
            expect(escrow).toBeDefined();
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.amount).toBe(500.00);
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.commissionAmount).toBe(75.00); // 15% of 500
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.providerAmount).toBe(425.00); // 85% of 500
            expect(escrow === null || escrow === void 0 ? void 0 : escrow.status).toBe('HELD');
            firstEscrowId = escrow.id;
        }));
        it('should reject direct confirm-completion if the remaining 50% is not paid', () => __awaiter(void 0, void 0, void 0, function* () {
            // Handyman completes job
            const completeRes = yield (0, supertest_1.default)(index_1.default)
                .patch(`/api/bookings/${splitBookingId}/status`)
                .set('Authorization', `Bearer ${handymanToken}`)
                .send({ status: 'COMPLETED' });
            expect(completeRes.status).toBe(200);
            // Customer tries to directly confirm completion without paying
            const confirmRes = yield (0, supertest_1.default)(index_1.default)
                .post(`/api/bookings/${splitBookingId}/confirm-completion`)
                .set('Authorization', `Bearer ${customerToken}`);
            expect(confirmRes.status).toBe(400);
            expect(confirmRes.body.error).toContain('Remaining split payment');
        }));
        it('should complete final settlement and release both escrows upon paying the remaining 50%', () => __awaiter(void 0, void 0, void 0, function* () {
            // Initiate second checkout
            const checkoutRes = yield (0, supertest_1.default)(index_1.default)
                .post('/api/payments/checkout')
                .send({
                checkoutType: 'booking',
                id: splitBookingId,
                provider: 'OPAY',
            });
            expect(checkoutRes.status).toBe(200);
            expect(checkoutRes.body.authorizationUrl).toContain('amount=500.00'); // remaining 500
            // Verify second payment
            const payRes = yield (0, supertest_1.default)(index_1.default)
                .get(`/api/payments/opay/verify/PAY_${splitBookingId}_${Date.now()}`);
            expect(payRes.status).toBe(200);
            // Booking status should be COMPLETED and fully paid
            const finalBooking = yield prisma.booking.findUnique({ where: { id: splitBookingId } });
            expect(finalBooking === null || finalBooking === void 0 ? void 0 : finalBooking.status).toBe('COMPLETED');
            expect(finalBooking === null || finalBooking === void 0 ? void 0 : finalBooking.amountPaid).toBe(1000.00);
            // Both escrows should be RELEASED
            const escrows = yield prisma.escrow.findMany({
                where: { bookingId: splitBookingId },
            });
            expect(escrows.length).toBe(2);
            expect(escrows.every(e => e.status === 'RELEASED')).toBe(true);
            // Handyman cleared balance should receive total provider share (425.00 * 2 = 850.00)
            // Since they previously had 50.00, it should be 50.00 + 850.00 = 900.00
            const handymanWallet = yield prisma.wallet.findUnique({ where: { userId: handymanId } });
            expect(handymanWallet === null || handymanWallet === void 0 ? void 0 : handymanWallet.balance).toBe(900.00);
        }));
    });
});

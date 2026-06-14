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
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma = new client_1.PrismaClient();
jest.setTimeout(30000);
describe('Booking & Matchmaking Integration Tests', () => {
    let customerToken = '';
    let customerId = '';
    let handymanToken = '';
    let handymanId = '';
    let handymanFarId = '';
    let serviceId = '';
    const testEmailCustomer = `customer_${Date.now()}@domain.com`;
    const testEmailHandymanClose = `handyman_close_${Date.now()}@domain.com`;
    const testEmailHandymanFar = `handyman_far_${Date.now()}@domain.com`;
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        process.env.NODE_ENV = 'test';
        // Clear existing mock/test data
        yield prisma.booking.deleteMany({});
        yield prisma.user.deleteMany({
            where: {
                OR: [
                    { email: { startsWith: 'customer_' } },
                    { email: { startsWith: 'handyman_close_' } },
                    { email: { startsWith: 'handyman_far_' } },
                ]
            },
        });
        // Create a mock service
        const service = yield prisma.service.create({
            data: {
                name: 'Plumbing Repair Test',
                description: 'Test plumbing repairs',
                category: 'Plumbing',
                basePrice: 90.00,
            },
        });
        serviceId = service.id;
        // Register Customer (New York City center - Times Square: 40.7580, -73.9855)
        const customerRes = yield (0, supertest_1.default)(index_1.default)
            .post('/api/auth/register')
            .send({
            email: testEmailCustomer,
            password: 'password123',
            name: 'Test Customer NYC',
            role: 'CUSTOMER',
        });
        customerToken = customerRes.body.token;
        customerId = customerRes.body.user.id;
        // Set Customer's home location
        yield (0, supertest_1.default)(index_1.default)
            .patch('/api/auth/location')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
            latitude: 40.7580,
            longitude: -73.9855,
            address: 'Times Square, New York, NY',
        });
        // Register Handyman Close (Port Authority - 0.5 km away: 40.7568, -73.9906)
        const handymanCloseRes = yield (0, supertest_1.default)(index_1.default)
            .post('/api/auth/register')
            .send({
            email: testEmailHandymanClose,
            password: 'password123',
            name: 'Bob Close Plumber',
            role: 'HANDYMAN',
        });
        handymanToken = handymanCloseRes.body.token;
        handymanId = handymanCloseRes.body.user.id;
        yield (0, supertest_1.default)(index_1.default)
            .patch('/api/auth/location')
            .set('Authorization', `Bearer ${handymanToken}`)
            .send({
            latitude: 40.7568,
            longitude: -73.9906,
            specialty: 'Plumbing',
        });
        // Directly set specialty and verification status via prisma since signup might not have it in req.body
        yield prisma.user.update({
            where: { id: handymanId },
            data: { specialty: 'Plumbing', verificationStatus: 'VERIFIED' },
        });
        // Register Handyman Far (Central Park - 3 km away: 40.7850, -73.9682)
        const handymanFarRes = yield (0, supertest_1.default)(index_1.default)
            .post('/api/auth/register')
            .send({
            email: testEmailHandymanFar,
            password: 'password123',
            name: 'Dave Far Plumber',
            role: 'HANDYMAN',
        });
        handymanFarId = handymanFarRes.body.user.id;
        yield (0, supertest_1.default)(index_1.default)
            .patch('/api/auth/location')
            .set('Authorization', `Bearer ${handymanFarRes.body.token}`)
            .send({
            latitude: 40.7850,
            longitude: -73.9682,
            specialty: 'Plumbing',
        });
        yield prisma.user.update({
            where: { id: handymanFarId },
            data: { specialty: 'Plumbing', verificationStatus: 'VERIFIED' },
        });
    }), 120000);
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Cleanup
        yield prisma.booking.deleteMany({});
        yield prisma.user.deleteMany({
            where: {
                OR: [
                    { email: { startsWith: 'customer_' } },
                    { email: { startsWith: 'handyman_close_' } },
                    { email: { startsWith: 'handyman_far_' } },
                ]
            },
        });
        yield prisma.service.deleteMany({ where: { id: serviceId } });
        yield prisma.$disconnect();
    }));
    describe('Intelligent Matchmaking and Live Tracking', () => {
        let bookingId = '';
        it('should auto-assign the closest qualified handyman when booking with autoAssign = true', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/bookings')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({
                serviceId,
                scheduledAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
                address: 'Times Square, New York, NY',
                latitude: 40.7580,
                longitude: -73.9855,
                autoAssign: true,
            });
            expect(res.status).toBe(201);
            expect(res.body.handymanId).toBe(handymanId); // Assigned to Bob (Close Plumber)
            expect(res.body.status).toBe('ACCEPTED');
            bookingId = res.body.id;
        }));
        it('should retrieve correct customer and provider live locations', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .get(`/api/bookings/${bookingId}/location`)
                .set('Authorization', `Bearer ${customerToken}`);
            expect(res.status).toBe(200);
            expect(res.body.customerLocation.lat).toBeCloseTo(40.7580, 4);
            expect(res.body.customerLocation.lng).toBeCloseTo(-73.9855, 4);
            // Handyman current location should match initial coordinates
            expect(res.body.providerLocation.lat).toBeCloseTo(40.7568, 4);
            expect(res.body.providerLocation.lng).toBeCloseTo(-73.9906, 4);
        }));
        it('should update live locations when provider moves, and reflect on tracking details', () => __awaiter(void 0, void 0, void 0, function* () {
            // Handyman moves closer to Times Square (e.g. 40.7575, -73.9870)
            yield (0, supertest_1.default)(index_1.default)
                .patch('/api/auth/location')
                .set('Authorization', `Bearer ${handymanToken}`)
                .send({
                currentLat: 40.7575,
                currentLng: -73.9870,
            });
            // Get location tracking details again
            const res = yield (0, supertest_1.default)(index_1.default)
                .get(`/api/bookings/${bookingId}/location`)
                .set('Authorization', `Bearer ${customerToken}`);
            expect(res.status).toBe(200);
            expect(res.body.providerLocation.lat).toBeCloseTo(40.7575, 4);
            expect(res.body.providerLocation.lng).toBeCloseTo(-73.9870, 4);
        }));
        it('should deny reassignment and cancellation to non-admin users', () => __awaiter(void 0, void 0, void 0, function* () {
            // Reassign attempt by customer
            const reassignRes = yield (0, supertest_1.default)(index_1.default)
                .patch(`/api/bookings/${bookingId}/admin-reassign`)
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ newHandymanId: handymanFarId });
            expect(reassignRes.status).toBe(403);
            // Cancel attempt by customer
            const cancelRes = yield (0, supertest_1.default)(index_1.default)
                .patch(`/api/bookings/${bookingId}/admin-cancel`)
                .set('Authorization', `Bearer ${customerToken}`);
            expect(cancelRes.status).toBe(403);
        }));
        it('should allow admin to reassign booking to a new handyman', () => __awaiter(void 0, void 0, void 0, function* () {
            const adminToken = jsonwebtoken_1.default.sign({ userId: 'admin-id', role: 'ADMIN' }, process.env.JWT_SECRET || 'super-secret-dummy-key');
            const res = yield (0, supertest_1.default)(index_1.default)
                .patch(`/api/bookings/${bookingId}/admin-reassign`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ newHandymanId: handymanFarId });
            expect(res.status).toBe(200);
            expect(res.body.handymanId).toBe(handymanFarId);
            expect(res.body.status).toBe('ACCEPTED');
        }));
        it('should allow admin to cancel booking forcefully', () => __awaiter(void 0, void 0, void 0, function* () {
            const adminToken = jsonwebtoken_1.default.sign({ userId: 'admin-id', role: 'ADMIN' }, process.env.JWT_SECRET || 'super-secret-dummy-key');
            const res = yield (0, supertest_1.default)(index_1.default)
                .patch(`/api/bookings/${bookingId}/admin-cancel`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('CANCELLED');
        }));
    });
});

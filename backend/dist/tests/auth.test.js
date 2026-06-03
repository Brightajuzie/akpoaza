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
const testEmail = `test_${Date.now()}@domain.com`;
jest.setTimeout(30000);
describe('Handyman E-Commerce Backend Integration Tests', () => {
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        process.env.NODE_ENV = 'test';
        // Clear out any previous test users if they exist
        yield prisma.user.deleteMany({ where: { email: { startsWith: 'test_' } } });
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        // Clean up test users
        yield prisma.user.deleteMany({ where: { email: { startsWith: 'test_' } } });
        yield prisma.$disconnect();
    }));
    describe('GET /health', () => {
        it('should return 200 and running message', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default).get('/health');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                status: 'ok',
                message: 'Backend is running smoothly.',
            });
        }));
    });
    describe('Auth Endpoints', () => {
        let token = '';
        it('should register a new customer user successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/auth/register')
                .send({
                email: testEmail,
                password: 'password123',
                name: 'Test Customer',
                role: 'CUSTOMER',
            });
            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user.email).toBe(testEmail);
            expect(res.body.user.role).toBe('CUSTOMER');
        }));
        it('should register a new handyman user successfully with specialty, address, and coordinates', () => __awaiter(void 0, void 0, void 0, function* () {
            const testHandymanEmail = `test_handyman_${Date.now()}@domain.com`;
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/auth/register')
                .send({
                email: testHandymanEmail,
                password: 'password123',
                name: 'Test Handyman Plumber',
                role: 'HANDYMAN',
                specialty: 'Plumbing',
                address: '456 Broadway, New York, NY',
                latitude: 40.7128,
                longitude: -74.0060,
                identityNumber: '12345678901',
                kycReferenceId: 'REF_TEST_HANDYMAN_123',
            });
            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user.email).toBe(testHandymanEmail);
            expect(res.body.user.role).toBe('HANDYMAN');
            expect(res.body.user.specialty).toBe('Plumbing');
            expect(res.body.user.address).toBe('456 Broadway, New York, NY');
            expect(res.body.user.latitude).toBe(40.7128);
            expect(res.body.user.longitude).toBe(-74.0060);
            expect(res.body.user.verificationStatus).toBe('PENDING_REVIEW');
            expect(res.body.user.requiresKYC).toBe(false);
        }));
        it('should register a new vendor user successfully with address and coordinates', () => __awaiter(void 0, void 0, void 0, function* () {
            const testVendorEmail = `test_vendor_${Date.now()}@domain.com`;
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/auth/register')
                .send({
                email: testVendorEmail,
                password: 'password123',
                name: 'Test Vendor Store',
                role: 'VENDOR',
                address: '789 Broadway, New York, NY',
                latitude: 40.7200,
                longitude: -74.0100,
                identityNumber: '98765432109',
                kycReferenceId: 'REF_TEST_VENDOR_123',
            });
            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user.email).toBe(testVendorEmail);
            expect(res.body.user.role).toBe('VENDOR');
            expect(res.body.user.address).toBe('789 Broadway, New York, NY');
            expect(res.body.user.latitude).toBe(40.7200);
            expect(res.body.user.longitude).toBe(-74.0100);
            expect(res.body.user.verificationStatus).toBe('PENDING_REVIEW');
            expect(res.body.user.requiresKYC).toBe(false);
        }));
        it('should fail registration if email already exists', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/auth/register')
                .send({
                email: testEmail,
                password: 'password123',
                name: 'Another Customer',
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('User already exists');
        }));
        it('should login the user and return a JWT token', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/auth/login')
                .send({
                email: testEmail,
                password: 'password123',
            });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('token');
            token = res.body.token;
        }));
        it('should fail login with invalid password', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .post('/api/auth/login')
                .send({
                email: testEmail,
                password: 'wrongpassword',
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid credentials');
        }));
        it('should fetch user details using token', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.email).toBe(testEmail);
            expect(res.body.name).toBe('Test Customer');
        }));
        it('should deny profile access if no token is provided', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.default).get('/api/auth/me');
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Access denied. No token provided.');
        }));
    });
});

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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../middleware/auth");
const notifications_1 = require("./notifications");
const prisma_1 = __importDefault(require("../lib/prisma"));
const google_auth_library_1 = require("google-auth-library");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dummy-key';
// Register User
router.post('/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password, name, role, phone, opayPhone, specialty, address, latitude, longitude, identityNumber, kycReferenceId } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const allowedRoles = ['CUSTOMER', 'HANDYMAN', 'VENDOR'];
    if (role && !allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified' });
    }
    try {
        const existingUser = yield prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const salt = yield bcrypt_1.default.genSalt(10);
        const passwordHash = yield bcrypt_1.default.hash(password, salt);
        // Hash the identityNumber (BVN or NIN) if provided
        let bvnHash = null;
        if (identityNumber) {
            bvnHash = crypto_1.default.createHash('sha256').update(identityNumber).digest('hex');
        }
        // Determine verification status
        let verificationStatus = 'UNVERIFIED';
        if (role === 'CUSTOMER') {
            verificationStatus = 'VERIFIED';
        }
        else if (kycReferenceId && identityNumber) {
            verificationStatus = 'PENDING_REVIEW';
        }
        const newUser = yield prisma_1.default.user.create({
            data: {
                email,
                passwordHash,
                name,
                role: (role || 'CUSTOMER'),
                provider: 'LOCAL',
                phone: phone || null,
                opayPhone: opayPhone || phone || null,
                specialty: role === 'HANDYMAN' ? specialty : null,
                address: (role === 'HANDYMAN' || role === 'VENDOR') ? address : null,
                latitude: (role === 'HANDYMAN' || role === 'VENDOR') && latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
                longitude: (role === 'HANDYMAN' || role === 'VENDOR') && longitude !== undefined && longitude !== null ? parseFloat(longitude) : null,
                bvnHash,
                kycReferenceId: kycReferenceId || null,
                kycSubmittedAt: kycReferenceId ? new Date() : null,
                verificationStatus,
            },
        });
        const token = jsonwebtoken_1.default.sign({ userId: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        // Send notifications to admins if KYC is pending review
        if (verificationStatus === 'PENDING_REVIEW') {
            try {
                const admins = yield prisma_1.default.user.findMany({
                    where: { role: 'ADMIN' },
                    select: { id: true },
                });
                for (const admin of admins) {
                    yield (0, notifications_1.createNotification)(prisma_1.default, admin.id, '🔍 New KYC Submission Pending', `User ${newUser.name} (${newUser.role}) submitted verification details during registration.`, 'SYSTEM', newUser.id);
                }
            }
            catch (notifErr) {
                console.error('Error creating admin KYC notifications during register:', notifErr);
            }
        }
        const requiresKYC = (newUser.role === 'VENDOR' || newUser.role === 'HANDYMAN') && newUser.verificationStatus === 'UNVERIFIED';
        const { passwordHash: _ } = newUser, userResponse = __rest(newUser, ["passwordHash"]);
        res.status(201).json({
            token,
            user: Object.assign(Object.assign({}, userResponse), { requiresKYC })
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
}));
// Login User
router.post('/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
    }
    try {
        const user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const isMatch = yield bcrypt_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN') && user.verificationStatus !== 'VERIFIED';
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                verificationStatus: user.verificationStatus,
                requiresKYC
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
}));
// Google OAuth Login / Signup
const googleClient = new google_auth_library_1.OAuth2Client(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-client-id');
router.post('/google', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { idToken, role, email: directEmail, name: directName, picture: directPicture } = req.body;
    try {
        let email;
        let name;
        let picture = null;
        // Try full idToken verification first
        if (idToken) {
            try {
                const ticket = yield googleClient.verifyIdToken({
                    idToken,
                    audience: [
                        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-client-id',
                        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'dummy-ios-client-id',
                        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'dummy-android-client-id'
                    ],
                });
                const payload = ticket.getPayload();
                if (!payload || !payload.email)
                    return res.status(400).json({ error: 'Invalid Google token payload' });
                email = payload.email;
                name = payload.name || directName || 'Google User';
                picture = payload.picture || directPicture || null;
            }
            catch (_verifyErr) {
                // Fallback: use user info sent directly from frontend access-token flow
                if (!directEmail)
                    return res.status(400).json({ error: 'Invalid Google token and no fallback email provided' });
                email = directEmail;
                name = directName || 'Google User';
                picture = directPicture || null;
            }
        }
        else if (directEmail) {
            // Pure access-token fallback
            email = directEmail;
            name = directName || 'Google User';
            picture = directPicture || null;
        }
        else {
            return res.status(400).json({ error: 'Missing idToken or email for Google auth' });
        }
        let user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            const allowedRoles = ['CUSTOMER', 'HANDYMAN', 'VENDOR'];
            const userRole = (role && allowedRoles.includes(role)) ? role : 'CUSTOMER';
            const verificationStatus = userRole === 'CUSTOMER' ? 'VERIFIED' : 'UNVERIFIED';
            user = yield prisma_1.default.user.create({
                data: {
                    email,
                    name,
                    role: userRole,
                    provider: 'GOOGLE',
                    profileImage: picture,
                    verificationStatus,
                }
            });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN') && user.verificationStatus !== 'VERIFIED';
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                verificationStatus: user.verificationStatus,
                requiresKYC
            }
        });
    }
    catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({ error: 'Server error during Google auth' });
    }
}));
// Get Current User Profile
router.get('/me', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                address: true,
                latitude: true,
                longitude: true,
                currentLat: true,
                currentLng: true,
                specialty: true,
                profileImage: true,
                verificationStatus: true,
                kycReferenceId: true,
                kycSubmittedAt: true,
                opayPhone: true,
                rejectionReason: true,
                createdAt: true,
            },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
}));
// Update Current User Location / Geocoordinates
router.patch('/location', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const { latitude, longitude, currentLat, currentLng, address } = req.body;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
                longitude: longitude !== undefined ? parseFloat(longitude) : undefined,
                currentLat: currentLat !== undefined ? parseFloat(currentLat) : undefined,
                currentLng: currentLng !== undefined ? parseFloat(currentLng) : undefined,
                address: address || undefined,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                address: true,
                latitude: true,
                longitude: true,
                currentLat: true,
                currentLng: true,
                specialty: true,
            }
        });
        res.json(updatedUser);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update location' });
    }
}));
exports.default = router;

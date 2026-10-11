"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const notify_1 = require("../lib/notify");
const prisma_1 = __importDefault(require("../lib/prisma"));
const google_auth_library_1 = require("google-auth-library");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dummy-key';
// Register User
router.post('/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password, name, role, phone, opayPhone, specialty, address, latitude, longitude, identityNumber, kycReferenceId, country, currency, pushToken, } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanOpayPhone = opayPhone ? String(opayPhone).trim() : (cleanPhone || null);
    if (!cleanEmail || !password || !cleanName) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    const allowedRoles = ['CUSTOMER', 'HANDYMAN', 'VENDOR', 'RIDER', 'AGENT'];
    if (role && !allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified' });
    }
    try {
        const existingUser = yield prisma_1.default.user.findUnique({ where: { email: cleanEmail } });
        if (existingUser) {
            if (!existingUser.passwordHash) {
                // Guest user converting to a full registered account post-checkout!
                const salt = yield bcrypt_1.default.genSalt(10);
                const passwordHash = yield bcrypt_1.default.hash(password, salt);
                let bvnHash = null;
                if (identityNumber) {
                    const cleanIdentity = String(identityNumber).trim();
                    if (!/^\d{11}$/.test(cleanIdentity)) {
                        return res.status(400).json({
                            error: 'Invalid BVN/NIN: Identification number must be exactly 11 numeric digits.',
                        });
                    }
                    bvnHash = crypto_1.default.createHash('sha256').update(cleanIdentity).digest('hex');
                    const duplicateIdentity = yield prisma_1.default.user.findFirst({
                        where: {
                            bvnHash,
                            verificationStatus: 'VERIFIED',
                            NOT: { email: cleanEmail },
                        },
                    });
                    if (duplicateIdentity) {
                        return res.status(400).json({
                            error: 'This BVN or NIN is already verified on another account.',
                        });
                    }
                }
                const updatedUser = yield prisma_1.default.user.update({
                    where: { email: cleanEmail },
                    data: {
                        passwordHash,
                        name: cleanName || existingUser.name,
                        phone: cleanPhone || existingUser.phone,
                        opayPhone: cleanOpayPhone || existingUser.opayPhone || cleanPhone,
                        address: address ? String(address).trim() : existingUser.address,
                        bvnHash: bvnHash || existingUser.bvnHash,
                        pushToken: pushToken ? String(pushToken).trim() : existingUser.pushToken,
                    },
                });
                const token = jsonwebtoken_1.default.sign({ userId: updatedUser.id, role: updatedUser.role }, JWT_SECRET, { expiresIn: '7d' });
                const { passwordHash: _ } = updatedUser, userResponse = __rest(updatedUser, ["passwordHash"]);
                (0, notify_1.sendWelcomeNotification)(updatedUser).catch(() => { });
                return res.status(200).json({
                    token,
                    user: Object.assign(Object.assign({}, userResponse), { requiresKYC: (updatedUser.role === 'VENDOR' || updatedUser.role === 'HANDYMAN' || updatedUser.role === 'RIDER') && updatedUser.verificationStatus === 'UNVERIFIED' }),
                });
            }
            return res.status(400).json({ error: 'User already exists. Please log in instead.' });
        }
        const salt = yield bcrypt_1.default.genSalt(10);
        const passwordHash = yield bcrypt_1.default.hash(password, salt);
        // Validate identityNumber (BVN or NIN) if provided
        let bvnHash = null;
        if (identityNumber) {
            const cleanIdentity = String(identityNumber).trim();
            if (!/^\d{11}$/.test(cleanIdentity)) {
                return res.status(400).json({
                    error: 'Invalid BVN/NIN: Identification number must be exactly 11 numeric digits.',
                });
            }
            bvnHash = crypto_1.default.createHash('sha256').update(cleanIdentity).digest('hex');
            const duplicateIdentity = yield prisma_1.default.user.findFirst({
                where: {
                    bvnHash,
                    verificationStatus: 'VERIFIED',
                },
            });
            if (duplicateIdentity) {
                return res.status(400).json({
                    error: 'This BVN or NIN is already verified on another account.',
                });
            }
        }
        // Determine verification status
        // Rule 1: Customers are automatically active.
        // Rule 2: Vendors must complete registration (address, phone/opay, BVN/NIN/KYC ref) before being verified.
        // Rule 3: Services men (HANDYMAN) and Riders can ONLY be verified by Admin after complete registration (status PENDING_REVIEW).
        let verificationStatus = 'UNVERIFIED';
        const hasContact = Boolean(cleanPhone || cleanOpayPhone);
        const hasAddress = Boolean(address && String(address).trim());
        const hasIdentity = Boolean(identityNumber || kycReferenceId);
        if (role === 'CUSTOMER' || !role) {
            verificationStatus = 'VERIFIED';
        }
        else if (role === 'VENDOR') {
            // Vendors must complete registration before being verified
            if (hasContact && hasAddress && hasIdentity) {
                verificationStatus = 'VERIFIED';
            }
            else {
                verificationStatus = 'UNVERIFIED';
            }
        }
        else if (role === 'HANDYMAN' || role === 'RIDER') {
            // Services men and riders can ONLY be verified by Admin after complete registration
            const hasRoleSpecific = role === 'HANDYMAN'
                ? Boolean(specialty)
                : Boolean(req.body.vehicleType || req.body.licensePlate);
            if (hasContact && hasAddress && hasIdentity && hasRoleSpecific) {
                verificationStatus = 'PENDING_REVIEW';
            }
            else {
                verificationStatus = 'UNVERIFIED';
            }
        }
        else if (role === 'AGENT') {
            // Agents are regional admins — must be approved by main Admin
            if (hasContact) {
                verificationStatus = 'PENDING_REVIEW';
            }
            else {
                verificationStatus = 'UNVERIFIED';
            }
        }
        const newUser = yield prisma_1.default.user.create({
            data: {
                email: cleanEmail,
                passwordHash,
                name: cleanName,
                role: (role || 'CUSTOMER'),
                provider: 'LOCAL',
                phone: cleanPhone,
                opayPhone: cleanOpayPhone,
                specialty: role === 'HANDYMAN' ? specialty : null,
                address: address ? String(address).trim() : null,
                latitude: (role === 'HANDYMAN' || role === 'VENDOR' || role === 'RIDER') && latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
                longitude: (role === 'HANDYMAN' || role === 'VENDOR' || role === 'RIDER') && longitude !== undefined && longitude !== null ? parseFloat(longitude) : null,
                vehicleType: role === 'RIDER' ? req.body.vehicleType : null,
                licensePlate: role === 'RIDER' ? req.body.licensePlate : null,
                passportPhoto: req.body.passportPhoto || null,
                actionPhoto: req.body.actionPhoto || null,
                profileImage: req.body.passportPhoto || req.body.profileImage || null,
                bvnHash,
                kycReferenceId: kycReferenceId || null,
                kycSubmittedAt: kycReferenceId ? new Date() : null,
                verificationStatus,
                country: country || 'Nigeria',
                currency: currency || 'NGN',
                state: req.body.state ? String(req.body.state).trim() : null,
                pushToken: pushToken ? String(pushToken).trim() : null,
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
                    (0, notify_1.sendNotification)({
                        userId: admin.id,
                        title: '🔍 New KYC Submission Pending',
                        body: `User ${newUser.name} (${newUser.role}) submitted verification details during registration.`,
                        type: 'KYC',
                        referenceId: newUser.id,
                        emailSubject: '🔍 New KYC Submission Pending — FixMart',
                    }).catch(() => { });
                }
            }
            catch (notifErr) {
                console.error('Error creating admin KYC notifications during register:', notifErr);
            }
        }
        // Send welcome notification to user on account creation
        (0, notify_1.sendWelcomeNotification)(newUser).catch(() => { });
        const requiresKYC = (newUser.role === 'VENDOR' || newUser.role === 'HANDYMAN' || newUser.role === 'RIDER' || newUser.role === 'AGENT') && newUser.verificationStatus === 'UNVERIFIED';
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
    const { email, password, pushToken } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
    }
    try {
        let user = yield prisma_1.default.user.findUnique({ where: { email: cleanEmail } });
        if (!user || !user.passwordHash) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const isMatch = yield bcrypt_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        // Sync push token on login if the app sent one and it's new
        if (pushToken && typeof pushToken === 'string') {
            const cleanPushToken = pushToken.trim();
            if (cleanPushToken && cleanPushToken !== user.pushToken) {
                user = yield prisma_1.default.user.update({
                    where: { id: user.id },
                    data: { pushToken: cleanPushToken },
                });
            }
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        // Return the full user profile so the client never needs a separate /me call right after login
        const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN' || user.role === 'RIDER' || user.role === 'AGENT') && user.verificationStatus === 'UNVERIFIED';
        const isPendingReview = user.verificationStatus === 'PENDING_REVIEW';
        const _a = user, { passwordHash: _pw, bvnHash: _bvn } = _a, userFields = __rest(_a, ["passwordHash", "bvnHash"]);
        res.json({
            token,
            user: Object.assign(Object.assign({}, userFields), { requiresKYC,
                isPendingReview }),
        });
    }
    catch (error) {
        const isDbConnError = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error === null || error === void 0 ? void 0 : error.code);
        console.error('[Login Error]', {
            code: error === null || error === void 0 ? void 0 : error.code,
            message: error === null || error === void 0 ? void 0 : error.message,
            meta: error === null || error === void 0 ? void 0 : error.meta,
        });
        res.status(500).json({
            error: isDbConnError
                ? 'Database connection error. The server is waking up — please try again in a moment.'
                : 'Server error during login',
            detail: process.env.NODE_ENV !== 'production' ? error === null || error === void 0 ? void 0 : error.message : undefined,
        });
    }
}));
// Google OAuth Login / Signup
const googleClient = new google_auth_library_1.OAuth2Client();
router.post('/google', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { idToken, role, email: directEmail, name: directName, picture: directPicture, pushToken } = req.body;
    try {
        let email = '';
        let name = '';
        let picture = null;
        // Try full idToken verification first
        if (idToken) {
            try {
                const dbSettings = yield prisma_1.default.appSetting.findMany({
                    where: { key: { in: ['google_web_client_id', 'google_ios_client_id', 'google_android_client_id'] } }
                });
                const settingsMap = dbSettings.reduce((acc, curr) => (Object.assign(Object.assign({}, acc), { [curr.key]: curr.value })), {});
                const webId = (settingsMap.google_web_client_id || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();
                const iosId = (settingsMap.google_ios_client_id || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '').trim();
                const androidId = (settingsMap.google_android_client_id || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim();
                const validAudiences = [webId, iosId, androidId].filter(id => id && !id.startsWith('dummy-'));
                let payload = null;
                try {
                    const ticket = yield googleClient.verifyIdToken(Object.assign({ idToken }, (validAudiences.length > 0 ? { audience: validAudiences } : {})));
                    payload = ticket.getPayload();
                }
                catch (audienceErr) {
                    // If audience verification failed (e.g. token came from an access-token or another client ID in the same Google Cloud project),
                    // try verifying without strict audience restriction
                    console.warn('[GoogleAuth] Audience-restricted verification failed, attempting open verification:', audienceErr === null || audienceErr === void 0 ? void 0 : audienceErr.message);
                    const ticketFallback = yield googleClient.verifyIdToken({ idToken });
                    payload = ticketFallback.getPayload();
                }
                if (payload && payload.email) {
                    email = payload.email;
                    name = payload.name || directName || 'Google User';
                    picture = payload.picture || directPicture || null;
                }
            }
            catch (verifyErr) {
                console.warn('[GoogleAuth] Token verification failed:', verifyErr === null || verifyErr === void 0 ? void 0 : verifyErr.message);
                // Fallback: check if frontend passed user profile from Google's userinfo endpoint
                if (directEmail) {
                    email = directEmail;
                    name = directName || 'Google User';
                    picture = directPicture || null;
                }
            }
        }
        if (!email && directEmail) {
            // Pure access-token / userinfo fallback
            email = directEmail;
            name = directName || 'Google User';
            picture = directPicture || null;
        }
        if (!email) {
            return res.status(400).json({ error: 'Could not resolve a valid email from Google authentication. Please try again.' });
        }
        email = email.trim().toLowerCase();
        let user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            const allowedRoles = ['CUSTOMER', 'HANDYMAN', 'VENDOR', 'RIDER'];
            const userRole = (role && allowedRoles.includes(role)) ? role : 'CUSTOMER';
            const verificationStatus = userRole === 'CUSTOMER' ? 'VERIFIED' : 'UNVERIFIED';
            user = yield prisma_1.default.user.create({
                data: {
                    email,
                    name: name || 'Google User',
                    role: userRole,
                    provider: 'GOOGLE',
                    profileImage: picture,
                    verificationStatus,
                    pushToken: pushToken ? String(pushToken).trim() : null,
                }
            });
            (0, notify_1.sendWelcomeNotification)(user).catch(() => { });
        }
        else {
            // Existing user: update push token and/or profile image if missing
            const updates = {};
            if (pushToken && typeof pushToken === 'string') {
                const cleanPushToken = pushToken.trim();
                if (cleanPushToken && cleanPushToken !== user.pushToken) {
                    updates.pushToken = cleanPushToken;
                }
            }
            if (picture && !user.profileImage) {
                updates.profileImage = picture;
            }
            if (Object.keys(updates).length > 0) {
                user = yield prisma_1.default.user.update({
                    where: { id: user.id },
                    data: updates,
                });
            }
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN' || user.role === 'RIDER' || user.role === 'AGENT') && user.verificationStatus === 'UNVERIFIED';
        const isPendingReview = user.verificationStatus === 'PENDING_REVIEW';
        const _a = user, { passwordHash: _pw, bvnHash: _bvn } = _a, userFields = __rest(_a, ["passwordHash", "bvnHash"]);
        res.json({
            token,
            user: Object.assign(Object.assign({}, userFields), { requiresKYC,
                isPendingReview }),
        });
    }
    catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({
            error: 'Server error during Google authentication',
            detail: process.env.NODE_ENV !== 'production' ? error === null || error === void 0 ? void 0 : error.message : undefined,
        });
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
                passportPhoto: true,
                actionPhoto: true,
                verificationStatus: true,
                kycReferenceId: true,
                kycSubmittedAt: true,
                opayPhone: true,
                rejectionReason: true,
                vehicleType: true,
                licensePlate: true,
                riderStatus: true,
                country: true,
                currency: true,
                state: true,
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
// Update Current User Profile (name, phone, address, country, currency, photos)
router.patch('/profile', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    const { name, phone, address, country, currency, state, passportPhoto, actionPhoto, profileImage } = req.body;
    try {
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                name: name || undefined,
                phone: phone !== undefined ? phone : undefined,
                address: address !== undefined ? address : undefined,
                country: country || undefined,
                currency: currency || undefined,
                state: state !== undefined ? state : undefined,
                passportPhoto: passportPhoto !== undefined ? passportPhoto : undefined,
                actionPhoto: actionPhoto !== undefined ? actionPhoto : undefined,
                profileImage: profileImage !== undefined ? profileImage : (passportPhoto || undefined),
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                address: true,
                profileImage: true,
                passportPhoto: true,
                actionPhoto: true,
                country: true,
                currency: true,
                state: true,
                verificationStatus: true,
            },
        });
        res.json(updatedUser);
    }
    catch (error) {
        console.error('PATCH /auth/profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
}));
/**
 * PATCH /auth/push-token
 * Saves or updates the authenticated user's Expo push notification token.
 * Called by the app on every launch after permission is granted.
 * Body: { pushToken: string }
 */
router.patch('/push-token', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const { pushToken } = req.body;
        if (!pushToken || typeof pushToken !== 'string') {
            return res.status(400).json({ error: 'pushToken is required' });
        }
        const cleanToken = pushToken.trim();
        const existingUser = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, createdAt: true, pushToken: true },
        });
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: { pushToken: cleanToken },
        });
        // If newly registered user (account created within last 15 minutes) and didn't have a push token yet,
        // deliver the welcome phone push notification to their device now!
        if (existingUser && !existingUser.pushToken) {
            const isRecent = (Date.now() - new Date(existingUser.createdAt).getTime()) < 15 * 60 * 1000;
            if (isRecent) {
                (0, notify_1.sendNotification)({
                    userId,
                    title: `🎉 Welcome to FixMart, ${existingUser.name}!`,
                    body: `Your account is ready! Explore verified services, quality products, and fast delivery on FixMart.`,
                    type: 'GENERAL',
                    pushToken: cleanToken,
                }).catch(() => { });
            }
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('PATCH /auth/push-token error:', error);
        res.status(500).json({ error: 'Failed to save push token' });
    }
}));
/**
 * DELETE /auth/push-token
 * Clears the push token on logout so the device no longer receives pushes.
 */
router.delete('/push-token', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: { pushToken: null },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('DELETE /auth/push-token error:', error);
        res.status(500).json({ error: 'Failed to clear push token' });
    }
}));
/**
 * POST /auth/forgot-password
 * Generates a 6-digit OTP and emails it to the user.
 * Body: { email }
 */
router.post('/forgot-password', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail)
        return res.status(400).json({ error: 'Email is required' });
    try {
        const user = yield prisma_1.default.user.findUnique({ where: { email: cleanEmail } });
        // Always return success to prevent email enumeration attacks
        if (!user) {
            return res.json({ success: true, message: 'If an account exists with that email, a reset code has been sent.' });
        }
        // Generate a 6-digit OTP and store its hash with 15-min expiry
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const otpHash = crypto_1.default.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: otpHash,
                passwordResetExpires: expiresAt,
            },
        });
        // Send the OTP via email (fire-and-forget)
        const { sendNotification } = yield Promise.resolve().then(() => __importStar(require('../lib/notify')));
        sendNotification({
            userId: user.id,
            title: '🔐 FixMart Password Reset Code',
            body: `Your password reset code is: ${otp}\n\nThis code expires in 15 minutes. Do not share it with anyone.`,
            type: 'GENERAL',
            email: user.email,
            emailSubject: '🔐 Your FixMart Password Reset Code',
            emailHtml: `
        <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
          Hello <strong>${user.name}</strong>,
        </p>
        <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
          We received a request to reset your FixMart password. Use the code below to set a new password.
        </p>
        <div style="background:#F0F9FF;border:2px solid #BAE6FD;border-radius:14px;padding:24px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#0369A1;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Password Reset Code</p>
          <p style="margin:0;font-size:42px;font-weight:900;color:#0F172A;letter-spacing:10px;">${otp}</p>
          <p style="margin:12px 0 0;font-size:13px;color:#64748B;">⏰ Expires in 15 minutes</p>
        </div>
        <p style="font-size:13px;color:#64748B;line-height:1.5;margin:0 0 12px;">
          Enter this code in the FixMart app to reset your password. If you did not request a password reset, please ignore this email — your account remains secure.
        </p>
        <div style="background:#FFFBEB;border-left:4px solid #F59E0B;padding:12px 14px;border-radius:6px;">
          <p style="margin:0;font-size:12px;color:#92400E;line-height:1.45;">
            <strong>⚠️ Security Notice:</strong> FixMart will never ask for this code over the phone or chat. Keep it private.
          </p>
        </div>
      `,
            smsText: `[FixMart] Your password reset code is: ${otp}. Expires in 15 min. Do not share.`,
        }).catch(() => { });
        res.json({ success: true, message: 'If an account exists with that email, a reset code has been sent.' });
    }
    catch (error) {
        console.error('POST /auth/forgot-password error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
}));
/**
 * POST /auth/reset-password
 * Verifies the OTP and sets a new password.
 * Body: { email, otp, newPassword }
 */
router.post('/reset-password', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, otp, newPassword } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !otp || !newPassword) {
        return res.status(400).json({ error: 'Email, reset code, and new password are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    try {
        const user = yield prisma_1.default.user.findUnique({ where: { email: cleanEmail } });
        if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
            return res.status(400).json({ error: 'Invalid or expired reset code. Please request a new one.' });
        }
        // Check expiry
        if (new Date() > user.passwordResetExpires) {
            return res.status(400).json({ error: 'This reset code has expired. Please request a new one.' });
        }
        // Verify OTP hash
        const otpHash = crypto_1.default.createHash('sha256').update(String(otp).trim()).digest('hex');
        if (otpHash !== user.passwordResetToken) {
            return res.status(400).json({ error: 'Incorrect reset code. Please check your email and try again.' });
        }
        // Hash the new password and clear the OTP fields
        const salt = yield bcrypt_1.default.genSalt(10);
        const passwordHash = yield bcrypt_1.default.hash(newPassword, salt);
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                passwordResetToken: null,
                passwordResetExpires: null,
            },
        });
        res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
    }
    catch (error) {
        console.error('POST /auth/reset-password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
}));
/**
 * POST /auth/token/refresh
 * Re-issues a fresh 30-day JWT for an authenticated user (keeps session alive).
 * Used by the app on launch to silently extend sessions without re-entering credentials.
 */
router.post('/token/refresh', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token });
    }
    catch (error) {
        console.error('POST /auth/token/refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
}));
exports.default = router;

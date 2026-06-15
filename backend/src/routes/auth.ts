import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendNotification } from '../lib/notify';
import prisma from '../lib/prisma';
import { OAuth2Client } from 'google-auth-library';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dummy-key';

// Register User
router.post('/register', async (req, res) => {
  const { 
    email, 
    password, 
    name, 
    role, 
    phone, 
    opayPhone, 
    specialty, 
    address, 
    latitude, 
    longitude, 
    identityNumber, 
    kycReferenceId 
  } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const allowedRoles = ['CUSTOMER', 'HANDYMAN', 'VENDOR', 'RIDER'];
  if (role && !allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified' });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Hash the identityNumber (BVN or NIN) if provided
    let bvnHash = null;
    if (identityNumber) {
      bvnHash = crypto.createHash('sha256').update(identityNumber).digest('hex');
    }

    // Determine verification status
    let verificationStatus: 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' = 'UNVERIFIED';
    if (role === 'CUSTOMER') {
      verificationStatus = 'VERIFIED';
    } else if (kycReferenceId && identityNumber) {
      verificationStatus = 'PENDING_REVIEW';
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: (role || 'CUSTOMER') as any,
        provider: 'LOCAL',
        phone: phone || null,
        opayPhone: opayPhone || phone || null,
        specialty: role === 'HANDYMAN' ? specialty : null,
        address: (role === 'HANDYMAN' || role === 'VENDOR' || role === 'RIDER') ? address : null,
        latitude: (role === 'HANDYMAN' || role === 'VENDOR' || role === 'RIDER') && latitude !== undefined && latitude !== null ? parseFloat(latitude as any) : null,
        longitude: (role === 'HANDYMAN' || role === 'VENDOR' || role === 'RIDER') && longitude !== undefined && longitude !== null ? parseFloat(longitude as any) : null,
        vehicleType: role === 'RIDER' ? req.body.vehicleType : null,
        licensePlate: role === 'RIDER' ? req.body.licensePlate : null,
        bvnHash,
        kycReferenceId: kycReferenceId || null,
        kycSubmittedAt: kycReferenceId ? new Date() : null,
        verificationStatus,
      },
    });

    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Send notifications to admins if KYC is pending review
    if (verificationStatus === 'PENDING_REVIEW') {
      try {
        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true },
        });
        for (const admin of admins) {
          sendNotification({
            userId: admin.id,
            title: '🔍 New KYC Submission Pending',
            body: `User ${newUser.name} (${newUser.role}) submitted verification details during registration.`,
            type: 'KYC',
            referenceId: newUser.id,
            emailSubject: '🔍 New KYC Submission Pending — Akpoaza',
          }).catch(() => {});
        }
      } catch (notifErr) {
        console.error('Error creating admin KYC notifications during register:', notifErr);
      }
    }

    const requiresKYC = (newUser.role === 'VENDOR' || newUser.role === 'HANDYMAN' || newUser.role === 'RIDER') && newUser.verificationStatus === 'UNVERIFIED';
    
    const { passwordHash: _, ...userResponse } = newUser;

    res.status(201).json({
      token,
      user: {
        ...userResponse,
        requiresKYC
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN' || user.role === 'RIDER') && user.verificationStatus !== 'VERIFIED';
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
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Google OAuth Login / Signup
const googleClient = new OAuth2Client(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-client-id');

router.post('/google', async (req, res) => {
  const { idToken, role, email: directEmail, name: directName, picture: directPicture } = req.body;

  try {
    let email: string;
    let name: string;
    let picture: string | null = null;

    // Try full idToken verification first
    if (idToken) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: [
            process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-client-id',
            process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'dummy-ios-client-id',
            process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'dummy-android-client-id'
          ],
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) return res.status(400).json({ error: 'Invalid Google token payload' });
        email   = payload.email;
        name    = payload.name || directName || 'Google User';
        picture = payload.picture || directPicture || null;
      } catch (_verifyErr) {
        // Fallback: use user info sent directly from frontend access-token flow
        if (!directEmail) return res.status(400).json({ error: 'Invalid Google token and no fallback email provided' });
        email   = directEmail;
        name    = directName || 'Google User';
        picture = directPicture || null;
      }
    } else if (directEmail) {
      // Pure access-token fallback
      email   = directEmail;
      name    = directName || 'Google User';
      picture = directPicture || null;
    } else {
      return res.status(400).json({ error: 'Missing idToken or email for Google auth' });
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const allowedRoles = ['CUSTOMER', 'HANDYMAN', 'VENDOR', 'RIDER'];
      const userRole = (role && allowedRoles.includes(role)) ? role : 'CUSTOMER';
      const verificationStatus: 'UNVERIFIED' | 'VERIFIED' = userRole === 'CUSTOMER' ? 'VERIFIED' : 'UNVERIFIED';

      user = await prisma.user.create({
        data: {
          email,
          name,
          role: userRole as any,
          provider: 'GOOGLE',
          profileImage: picture,
          verificationStatus,
        }
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN' || user.role === 'RIDER') && user.verificationStatus !== 'VERIFIED';
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
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ error: 'Server error during Google auth' });
  }
});

// Get Current User Profile
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({
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
        vehicleType: true,
        licensePlate: true,
        riderStatus: true,
        createdAt: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update Current User Location / Geocoordinates
router.patch('/location', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  const { latitude, longitude, currentLat, currentLng, address } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const updatedUser = await prisma.user.update({
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

export default router;

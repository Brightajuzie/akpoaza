import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendNotification, sendWelcomeNotification } from '../lib/notify';
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
    kycReferenceId,
    country,
    currency,
    pushToken,
  } = req.body;

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
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      if (!existingUser.passwordHash) {
        // Guest user converting to a full registered account post-checkout!
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        let bvnHash = null;
        if (identityNumber) {
          const cleanIdentity = String(identityNumber).trim();
          if (!/^\d{11}$/.test(cleanIdentity)) {
            return res.status(400).json({
              error: 'Invalid BVN/NIN: Identification number must be exactly 11 numeric digits.',
            });
          }
          bvnHash = crypto.createHash('sha256').update(cleanIdentity).digest('hex');
          const duplicateIdentity = await prisma.user.findFirst({
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

        const updatedUser = await prisma.user.update({
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

        const token = jwt.sign(
          { userId: updatedUser.id, role: updatedUser.role },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        const { passwordHash: _, ...userResponse } = updatedUser;
        sendWelcomeNotification(updatedUser).catch(() => {});
        return res.status(200).json({
          token,
          user: {
            ...userResponse,
            requiresKYC: (updatedUser.role === 'VENDOR' || updatedUser.role === 'HANDYMAN' || updatedUser.role === 'RIDER') && updatedUser.verificationStatus === 'UNVERIFIED',
          },
        });
      }
      return res.status(400).json({ error: 'User already exists. Please log in instead.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Validate identityNumber (BVN or NIN) if provided
    let bvnHash = null;
    if (identityNumber) {
      const cleanIdentity = String(identityNumber).trim();
      if (!/^\d{11}$/.test(cleanIdentity)) {
        return res.status(400).json({
          error: 'Invalid BVN/NIN: Identification number must be exactly 11 numeric digits.',
        });
      }
      bvnHash = crypto.createHash('sha256').update(cleanIdentity).digest('hex');
      const duplicateIdentity = await prisma.user.findFirst({
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
    let verificationStatus: 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' = 'UNVERIFIED';
    const hasContact = Boolean(cleanPhone || cleanOpayPhone);
    const hasAddress = Boolean(address && String(address).trim());
    const hasIdentity = Boolean(identityNumber || kycReferenceId);

    if (role === 'CUSTOMER' || !role) {
      verificationStatus = 'VERIFIED';
    } else if (role === 'VENDOR') {
      // Vendors must complete registration before being verified
      if (hasContact && hasAddress && hasIdentity) {
        verificationStatus = 'VERIFIED';
      } else {
        verificationStatus = 'UNVERIFIED';
      }
    } else if (role === 'HANDYMAN' || role === 'RIDER') {
      // Services men and riders can ONLY be verified by Admin after complete registration
      const hasRoleSpecific = role === 'HANDYMAN' 
        ? Boolean(specialty)
        : Boolean(req.body.vehicleType || req.body.licensePlate);
      if (hasContact && hasAddress && hasIdentity && hasRoleSpecific) {
        verificationStatus = 'PENDING_REVIEW';
      } else {
        verificationStatus = 'UNVERIFIED';
      }
    } else if (role === 'AGENT') {
      // Agents are regional admins — must be approved by main Admin
      if (hasContact) {
        verificationStatus = 'PENDING_REVIEW';
      } else {
        verificationStatus = 'UNVERIFIED';
      }
    }

    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        name: cleanName,
        role: (role || 'CUSTOMER') as any,
        provider: 'LOCAL',
        phone: cleanPhone,
        opayPhone: cleanOpayPhone,
        specialty: role === 'HANDYMAN' ? specialty : null,
        address: address ? String(address).trim() : null,
        latitude: (role === 'HANDYMAN' || role === 'VENDOR' || role === 'RIDER') && latitude !== undefined && latitude !== null ? parseFloat(latitude as any) : null,
        longitude: (role === 'HANDYMAN' || role === 'VENDOR' || role === 'RIDER') && longitude !== undefined && longitude !== null ? parseFloat(longitude as any) : null,
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
            emailSubject: '🔍 New KYC Submission Pending — FixMart',
          }).catch(() => {});
        }
      } catch (notifErr) {
        console.error('Error creating admin KYC notifications during register:', notifErr);
      }
    }

    // Send welcome notification to user on account creation
    sendWelcomeNotification(newUser).catch(() => {});

    const requiresKYC = (newUser.role === 'VENDOR' || newUser.role === 'HANDYMAN' || newUser.role === 'RIDER' || newUser.role === 'AGENT') && newUser.verificationStatus === 'UNVERIFIED';
    
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
  const { email, password, pushToken } = req.body;

  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Sync push token on login if the app sent one and it's new
    if (pushToken && typeof pushToken === 'string') {
      const cleanPushToken = pushToken.trim();
      if (cleanPushToken && cleanPushToken !== user.pushToken) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { pushToken: cleanPushToken },
        });
      }
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Return the full user profile so the client never needs a separate /me call right after login
    const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN' || user.role === 'RIDER' || user.role === 'AGENT') && user.verificationStatus === 'UNVERIFIED';
    const isPendingReview = user.verificationStatus === 'PENDING_REVIEW';

    const { passwordHash: _pw, bvnHash: _bvn, ...userFields } = user as any;

    res.json({
      token,
      user: {
        ...userFields,
        requiresKYC,
        isPendingReview,
      },
    });
  } catch (error: any) {
    const isDbConnError = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error?.code);
    console.error('[Login Error]', {
      code: error?.code,
      message: error?.message,
      meta: error?.meta,
    });
    res.status(500).json({
      error: isDbConnError
        ? 'Database connection error. The server is waking up — please try again in a moment.'
        : 'Server error during login',
      detail: process.env.NODE_ENV !== 'production' ? error?.message : undefined,
    });
  }
});

// Google OAuth Login / Signup
const googleClient = new OAuth2Client();

router.post('/google', async (req, res) => {
  const { idToken, role, email: directEmail, name: directName, picture: directPicture, pushToken } = req.body;

  try {
    let email: string;
    let name: string;
    let picture: string | null = null;

    // Try full idToken verification first
    if (idToken) {
      try {
        const dbSettings = await prisma.appSetting.findMany({
          where: { key: { in: ['google_web_client_id', 'google_ios_client_id', 'google_android_client_id'] } }
        });
        const settingsMap = dbSettings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>);

        const webId     = settingsMap.google_web_client_id     || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID     || '';
        const iosId     = settingsMap.google_ios_client_id     || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID     || '';
        const androidId = settingsMap.google_android_client_id || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

        const validAudiences = [webId, iosId, androidId].filter(id => id && !id.startsWith('dummy-'));
        const ticket = await googleClient.verifyIdToken({
          idToken,
          ...(validAudiences.length > 0 ? { audience: validAudiences } : {}),
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

    email = email.trim().toLowerCase();
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
          pushToken: pushToken ? String(pushToken).trim() : null,
        }
      });

      sendWelcomeNotification(user).catch(() => {});
    } else if (pushToken && typeof pushToken === 'string') {
      // Update push token for returning Google users if it changed
      const cleanPushToken = pushToken.trim();
      if (cleanPushToken && cleanPushToken !== user.pushToken) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { pushToken: cleanPushToken },
        });
      }
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const requiresKYC = (user.role === 'VENDOR' || user.role === 'HANDYMAN' || user.role === 'RIDER' || user.role === 'AGENT') && user.verificationStatus === 'UNVERIFIED';
    const isPendingReview = user.verificationStatus === 'PENDING_REVIEW';

    const { passwordHash: _pw, bvnHash: _bvn, ...userFields } = user as any;

    res.json({
      token,
      user: {
        ...userFields,
        requiresKYC,
        isPendingReview,
      },
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

// Update Current User Profile (name, phone, address, country, currency, photos)
router.patch('/profile', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name, phone, address, country, currency, state, passportPhoto, actionPhoto, profileImage } = req.body;

  try {
    const updatedUser = await prisma.user.update({
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
  } catch (error) {
    console.error('PATCH /auth/profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * PATCH /auth/push-token
 * Saves or updates the authenticated user's Expo push notification token.
 * Called by the app on every launch after permission is granted.
 * Body: { pushToken: string }
 */
router.patch('/push-token', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { pushToken } = req.body;

    if (!pushToken || typeof pushToken !== 'string') {
      return res.status(400).json({ error: 'pushToken is required' });
    }

    const cleanToken = pushToken.trim();
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, createdAt: true, pushToken: true },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: cleanToken },
    });

    // If newly registered user (account created within last 15 minutes) and didn't have a push token yet,
    // deliver the welcome phone push notification to their device now!
    if (existingUser && !existingUser.pushToken) {
      const isRecent = (Date.now() - new Date(existingUser.createdAt).getTime()) < 15 * 60 * 1000;
      if (isRecent) {
        sendNotification({
          userId,
          title: `🎉 Welcome to FixMart, ${existingUser.name}!`,
          body: `Your account is ready! Explore verified services, quality products, and fast delivery on FixMart.`,
          type: 'GENERAL',
          pushToken: cleanToken,
        }).catch(() => {});
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('PATCH /auth/push-token error:', error);
    res.status(500).json({ error: 'Failed to save push token' });
  }
});

/**
 * DELETE /auth/push-token
 * Clears the push token on logout so the device no longer receives pushes.
 */
router.delete('/push-token', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: null },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('DELETE /auth/push-token error:', error);
    res.status(500).json({ error: 'Failed to clear push token' });
  }
});

/**
 * POST /auth/forgot-password
 * Generates a 6-digit OTP and emails it to the user.
 * Body: { email }
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    // Always return success to prevent email enumeration attacks
    if (!user) {
      return res.json({ success: true, message: 'If an account exists with that email, a reset code has been sent.' });
    }

    // Generate a 6-digit OTP and store its hash with 15-min expiry
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: otpHash,
        passwordResetExpires: expiresAt,
      },
    });

    // Send the OTP via email (fire-and-forget)
    const { sendNotification } = await import('../lib/notify');
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
    }).catch(() => {});

    res.json({ success: true, message: 'If an account exists with that email, a reset code has been sent.' });
  } catch (error) {
    console.error('POST /auth/forgot-password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /auth/reset-password
 * Verifies the OTP and sets a new password.
 * Body: { email, otp, newPassword }
 */
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, reset code, and new password are required' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
      return res.status(400).json({ error: 'Invalid or expired reset code. Please request a new one.' });
    }

    // Check expiry
    if (new Date() > user.passwordResetExpires) {
      return res.status(400).json({ error: 'This reset code has expired. Please request a new one.' });
    }

    // Verify OTP hash
    const otpHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (otpHash !== user.passwordResetToken) {
      return res.status(400).json({ error: 'Incorrect reset code. Please check your email and try again.' });
    }

    // Hash the new password and clear the OTP fields
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('POST /auth/reset-password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * POST /auth/token/refresh
 * Re-issues a fresh 30-day JWT for an authenticated user (keeps session alive).
 * Used by the app on launch to silently extend sessions without re-entering credentials.
 */
router.post('/token/refresh', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (error) {
    console.error('POST /auth/token/refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

export default router;

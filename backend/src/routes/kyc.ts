import { Router, Response } from 'express';
import { VerificationStatus } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import axios from 'axios';
import crypto from 'crypto';
import { createNotification } from './notifications';
import prisma from '../lib/prisma';

const router = Router();

// Dojah Credentials (defaults to mock/sandbox mode if not defined in .env)
const DOJAH_APP_ID = process.env.DOJAH_APP_ID;
const DOJAH_SECRET_KEY = process.env.DOJAH_SECRET_KEY;
const DOJAH_BASE_URL = process.env.DOJAH_BASE_URL || 'https://api.dojah.io';
const IS_SANDBOX = !DOJAH_APP_ID || !DOJAH_SECRET_KEY || process.env.DOJAH_SANDBOX === 'true';

// Helper to deterministically hash BVN to check for duplicates without storing raw data
const hashBVN = (bvn: string): string => {
  return crypto.createHash('sha256').update(bvn).digest('hex');
};

/**
 * GET /api/kyc/status
 * Get the KYC status for the authenticated user
 */
router.get('/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        verificationStatus: true,
        kycReferenceId: true,
        kycSubmittedAt: true,
        opayPhone: true,
        rejectionReason: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('GET /kyc/status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/kyc/bvn
 * Validate BVN via Dojah API or Sandbox Simulator
 * Body: { bvn: string, consent: boolean }
 */
router.post('/bvn', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { bvn, consent } = req.body;

  if (!consent) {
    return res.status(400).json({ error: 'User consent is mandatory for BVN verification' });
  }

  if (!bvn || bvn.length !== 11 || !/^\d+$/.test(bvn)) {
    return res.status(400).json({ error: 'Invalid BVN. Must be exactly 11 digits.' });
  }

  try {
    const hashed = hashBVN(bvn);

    // Prevent duplicate BVN usage
    const duplicate = await prisma.user.findFirst({
      where: {
        bvnHash: hashed,
        verificationStatus: 'VERIFIED',
        NOT: { id: userId },
      },
    });

    if (duplicate) {
      return res.status(400).json({ error: 'This BVN is already verified by another account' });
    }

    // Call Dojah or Mock
    if (IS_SANDBOX) {
      console.log(`[KYC Sandbox] Mock BVN verification for User: ${userId}, BVN: ${bvn}`);
      // Retrieve the current user's name to simulate a match
      const currentUser = await prisma.user.findUnique({ where: { id: userId } });
      
      // Mock data match
      return res.json({
        success: true,
        message: 'BVN verified successfully (Sandbox Mock)',
        data: {
          bvn,
          first_name: currentUser?.name.split(' ')[0] || 'John',
          last_name: currentUser?.name.split(' ')[1] || 'Doe',
          dob: '1990-01-01',
          formatted_name: currentUser?.name || 'John Doe',
          match_score: 98,
        },
      });
    }

    // Live Dojah Request
    try {
      const response = await axios.post(
        `${DOJAH_BASE_URL}/api/v1/kyc/bvn`,
        { bvn },
        {
          timeout: 10_000, // 10 s – prevents backend hang when Dojah is unreachable
          headers: {
            'Authorization': DOJAH_SECRET_KEY,
            'AppId': DOJAH_APP_ID,
            'Content-Type': 'application/json',
          },
        }
      );

      const dojahData = response.data?.entity;
      if (!dojahData) {
        return res.status(400).json({ error: 'BVN could not be verified with the provider.' });
      }

      // Check match score if returned, or construct success
      return res.json({
        success: true,
        message: 'BVN verified successfully',
        data: {
          bvn: dojahData.bvn,
          first_name: dojahData.first_name,
          last_name: dojahData.last_name,
          dob: dojahData.dob,
          formatted_name: `${dojahData.first_name} ${dojahData.last_name}`,
          match_score: dojahData.match_score || 100,
        },
      });
    } catch (apiError: any) {
      console.error('Dojah BVN API Error:', apiError?.response?.data || apiError.message);
      return res.status(400).json({
        error: apiError?.response?.data?.error || 'Verification failed on Dojah server.',
      });
    }
  } catch (error) {
    console.error('POST /kyc/bvn error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/kyc/nin
 * Validate National Identity Number (NIN)
 * Body: { nin: string }
 */
router.post('/nin', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { nin } = req.body;

  if (!nin || nin.length !== 11 || !/^\d+$/.test(nin)) {
    return res.status(400).json({ error: 'Invalid NIN. Must be exactly 11 digits.' });
  }

  try {
    if (IS_SANDBOX) {
      console.log(`[KYC Sandbox] Mock NIN verification for User: ${userId}, NIN: ${nin}`);
      return res.json({
        success: true,
        message: 'NIN verified successfully (Sandbox Mock)',
        data: {
          nin,
          match_score: 100,
        },
      });
    }

    try {
      const response = await axios.post(
        `${DOJAH_BASE_URL}/api/v1/kyc/nin`,
        { nin },
        {
          timeout: 10_000,
          headers: {
            'Authorization': DOJAH_SECRET_KEY,
            'AppId': DOJAH_APP_ID,
            'Content-Type': 'application/json',
          },
        }
      );

      const dojahData = response.data?.entity;
      if (!dojahData) {
        return res.status(400).json({ error: 'NIN could not be verified with the provider.' });
      }

      return res.json({
        success: true,
        message: 'NIN verified successfully',
        data: dojahData,
      });
    } catch (apiError: any) {
      console.error('Dojah NIN API Error:', apiError?.response?.data || apiError.message);
      return res.status(400).json({
        error: apiError?.response?.data?.error || 'NIN verification failed.',
      });
    }
  } catch (error) {
    console.error('POST /kyc/nin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/kyc/liveness
 * Verify selfie liveness check
 * Body: { referenceId: string }
 */
router.post('/liveness', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { referenceId } = req.body;

  if (!referenceId) {
    return res.status(400).json({ error: 'Missing reference ID from SDK widget.' });
  }

  try {
    if (IS_SANDBOX) {
      console.log(`[KYC Sandbox] Mock Liveness check for reference ID: ${referenceId}`);
      return res.json({
        success: true,
        message: 'Selfie matching passed (Sandbox Mock)',
        confidence: 0.98,
      });
    }

    try {
      // Fetch selfie verify status from Dojah
      const response = await axios.get(
        `${DOJAH_BASE_URL}/api/v1/kyc/liveness/verify?reference=${referenceId}`,
        {
          timeout: 10_000,
          headers: {
            'Authorization': DOJAH_SECRET_KEY,
            'AppId': DOJAH_APP_ID,
          },
        }
      );

      const entity = response.data?.entity;
      if (!entity || !entity.verified) {
        return res.status(400).json({ error: 'Liveness/Selfie check failed verification.' });
      }

      return res.json({
        success: true,
        message: 'Selfie matching passed',
        confidence: entity.confidence || 1.0,
      });
    } catch (apiError: any) {
      console.error('Dojah Liveness Check API Error:', apiError?.response?.data || apiError.message);
      return res.status(400).json({
        error: apiError?.response?.data?.error || 'Liveness check verification failed.',
      });
    }
  } catch (error) {
    console.error('POST /kyc/liveness error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/kyc/submit
 * Finalize the KYC submission. Transition status to PENDING_REVIEW or auto-approve
 * Body: { bvn?: string, nin?: string, opayPhone: string, referenceId?: string }
 */
router.post('/submit', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { bvn, nin, opayPhone, referenceId } = req.body;

  if (!bvn && !nin) {
    return res.status(400).json({ error: 'Either BVN or NIN is required to complete verification.' });
  }
  if (!opayPhone) {
    return res.status(400).json({ error: 'OPay phone number is required for wallet payout configuration.' });
  }

  try {
    const docValue = bvn || nin;
    const hashed = hashBVN(docValue!);

    // Prevent duplicate BVN/NIN usage
    const duplicate = await prisma.user.findFirst({
      where: {
        bvnHash: hashed,
        verificationStatus: 'VERIFIED',
        NOT: { id: userId },
      },
    });

    if (duplicate) {
      return res.status(400).json({ error: 'This identity document is already verified by another account' });
    }

    // Save submission data and set status to PENDING_REVIEW
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: 'PENDING_REVIEW',
        bvnHash: hashed,
        kycReferenceId: referenceId || `MOCK_REF_${Date.now()}`,
        kycSubmittedAt: new Date(),
        opayPhone: opayPhone,
        rejectionReason: null, // Clear any previous rejection
      },
    });

    // Notify Admins about new KYC pending review
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    for (const admin of admins) {
      await createNotification(
        prisma,
        admin.id,
        '🔍 New KYC Submission Pending',
        `User ${updatedUser.name} (${updatedUser.role}) submitted verification details.`,
        'SYSTEM',
        updatedUser.id
      );
    }

    res.json({
      success: true,
      message: 'KYC submitted successfully. Pending Admin review.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        verificationStatus: updatedUser.verificationStatus,
      },
    });
  } catch (error) {
    console.error('POST /kyc/submit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/kyc/admin/reviews
 * Admin-only: list all pending, verified, or rejected submissions
 */
router.get('/admin/reviews', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const adminUser = await prisma.user.findUnique({ where: { id: userId } });

    if (!adminUser || adminUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin access required.' });
    }

    const reviews = await prisma.user.findMany({
      where: {
        role: { in: ['VENDOR', 'HANDYMAN'] },
        verificationStatus: { not: 'UNVERIFIED' },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        verificationStatus: true,
        kycSubmittedAt: true,
        opayPhone: true,
        kycReferenceId: true,
        rejectionReason: true,
        phone: true,
      },
      orderBy: { kycSubmittedAt: 'desc' },
    });

    res.json({ reviews });
  } catch (error) {
    console.error('GET /kyc/admin/reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/kyc/:userId/review
 * Admin-only: approve or reject user verification
 * Body: { status: 'VERIFIED' | 'REJECTED', reason?: string }
 */
router.patch('/:userId/review', authenticateToken, async (req: AuthRequest, res: Response) => {
  const adminId = req.user!.userId;
  const targetUserId = req.params.userId;
  const { status, reason } = req.body;

  if (status !== 'VERIFIED' && status !== 'REJECTED') {
    return res.status(400).json({ error: 'Invalid verification status decision. Must be VERIFIED or REJECTED.' });
  }

  try {
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    if (!adminUser || adminUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin access required.' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        verificationStatus: status as VerificationStatus,
        rejectionReason: status === 'REJECTED' ? reason || 'Details did not match public database records.' : null,
      },
    });

    // Notify User
    const title = status === 'VERIFIED' ? '✅ Verification Approved!' : '❌ Verification Rejected';
    const body = status === 'VERIFIED'
      ? 'Congratulations, your identity has been verified! You can now accept jobs and list products.'
      : `Your verification request was rejected. Reason: ${reason || 'Invalid documents.'} Please update and re-submit.`;

    await createNotification(
      prisma,
      targetUserId,
      title,
      body,
      'SYSTEM',
      adminId
    );

    res.json({
      success: true,
      message: `KYC review submitted successfully. User status updated to ${status}.`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        verificationStatus: updatedUser.verificationStatus,
      },
    });
  } catch (error) {
    console.error('PATCH /kyc/:userId/review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

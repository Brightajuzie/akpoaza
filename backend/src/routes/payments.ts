import { Router, Request, Response, NextFunction } from 'express';
import { PaymentProvider } from '@prisma/client';
import Stripe from 'stripe';
import axios from 'axios';
import prisma from '../lib/prisma';
import { createEscrowForPaidItem, releaseEscrow, triggerSplitWebhook, getOrCreateWallet } from '../lib/wallet';
import { sendNotification } from '../lib/notify';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Paystack generic configuration
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Flutterwave generic configuration
const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

// Helper to determine the server's base URL
function getBaseUrl(req: Request): string {
  if (process.env.API_URL) return process.env.API_URL.replace(/\/api\/?$/, '');
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/api\/?$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:5000';
  return `${proto}://${host}`;
}

// Helper to determine the frontend URL
function getFrontendUrl(req: Request): string {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
  if (req.headers.origin && typeof req.headers.origin === 'string') return req.headers.origin;
  if (req.headers.referer && typeof req.headers.referer === 'string') {
    try {
      const u = new URL(req.headers.referer);
      return `${u.protocol}//${u.host}`;
    } catch { /* ignore */ }
  }
  return 'http://localhost:8081';
}

// Shared helper to process payment verification across all providers
async function processPaymentVerification({
  provider,
  reference,
  checkoutType,
  id,
  chargedAmount,
}: {
  provider: 'STRIPE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY';
  reference: string;
  checkoutType: string;
  id: string;
  chargedAmount: number;
}) {
  if (checkoutType === 'order') {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new Error('Order not found');

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentProvider: provider,
        paymentRef: reference,
        amountPaid: { increment: chargedAmount },
      },
    });

    await createEscrowForPaidItem('order', id, chargedAmount).catch(err =>
      console.error(`[Escrow] Hold failed for order ${id}:`, err)
    );

    // Auto-release escrow only when final split payment installment is reached
    if (updatedOrder.isSplitPayment && updatedOrder.amountPaid >= updatedOrder.totalAmount) {
      const activeEscrows = await prisma.escrow.findMany({ where: { orderId: id, status: 'HELD' } });
      for (const esc of activeEscrows) {
        await releaseEscrow(esc.id).catch(err =>
          console.error(`[Escrow] Failed to release escrow on final split payment for order ${id}:`, err)
        );
      }
      await prisma.order.update({ where: { id }, data: { status: 'DELIVERED' } });
    }

    // ── Dispatch notifications for paid order ───────────────────────────
    try {
      const orderUser = await prisma.user.findUnique({
        where: { id: updatedOrder.userId },
        select: { name: true, email: true, phone: true },
      });

      // 1. Customer notification: in-app, SMS, email
      sendNotification({
        userId: updatedOrder.userId,
        title: '💳 Payment Confirmed — Order in Dispatch',
        body: `Payment of ₦${chargedAmount.toLocaleString()} confirmed! Your product will be delivered within a few hours, and a rider will call you to confirm your location.`,
        type: 'ORDER',
        referenceId: id,
        email: orderUser?.email,
        phone: orderUser?.phone || undefined,
        emailSubject: '✅ Payment Confirmed & Delivery Notice — FixMart',
        emailHtml: `<p style="font-size:16px;color:#374151">Hi ${orderUser?.name || 'there'},</p>
          <p>We've received your payment of <strong>₦${chargedAmount.toLocaleString()}</strong> for Order #${id.slice(-6).toUpperCase()} via ${provider}.</p>
          <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;font-size:15px;color:#065F46;font-weight:600">🚚 Delivery Update:</p>
            <p style="margin:4px 0 0;font-size:14px;color:#1F2937">Your product will be delivered within a few hours. A rider will call you shortly to confirm your location.</p>
          </div>
          <p><strong>Order ID:</strong> ${id}</p>
          <p><strong>Delivery Address:</strong> ${updatedOrder.deliveryAddress || 'On file'}</p>
          <p>Thank you for shopping with <strong>FixMart</strong>!</p>`,
      }).catch(() => {});

      // 2. Admin notification
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, email: true },
      });
      for (const admin of admins) {
        sendNotification({
          userId: admin.id,
          title: `💰 Payment Received: Order #${id.slice(-6).toUpperCase()}`,
          body: `Payment of ₦${chargedAmount.toLocaleString()} verified via ${provider} for Order #${id.slice(-6).toUpperCase()} (${orderUser?.name || 'Customer'}). Delivery required within a few hours.`,
          type: 'ORDER',
          referenceId: id,
          email: admin.email,
          emailSubject: `💰 [Admin Alert] Order #${id.slice(-6).toUpperCase()} Paid & Ready for Fulfillment`,
          emailHtml: `<p>Payment has been confirmed for an order.</p>
            <p><strong>Order ID:</strong> ${id}</p>
            <p><strong>Customer:</strong> ${orderUser?.name} (${orderUser?.email})</p>
            <p><strong>Amount Paid:</strong> ₦${chargedAmount.toLocaleString()}</p>
            <p><strong>Provider:</strong> ${provider} (Ref: ${reference})</p>
            <p><strong>Delivery Address:</strong> ${updatedOrder.deliveryAddress || 'Not specified'}</p>
            <p>Please ensure dispatch is progressing within the next few hours.</p>`,
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[payments] Failed to dispatch payment notifications for order:', err);
    }

    return { type: 'order', record: updatedOrder };
  } else if (checkoutType === 'booking') {
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new Error('Booking not found');

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        amountPaid: { increment: chargedAmount },
      },
    });

    await createEscrowForPaidItem('booking', id, chargedAmount).catch(err =>
      console.error(`[Escrow] Hold failed for booking ${id}:`, err)
    );

    // Auto-release escrow only when final split payment installment is reached
    if (updatedBooking.isSplitPayment && updatedBooking.amountPaid >= updatedBooking.totalPrice) {
      const activeEscrows = await prisma.escrow.findMany({ where: { bookingId: id, status: 'HELD' } });
      for (const esc of activeEscrows) {
        await releaseEscrow(esc.id).catch(err =>
          console.error(`[Escrow] Failed to release escrow on final split payment for booking ${id}:`, err)
        );
      }
      await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED' } });
    }

    return { type: 'booking', record: updatedBooking };
  } else if (checkoutType === 'parcel') {
    const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
    if (!parcel) throw new Error('Parcel delivery not found');

    const updatedParcel = await prisma.parcelDelivery.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentProvider: provider,
        paymentRef: reference,
      },
    });

    await createEscrowForPaidItem('parcel', id, chargedAmount || parcel.totalAmount).catch(err =>
      console.error(`[Escrow] Hold failed for parcel ${id}:`, err)
    );

    return { type: 'parcel', record: updatedParcel };
  }

  throw new Error(`Invalid checkout type: ${checkoutType}`);
}

// Render branded HTML success confirmation page
function renderSuccessHtml(provider: string, reference: string, frontendUrl: string, title?: string, message?: string) {
  const displayTitle = title || `${provider} Payment Successful!`;
  const displayMessage = message || `Your transaction was completed and verified successfully. Reference: ${reference}`;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${displayTitle}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
            color: #F1F5F9;
          }
          .card {
            background: #FFFFFF;
            color: #0F172A;
            border-radius: 24px;
            padding: 40px 32px;
            max-width: 440px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            border: 1px solid #E2E8F0;
          }
          .badge-icon {
            width: 72px;
            height: 72px;
            background: #ECFDF5;
            color: #10B981;
            border-radius: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            margin: 0 auto 20px auto;
            border: 2px solid #A7F3D0;
          }
          h1 {
            font-size: 22px;
            font-weight: 800;
            margin: 0 0 10px 0;
            color: #0F172A;
          }
          p {
            font-size: 14px;
            color: #64748B;
            line-height: 1.5;
            margin: 0 0 24px 0;
          }
          .ref-box {
            background: #F8FAFC;
            border: 1px dashed #CBD5E1;
            padding: 10px 14px;
            border-radius: 12px;
            font-family: monospace;
            font-size: 12px;
            color: #475569;
            word-break: break-all;
            margin-bottom: 24px;
          }
          .btn {
            display: block;
            background: #22A45D;
            color: #FFFFFF;
            text-decoration: none;
            padding: 14px 20px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            width: 100%;
            box-sizing: border-box;
          }
          .btn:hover {
            background: #1B8A4C;
          }
          .subtext {
            font-size: 11px;
            color: #94A3B8;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge-icon">✓</div>
          <h1>${displayTitle}</h1>
          <p>${displayMessage}</p>
          <div class="ref-box">REF: ${reference}</div>
          <button class="btn" onclick="returnToApp()">← Return to FixMart App</button>
          <div class="subtext">Auto-redirecting back to app...</div>
        </div>

        <script>
          function notifyAndRedirect() {
            try {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'success', reference: "${reference}" }));
              }
            } catch (e) {}
          }
          function returnToApp() {
            notifyAndRedirect();
            setTimeout(function() {
              window.location.href = "${frontendUrl}/?payment_status=success&ref=${encodeURIComponent(reference)}";
            }, 300);
          }
          notifyAndRedirect();
          setTimeout(function() {
            window.location.href = "${frontendUrl}/?payment_status=success&ref=${encodeURIComponent(reference)}";
          }, 3500);
        </script>
      </body>
    </html>
  `;
}

// ─── POST /checkout ────────────────────────────────────────────────────────────
// Create a checkout session/intent or sandbox mock for the chosen payment provider
router.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  const { checkoutType, id, provider, isSplit, currency: reqCurrency, localAmount: reqLocalAmount } = req.body;

  if (!checkoutType || !id || !provider) {
    return res.status(400).json({ error: 'checkoutType, id, and provider are required' });
  }

  try {
    let totalAmount = 0;
    let userEmail = '';
    let userName = '';
    let isSplitPaymentChosen = !!isSplit;

    if (checkoutType === 'order') {
      const order = await prisma.order.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { isSplitPayment: order.isSplitPayment || isSplitPaymentChosen },
        include: { user: true },
      });

      userEmail = updatedOrder.user.email;
      userName = updatedOrder.user.name;

      if (updatedOrder.amountPaid > 0) {
        totalAmount = updatedOrder.totalAmount - updatedOrder.amountPaid;
      } else {
        totalAmount = updatedOrder.isSplitPayment ? updatedOrder.totalAmount / 2 : updatedOrder.totalAmount;
      }
    } else if (checkoutType === 'booking') {
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      const updatedBooking = await prisma.booking.update({
        where: { id },
        data: { isSplitPayment: booking.isSplitPayment || isSplitPaymentChosen },
        include: { customer: true },
      });

      userEmail = updatedBooking.customer.email;
      userName = updatedBooking.customer.name;

      if (updatedBooking.amountPaid > 0) {
        totalAmount = updatedBooking.totalPrice - updatedBooking.amountPaid;
      } else {
        totalAmount = updatedBooking.isSplitPayment ? updatedBooking.totalPrice / 2 : updatedBooking.totalPrice;
      }
    } else if (checkoutType === 'parcel') {
      const parcel = await prisma.parcelDelivery.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!parcel) return res.status(404).json({ error: 'Parcel delivery not found' });

      userEmail = parcel.user.email;
      userName = parcel.user.name;
      totalAmount = parcel.totalAmount;
    } else {
      return res.status(400).json({ error: 'Invalid checkoutType' });
    }

    const metadata = {
      checkoutType,
      id,
    };

    const chargeCurrency = (reqCurrency as string) || 'NGN';
    const chargeAmount = reqLocalAmount !== undefined && reqLocalAmount > 0
      ? Number(reqLocalAmount)
      : totalAmount;

    // Load API Keys dynamically from DB settings
    const settingsList = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            'stripe_secret_key', 'paystack_secret_key', 'flutterwave_secret_key',
            'opay_merchant_id', 'opay_public_key', 'opay_secret_key',
            'stripe_enabled', 'paystack_enabled', 'flutterwave_enabled', 'opay_enabled'
          ]
        }
      }
    });
    const settings = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    const activeStripeKey = settings['stripe_secret_key'] || process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
    const activePaystackKey = settings['paystack_secret_key'] || process.env.PAYSTACK_SECRET_KEY || 'sk_test_dummy';
    const activeFlutterwaveKey = settings['flutterwave_secret_key'] || process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-dummy';
    const activeOpayMerchantId = settings['opay_merchant_id'] || process.env.OPAY_MERCHANT_ID || 'dummy_opay_merchant_id';
    const activeOpayPublicKey = settings['opay_public_key'] || process.env.OPAY_PUBLIC_KEY || 'pk_test_dummy_opay_public_key';
    const activeOpaySecretKey = settings['opay_secret_key'] || process.env.OPAY_SECRET_KEY || 'sk_test_dummy_opay_secret_key';

    const baseUrl = getBaseUrl(req);

    // ─── 1. STRIPE GATEWAY ───────────────────────────────────────────────────
    if (provider === 'STRIPE') {
      if (settings['stripe_enabled'] === 'false') {
        return res.status(400).json({ error: 'Stripe payments are currently disabled by system administrator.' });
      }

      const reference = `STRIPE_${id}_${Date.now()}`;
      const isDummy = !activeStripeKey || activeStripeKey.includes('dummy') || activeStripeKey === 'sk_test_dummy';

      if (isDummy) {
        console.log(`[StripeService] Running in sandbox mock mode for ${checkoutType}: ${id}`);
        return res.json({
          provider: 'STRIPE',
          clientSecret: 'mock_stripe_client_secret',
          authorizationUrl: `${baseUrl}/api/payments/stripe/mock-pay?reference=${reference}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          reference,
        });
      }

      try {
        const activeStripe = new Stripe(activeStripeKey, {
          apiVersion: '2023-10-16' as any,
        });

        const paymentIntent = await activeStripe.paymentIntents.create({
          amount: Math.round(chargeAmount * 100),
          currency: chargeCurrency.toLowerCase(),
          metadata,
        });

        return res.json({
          provider: 'STRIPE',
          clientSecret: paymentIntent.client_secret,
          authorizationUrl: `${baseUrl}/api/payments/stripe/mock-pay?reference=${paymentIntent.id}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          reference: paymentIntent.id,
        });
      } catch (err: any) {
        console.warn(`[StripeService] API error. Falling back to sandbox mock: ${err.message}`);
        return res.json({
          provider: 'STRIPE',
          clientSecret: 'mock_stripe_client_secret',
          authorizationUrl: `${baseUrl}/api/payments/stripe/mock-pay?reference=${reference}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          reference,
        });
      }
    }

    // ─── 2. PAYSTACK GATEWAY ─────────────────────────────────────────────────
    if (provider === 'PAYSTACK') {
      if (settings['paystack_enabled'] === 'false') {
        return res.status(400).json({ error: 'Paystack payments are currently disabled by system administrator.' });
      }

      const reference = `PAY_${id}_${Date.now()}`;
      const isDummy = !activePaystackKey || activePaystackKey.includes('dummy') || activePaystackKey === 'sk_test_dummy';

      if (isDummy) {
        console.log(`[PaystackService] Running in sandbox mock mode for ${checkoutType}: ${id}`);
        return res.json({
          provider: 'PAYSTACK',
          authorizationUrl: `${baseUrl}/api/payments/paystack/mock-pay?reference=${reference}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          reference,
        });
      }

      try {
        const callbackUrl = `${baseUrl}/api/payments/paystack/callback`;
        const response = await axios.post(
          `${PAYSTACK_BASE_URL}/transaction/initialize`,
          {
            email: userEmail,
            amount: Math.round(chargeAmount * 100), // Paystack uses kobo
            currency: chargeCurrency,
            reference,
            callback_url: callbackUrl,
            metadata,
          },
          {
            timeout: 10_000,
            headers: {
              Authorization: `Bearer ${activePaystackKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.data && response.data.status && response.data.data?.authorization_url) {
          return res.json({
            provider: 'PAYSTACK',
            authorizationUrl: response.data.data.authorization_url,
            reference: response.data.data.reference || reference,
          });
        }
        throw new Error(response.data?.message || 'Paystack initialization failed.');
      } catch (err: any) {
        console.warn(`[PaystackService] API error. Falling back to sandbox mock: ${err.message}`);
        return res.json({
          provider: 'PAYSTACK',
          authorizationUrl: `${baseUrl}/api/payments/paystack/mock-pay?reference=${reference}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          reference,
        });
      }
    }

    // ─── 3. FLUTTERWAVE GATEWAY ──────────────────────────────────────────────
    if (provider === 'FLUTTERWAVE') {
      if (settings['flutterwave_enabled'] === 'false') {
        return res.status(400).json({ error: 'Flutterwave payments are currently disabled by system administrator.' });
      }

      const txRef = `FLW_${id}_${Date.now()}`;
      const isDummy = !activeFlutterwaveKey || activeFlutterwaveKey.includes('dummy') || activeFlutterwaveKey.startsWith('FLWSECK_TEST-dummy');

      if (isDummy) {
        console.log(`[FlutterwaveService] Running in sandbox mock mode for ${checkoutType}: ${id}`);
        return res.json({
          provider: 'FLUTTERWAVE',
          paymentLink: `${baseUrl}/api/payments/flutterwave/mock-pay?reference=${txRef}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          txRef,
        });
      }

      try {
        const redirectUrl = `${baseUrl}/api/payments/flutterwave/callback`;
        const response = await axios.post(
          `${FLUTTERWAVE_BASE_URL}/payments`,
          {
            tx_ref: txRef,
            amount: chargeAmount,
            currency: chargeCurrency,
            redirect_url: redirectUrl,
            customer: {
              email: userEmail,
              name: userName,
            },
            meta: metadata,
          },
          {
            timeout: 10_000,
            headers: {
              Authorization: `Bearer ${activeFlutterwaveKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.data && response.data.status === 'success' && response.data.data?.link) {
          return res.json({
            provider: 'FLUTTERWAVE',
            paymentLink: response.data.data.link,
            txRef,
          });
        }
        throw new Error(response.data?.message || 'Flutterwave initialization failed.');
      } catch (err: any) {
        console.warn(`[FlutterwaveService] API error. Falling back to sandbox mock: ${err.message}`);
        return res.json({
          provider: 'FLUTTERWAVE',
          paymentLink: `${baseUrl}/api/payments/flutterwave/mock-pay?reference=${txRef}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          txRef,
        });
      }
    }

    // ─── 4. OPAY GATEWAY ─────────────────────────────────────────────────────
    if (provider === 'OPAY') {
      if (settings['opay_enabled'] === 'false') {
        return res.status(400).json({ error: 'OPay payments are currently disabled by system administrator.' });
      }

      const reference = `OPAY_${id}_${Date.now()}`;
      const isDummy = !activeOpaySecretKey || activeOpaySecretKey.includes('dummy') || activeOpayMerchantId.includes('dummy') || activeOpayPublicKey.includes('dummy');

      if (isDummy) {
        console.log(`[OPayService] Running in sandbox mock mode for ${checkoutType}: ${id}`);
        return res.json({
          provider: 'OPAY',
          authorizationUrl: `${baseUrl}/api/payments/opay/mock-pay?reference=${reference}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          reference,
        });
      }

      try {
        const response = await axios.post(
          'https://sandbox-api.opaycheckout.com/api/v1/international/cashier/create',
          {
            merchantId: activeOpayMerchantId,
            orderId: reference,
            amount: {
              total: Math.round(chargeAmount * 100).toString(),
              currency: chargeCurrency,
            },
            product: {
              name: checkoutType === 'order' ? 'Product Order Payment' : 'Service Booking Payment',
              description: `Payment for ID: ${id}`,
            },
            returnUrl: `${baseUrl}/api/payments/opay/verify-callback?reference=${reference}`,
            callbackUrl: `${baseUrl}/api/payments/opay/webhook`,
            userClientIp: '127.0.0.1',
            expireAt: 30,
          },
          {
            timeout: 10_000,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${activeOpayPublicKey}`,
              MerchantId: activeOpayMerchantId,
            },
          }
        );

        if (response.data && (response.data.code === '00000' || response.data.data?.checkoutUrl)) {
          return res.json({
            provider: 'OPAY',
            authorizationUrl: response.data.data.checkoutUrl,
            reference,
          });
        }
        throw new Error(response.data?.message || 'OPay Cashier response error');
      } catch (err: any) {
        console.warn(`[OPayService] API error. Falling back to sandbox mock: ${err.message}`);
        return res.json({
          provider: 'OPAY',
          authorizationUrl: `${baseUrl}/api/payments/opay/mock-pay?reference=${reference}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
          reference,
        });
      }
    }

    return res.status(400).json({ error: 'Invalid payment provider specified.' });
  } catch (error: any) {
    next(error);
  }
});

// ─── Direct Virtual Wallet Payment ───────────────────────────────────────────
router.post('/wallet-pay', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const { checkoutType, id, isSplit } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!checkoutType || !id) return res.status(400).json({ error: 'checkoutType and id are required' });

  try {
    const wallet = await getOrCreateWallet(userId);
    let amountToPay = 0;

    if (checkoutType === 'order') {
      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      amountToPay = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : (isSplit ? order.totalAmount / 2 : order.totalAmount);
    } else if (checkoutType === 'booking') {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      amountToPay = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : (isSplit ? booking.totalPrice / 2 : booking.totalPrice);
    } else if (checkoutType === 'parcel') {
      const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
      if (!parcel) return res.status(404).json({ error: 'Parcel delivery not found' });
      amountToPay = parcel.totalAmount;
    }

    if (wallet.balance < amountToPay) {
      return res.status(400).json({
        error: `Insufficient wallet balance. Available: ₦${wallet.balance.toLocaleString()}, Required: ₦${amountToPay.toLocaleString()}. Please fund your wallet or choose another payment method.`
      });
    }

    // Deduct from wallet
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amountToPay } },
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount: amountToPay,
        type: 'DEBIT',
        description: `Payment for ${checkoutType} #${id.slice(0, 8)}`,
      }
    });

    const reference = `WALLET_${id}_${Date.now()}`;
    const result = await processPaymentVerification({
      provider: 'PAYSTACK' as any,
      reference,
      checkoutType,
      id,
      chargedAmount: amountToPay,
    });

    res.json({
      success: true,
      message: `Payment of ₦${amountToPay.toLocaleString()} completed using your wallet balance!`,
      reference,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// ─── VERIFICATION & CALLBACK ROUTES ──────────────────────────────────────────

// Verify Paystack Payment via API
router.get('/paystack/verify/:reference', async (req: Request, res: Response, next: NextFunction) => {
  const { reference } = req.params;

  try {
    const paystackSetting = await prisma.appSetting.findUnique({ where: { key: 'paystack_secret_key' } });
    const activePaystackKey = paystackSetting?.value || process.env.PAYSTACK_SECRET_KEY || 'sk_test_dummy';

    // If sandbox mock reference
    if (reference.startsWith('PAY_') || activePaystackKey.includes('dummy')) {
      const parts = reference.split('_');
      const id = parts[1];
      if (!id) return res.status(400).json({ error: 'Invalid reference signature.' });

      // Determine checkout type from DB
      const order = await prisma.order.findUnique({ where: { id } });
      if (order) {
        const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
        const result = await processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'order', id, chargedAmount });
        return res.json({ status: 'success', message: 'Order payment verified via Paystack sandbox.', ...result });
      }

      const booking = await prisma.booking.findUnique({ where: { id } });
      if (booking) {
        const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
        const result = await processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'booking', id, chargedAmount });
        return res.json({ status: 'success', message: 'Booking payment verified via Paystack sandbox.', ...result });
      }

      const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
      if (parcel) {
        const result = await processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
        return res.json({ status: 'success', message: 'Parcel payment verified via Paystack sandbox.', ...result });
      }

      return res.status(404).json({ error: 'Target record not found for reference.' });
    }

    // Live Paystack API verification
    const response = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${activePaystackKey}`,
      },
    });

    const data = response.data?.data;
    if (data && data.status === 'success') {
      const { checkoutType, id } = data.metadata || {};
      const chargedAmount = data.amount / 100;
      const result = await processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType, id, chargedAmount });
      return res.json({ status: 'success', message: 'Paystack payment verified.', ...result });
    }

    return res.status(400).json({ error: `Payment not successful. Status: ${data?.status || 'failed'}` });
  } catch (error: any) {
    next(error);
  }
});

// Paystack Redirect Callback
router.get('/paystack/callback', async (req: Request, res: Response, next: NextFunction) => {
  const reference = (req.query.reference || req.query.trxref) as string;
  const frontendUrl = getFrontendUrl(req);

  if (!reference) {
    return res.redirect(`${frontendUrl}/?payment_status=cancelled`);
  }

  try {
    const parts = reference.split('_');
    const id = parts[1];
    if (id) {
      const order = await prisma.order.findUnique({ where: { id } });
      if (order) {
        const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
        await processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'order', id, chargedAmount });
      } else {
        const booking = await prisma.booking.findUnique({ where: { id } });
        if (booking) {
          const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
          await processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'booking', id, chargedAmount });
        } else {
          const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
          if (parcel) {
            await processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
          }
        }
      }
    }

    res.send(renderSuccessHtml('Paystack', reference, frontendUrl));
  } catch (error) {
    res.send(renderSuccessHtml('Paystack', reference, frontendUrl));
  }
});

// Verify Flutterwave Payment via API
router.get('/flutterwave/verify/:transactionId', async (req: Request, res: Response, next: NextFunction) => {
  const { transactionId } = req.params;

  try {
    const flutterwaveSetting = await prisma.appSetting.findUnique({ where: { key: 'flutterwave_secret_key' } });
    const activeFlutterwaveKey = flutterwaveSetting?.value || process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-dummy';

    if (transactionId.startsWith('FLW_') || activeFlutterwaveKey.includes('dummy')) {
      const parts = transactionId.split('_');
      const id = parts[1];
      if (!id) return res.status(400).json({ error: 'Invalid reference signature.' });

      const order = await prisma.order.findUnique({ where: { id } });
      if (order) {
        const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
        const result = await processPaymentVerification({ provider: 'FLUTTERWAVE', reference: transactionId, checkoutType: 'order', id, chargedAmount });
        return res.json({ status: 'success', message: 'Order payment verified via Flutterwave sandbox.', ...result });
      }

      const booking = await prisma.booking.findUnique({ where: { id } });
      if (booking) {
        const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
        const result = await processPaymentVerification({ provider: 'FLUTTERWAVE', reference: transactionId, checkoutType: 'booking', id, chargedAmount });
        return res.json({ status: 'success', message: 'Booking payment verified via Flutterwave sandbox.', ...result });
      }

      const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
      if (parcel) {
        const result = await processPaymentVerification({ provider: 'FLUTTERWAVE', reference: transactionId, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
        return res.json({ status: 'success', message: 'Parcel payment verified via Flutterwave sandbox.', ...result });
      }

      return res.status(404).json({ error: 'Target record not found for transaction ID.' });
    }

    // Live Flutterwave API verification
    const response = await axios.get(`${FLUTTERWAVE_BASE_URL}/transactions/${encodeURIComponent(transactionId)}/verify`, {
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${activeFlutterwaveKey}`,
      },
    });

    const data = response.data?.data;
    if (data && (data.status === 'successful' || data.status === 'success')) {
      const { checkoutType, id } = data.meta || {};
      const chargedAmount = data.amount;
      const result = await processPaymentVerification({ provider: 'FLUTTERWAVE', reference: String(transactionId), checkoutType, id, chargedAmount });
      return res.json({ status: 'success', message: 'Flutterwave payment verified.', ...result });
    }

    return res.status(400).json({ error: `Payment not successful. Status: ${data?.status || 'failed'}` });
  } catch (error: any) {
    next(error);
  }
});

// Flutterwave Redirect Callback
router.get('/flutterwave/callback', async (req: Request, res: Response, next: NextFunction) => {
  const txRef = (req.query.tx_ref || req.query.transaction_id || req.query.reference) as string;
  const status = req.query.status as string;
  const frontendUrl = getFrontendUrl(req);

  if (status === 'cancelled' || !txRef) {
    return res.redirect(`${frontendUrl}/?payment_status=cancelled`);
  }

  try {
    const parts = txRef.split('_');
    const id = parts[1];
    if (id) {
      const order = await prisma.order.findUnique({ where: { id } });
      if (order) {
        const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
        await processPaymentVerification({ provider: 'FLUTTERWAVE', reference: txRef, checkoutType: 'order', id, chargedAmount });
      } else {
        const booking = await prisma.booking.findUnique({ where: { id } });
        if (booking) {
          const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
          await processPaymentVerification({ provider: 'FLUTTERWAVE', reference: txRef, checkoutType: 'booking', id, chargedAmount });
        } else {
          const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
          if (parcel) {
            await processPaymentVerification({ provider: 'FLUTTERWAVE', reference: txRef, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
          }
        }
      }
    }

    res.send(renderSuccessHtml('Flutterwave', txRef, frontendUrl));
  } catch (error) {
    res.send(renderSuccessHtml('Flutterwave', txRef, frontendUrl));
  }
});

// ─── SANDBOX MOCK CASHIERS ─────────────────────────────────────────────────────

// Stripe Sandbox Mock Payment Page
router.get('/stripe/mock-pay', (req: Request, res: Response) => {
  const { reference, amount, currency, type, id } = req.query;
  const amt = amount ? parseFloat(amount as string) : 0;
  const curr = (currency as string) || 'NGN';
  const currSymbol = curr === 'USD' ? '$' : '₦';

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Stripe Checkout Simulation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #F8FAFC;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .card {
            background: white;
            border-radius: 20px;
            padding: 36px 28px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.06);
            max-width: 420px;
            width: 100%;
            text-align: center;
            border: 1px solid #E2E8F0;
            box-sizing: border-box;
          }
          .logo {
            color: #635BFF;
            font-size: 32px;
            font-weight: 900;
            margin-bottom: 12px;
          }
          .merchant-badge {
            background: #EEF2FF;
            color: #4F46E5;
            font-size: 11px;
            font-weight: 700;
            padding: 5px 14px;
            border-radius: 20px;
            display: inline-block;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 20px;
          }
          .amount {
            font-size: 36px;
            font-weight: 900;
            margin: 12px 0;
            color: #0F172A;
          }
          .divider {
            height: 1px;
            background: #F1F5F9;
            margin: 20px 0;
          }
          .btn {
            background: #635BFF;
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 800;
            width: 100%;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(99, 91, 255, 0.3);
            transition: all 0.2s;
          }
          .btn:hover {
            background: #4F46E5;
          }
          .ref {
            color: #64748B;
            font-size: 12px;
            font-family: monospace;
            background: #F1F5F9;
            padding: 6px 12px;
            border-radius: 8px;
            display: inline-block;
          }
          .secured-text {
            color: #94A3B8;
            font-size: 11px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">stripe</div>
          <div class="merchant-badge">Secured Sandboxed Gateway</div>
          <div style="font-size: 14px; color: #64748B;">FixMart Checkout Authorization</div>
          <div class="amount">${currSymbol}${amt.toFixed(2)}</div>
          <div class="ref">REF: ${reference}</div>
          <div class="divider"></div>
          <button class="btn" onclick="location.href='/api/payments/stripe/verify/${reference}'">
            Authorize & Complete Payment
          </button>
          <div class="secured-text">🔒 256-bit SSL Encrypted Sandbox Checkout</div>
        </div>
      </body>
    </html>
  `);
});

// Verify Stripe Reference
router.get('/stripe/verify/:reference', async (req: Request, res: Response, next: NextFunction) => {
  const { reference } = req.params;
  const frontendUrl = getFrontendUrl(req);

  try {
    const parts = reference.split('_');
    const id = parts[1];

    if (!id) {
      return res.send(renderSuccessHtml('Stripe', reference, frontendUrl));
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (order) {
      const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
      await processPaymentVerification({ provider: 'STRIPE', reference, checkoutType: 'order', id, chargedAmount });
    } else {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (booking) {
        const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
        await processPaymentVerification({ provider: 'STRIPE', reference, checkoutType: 'booking', id, chargedAmount });
      } else {
        const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
        if (parcel) {
          await processPaymentVerification({ provider: 'STRIPE', reference, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
        }
      }
    }

    res.send(renderSuccessHtml('Stripe', reference, frontendUrl));
  } catch (error) {
    res.send(renderSuccessHtml('Stripe', reference, frontendUrl));
  }
});

// Paystack Sandbox Mock Page
router.get('/paystack/mock-pay', (req: Request, res: Response) => {
  const { reference, amount, currency } = req.query;
  const amt = amount ? parseFloat(amount as string) : 0;
  const curr = (currency as string) || 'NGN';
  const currSymbol = curr === 'USD' ? '$' : '₦';

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Paystack Checkout Simulation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #F8FAFC;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .card {
            background: white;
            border-radius: 20px;
            padding: 36px 28px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.06);
            max-width: 420px;
            width: 100%;
            text-align: center;
            border: 1px solid #E2E8F0;
            box-sizing: border-box;
          }
          .logo {
            color: #0BA4DB;
            font-size: 32px;
            font-weight: 900;
            margin-bottom: 12px;
          }
          .merchant-badge {
            background: #E0F2FE;
            color: #0284C7;
            font-size: 11px;
            font-weight: 700;
            padding: 5px 14px;
            border-radius: 20px;
            display: inline-block;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 20px;
          }
          .amount {
            font-size: 36px;
            font-weight: 900;
            margin: 12px 0;
            color: #0F172A;
          }
          .divider {
            height: 1px;
            background: #F1F5F9;
            margin: 20px 0;
          }
          .btn {
            background: #0BA4DB;
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 800;
            width: 100%;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(11, 164, 219, 0.3);
            transition: all 0.2s;
          }
          .btn:hover {
            background: #0284C7;
          }
          .ref {
            color: #64748B;
            font-size: 12px;
            font-family: monospace;
            background: #F1F5F9;
            padding: 6px 12px;
            border-radius: 8px;
            display: inline-block;
          }
          .secured-text {
            color: #94A3B8;
            font-size: 11px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">paystack</div>
          <div class="merchant-badge">Secured Sandboxed Gateway</div>
          <div style="font-size: 14px; color: #64748B;">FixMart Checkout Authorization</div>
          <div class="amount">${currSymbol}${amt.toFixed(2)}</div>
          <div class="ref">REF: ${reference}</div>
          <div class="divider"></div>
          <button class="btn" onclick="location.href='/api/payments/paystack/callback?reference=${reference}'">
            Authorize & Complete Payment
          </button>
          <div class="secured-text">🔒 256-bit SSL Encrypted Sandbox Checkout</div>
        </div>
      </body>
    </html>
  `);
});

// Flutterwave Sandbox Mock Page
router.get('/flutterwave/mock-pay', (req: Request, res: Response) => {
  const { reference, amount, currency } = req.query;
  const amt = amount ? parseFloat(amount as string) : 0;
  const curr = (currency as string) || 'NGN';
  const currSymbol = curr === 'USD' ? '$' : '₦';

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Flutterwave Checkout Simulation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #F8FAFC;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .card {
            background: white;
            border-radius: 20px;
            padding: 36px 28px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.06);
            max-width: 420px;
            width: 100%;
            text-align: center;
            border: 1px solid #E2E8F0;
            box-sizing: border-box;
          }
          .logo {
            color: #F5A623;
            font-size: 32px;
            font-weight: 900;
            margin-bottom: 12px;
          }
          .merchant-badge {
            background: #FEF3C7;
            color: #D97706;
            font-size: 11px;
            font-weight: 700;
            padding: 5px 14px;
            border-radius: 20px;
            display: inline-block;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 20px;
          }
          .amount {
            font-size: 36px;
            font-weight: 900;
            margin: 12px 0;
            color: #0F172A;
          }
          .divider {
            height: 1px;
            background: #F1F5F9;
            margin: 20px 0;
          }
          .btn {
            background: #F5A623;
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 800;
            width: 100%;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(245, 166, 35, 0.3);
            transition: all 0.2s;
          }
          .btn:hover {
            background: #D97706;
          }
          .ref {
            color: #64748B;
            font-size: 12px;
            font-family: monospace;
            background: #F1F5F9;
            padding: 6px 12px;
            border-radius: 8px;
            display: inline-block;
          }
          .secured-text {
            color: #94A3B8;
            font-size: 11px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">flutterwave</div>
          <div class="merchant-badge">Secured Sandboxed Gateway</div>
          <div style="font-size: 14px; color: #64748B;">FixMart Checkout Authorization</div>
          <div class="amount">${currSymbol}${amt.toFixed(2)}</div>
          <div class="ref">REF: ${reference}</div>
          <div class="divider"></div>
          <button class="btn" onclick="location.href='/api/payments/flutterwave/callback?tx_ref=${reference}&status=successful'">
            Authorize & Complete Payment
          </button>
          <div class="secured-text">🔒 256-bit SSL Encrypted Sandbox Checkout</div>
        </div>
      </body>
    </html>
  `);
});

// Mock OPay Payment page for sandbox visual testing
router.get('/opay/mock-pay', (req: Request, res: Response) => {
  const { reference, amount, currency } = req.query;
  const amt = amount ? parseFloat(amount as string) : 0;
  const curr = (currency as string) || 'NGN';
  const currSymbol = curr === 'USD' ? '$' : '₦';

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>OPay Secure Cashier</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f4f6f8;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .card {
            background: white;
            border-radius: 20px;
            padding: 32px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.06);
            max-width: 420px;
            width: 100%;
            text-align: center;
            border: 1px solid #e1e4e8;
            box-sizing: border-box;
          }
          .logo {
            color: #03a9f4;
            font-size: 38px;
            font-weight: 900;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo span {
            background: #03a9f4;
            color: white;
            padding: 2px 12px;
            border-radius: 10px;
            margin-right: 8px;
            font-weight: 800;
          }
          .merchant-badge {
            background: #e1f5fe;
            color: #0288d1;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 20px;
            display: inline-block;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 24px;
          }
          .amount {
            font-size: 40px;
            font-weight: 800;
            margin: 16px 0;
            color: #212121;
          }
          .divider {
            height: 1px;
            background: #eceff1;
            margin: 24px 0;
          }
          .btn {
            background: #03a9f4;
            color: white;
            border: none;
            padding: 16px 28px;
            border-radius: 14px;
            font-size: 16px;
            font-weight: 700;
            width: 100%;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(3, 169, 244, 0.2);
            transition: all 0.2s;
          }
          .btn:hover {
            background: #0288d1;
            box-shadow: 0 6px 16px rgba(3, 169, 244, 0.3);
          }
          .ref {
            color: #78909c;
            font-size: 12px;
            font-family: monospace;
            background: #f1f8e9;
            padding: 6px 12px;
            border-radius: 6px;
            display: inline-block;
          }
          .secured-text {
            color: #90a4ae;
            font-size: 11px;
            margin-top: 24px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo"><span>O</span>Pay</div>
          <div class="merchant-badge">Secured Sandboxed Gateway</div>
          <div>FixMart Checkout</div>
          <div class="amount">${currSymbol}${amt.toFixed(2)}</div>
          <div class="ref">REF: ${reference}</div>
          <div class="divider"></div>
          <button class="btn" onclick="location.href='/api/payments/opay/verify/${reference}'">
            Authorize & Complete Payment
          </button>
          <div class="secured-text">🛡️ 256-bit SSL encrypted transaction verification</div>
        </div>
      </body>
    </html>
  `);
});

// Verify OPay payment reference
router.get('/opay/verify/:reference', async (req: Request, res: Response, next: NextFunction) => {
  const { reference } = req.params;
  const frontendUrl = getFrontendUrl(req);

  try {
    const parts = reference.split('_');
    const id = parts[1];

    if (!id) {
      return res.status(400).send('Invalid reference signature.');
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (order) {
      const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
      await processPaymentVerification({ provider: 'OPAY', reference, checkoutType: 'order', id, chargedAmount });
      return res.send(renderSuccessHtml('OPay', reference, frontendUrl, 'Order Payment Successful!', 'Thank you for your purchase. OPay transaction reference has been verified.'));
    }

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (booking) {
      const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
      await processPaymentVerification({ provider: 'OPAY', reference, checkoutType: 'booking', id, chargedAmount });
      return res.send(renderSuccessHtml('OPay', reference, frontendUrl, 'Booking Paid Successfully!', 'Your handyman appointment is now confirmed. The technician will head to your location.'));
    }

    const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
    if (parcel) {
      await processPaymentVerification({ provider: 'OPAY', reference, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
      return res.send(renderSuccessHtml('OPay', reference, frontendUrl, 'Parcel Delivery Paid Successfully!', 'Your parcel dispatch is now confirmed and a rider is being assigned.'));
    }

    return res.status(404).send('Reference ID was not found or could not match any active record.');
  } catch (error) {
    next(error);
  }
});

// Staging OPay callback redirect handler (fallback for real API)
router.get('/opay/verify-callback', async (req: Request, res: Response, next: NextFunction) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).send('Missing reference.');
  res.redirect(`/api/payments/opay/verify/${reference}`);
});

// Staging OPay Webhook receiver (official OPay API webhooks)
router.post('/opay/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    console.log('[OPayWebhook] Received notification:', JSON.stringify(payload));
    const ref = payload.reference || payload.orderNo || payload.data?.reference || payload.data?.orderNo;
    if (ref) {
      const parts = ref.split('_');
      const id = parts[1];
      if (id) {
        const order = await prisma.order.findUnique({ where: { id } });
        if (order && order.status !== 'PAID') {
          const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
          await processPaymentVerification({ provider: 'OPAY', reference: ref, checkoutType: 'order', id, chargedAmount });
        }

        const booking = await prisma.booking.findUnique({ where: { id } });
        if (booking && booking.status !== 'ACCEPTED') {
          const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
          await processPaymentVerification({ provider: 'OPAY', reference: ref, checkoutType: 'booking', id, chargedAmount });
        }

        const parcel = await prisma.parcelDelivery.findUnique({ where: { id } });
        if (parcel && parcel.status !== 'PAID') {
          await processPaymentVerification({ provider: 'OPAY', reference: ref, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
        }
      }
    }
    res.json({ code: '00000', message: 'SUCCESS' });
  } catch (err) {
    console.error('[OPayWebhookError]', err);
    res.json({ code: '00000', message: 'SUCCESS' });
  }
});

// Stripe Webhook handler
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  const sig = req.headers['stripe-signature'];

  try {
    const settingsList = await prisma.appSetting.findMany({
      where: {
        key: {
          in: ['stripe_secret_key', 'stripe_webhook_secret']
        }
      }
    });
    const settings = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    const activeStripeKey = settings['stripe_secret_key'] || process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
    const endpointSecret = settings['stripe_webhook_secret'] || process.env.STRIPE_WEBHOOK_SECRET || '';

    const activeStripe = new Stripe(activeStripeKey, {
      apiVersion: '2023-10-16' as any,
    });

    let event;
    if (endpointSecret) {
      event = activeStripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { checkoutType, id } = paymentIntent.metadata || {};
      const chargedAmount = paymentIntent.amount / 100;

      if (checkoutType && id) {
        await processPaymentVerification({
          provider: 'STRIPE',
          reference: paymentIntent.id,
          checkoutType,
          id,
          chargedAmount,
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// Internal escrow-release endpoint
router.post('/webhook/split', async (req: Request, res: Response, next: NextFunction) => {
  const { escrowId, secretToken } = req.body;
  const WEBHOOK_SPLIT_SECRET = process.env.WEBHOOK_SPLIT_SECRET;

  if (!escrowId) {
    return res.status(400).json({ error: 'escrowId is required.' });
  }

  if (WEBHOOK_SPLIT_SECRET && secretToken !== WEBHOOK_SPLIT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized split request.' });
  }

  try {
    const updatedEscrow = await releaseEscrow(escrowId);
    return res.json({ success: true, message: 'Escrow released successfully.', escrow: updatedEscrow });
  } catch (err: any) {
    console.error(`[EscrowReleaseEndpointError] ${err.message}`);
    next(err);
  }
});

// Admin: Fetch all escrows and payment stats
router.get('/admin/all-escrows', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden. Admin access required.' });

  try {
    const escrows = await prisma.escrow.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          include: {
            service: true,
            customer: { select: { id: true, name: true, email: true, phone: true } },
            handyman: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        order: {
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    });

    const totalEscrowAmount = escrows.reduce((sum, e) => sum + e.amount, 0);
    const heldAmount = escrows.filter(e => e.status === 'HELD').reduce((sum, e) => sum + e.amount, 0);
    const releasedAmount = escrows.filter(e => e.status === 'RELEASED').reduce((sum, e) => sum + e.amount, 0);

    res.json({
      escrows,
      summary: {
        totalCount: escrows.length,
        totalEscrowAmount,
        heldAmount,
        releasedAmount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Force-release specific escrow to handyman/vendor
router.post('/admin/force-release-escrow/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden. Admin access required.' });

  const { id } = req.params;
  try {
    const escrow = await prisma.escrow.findUnique({ where: { id } });
    if (!escrow) return res.status(404).json({ error: 'Escrow record not found.' });

    if (escrow.status === 'RELEASED') {
      return res.status(400).json({ error: 'Escrow funds have already been released.' });
    }

    const released = await releaseEscrow(id);
    res.json({ success: true, message: 'Escrow funds forcibly released by Administrator.', escrow: released });
  } catch (error) {
    next(error);
  }
});

export default router;

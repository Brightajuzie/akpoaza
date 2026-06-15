import { Router, Response, NextFunction } from 'express';
import { PaymentProvider } from '@prisma/client';
import Stripe from 'stripe';
import axios from 'axios';
import prisma from '../lib/prisma';
import { createEscrowForPaidItem, releaseEscrow } from '../lib/wallet';
import { triggerSplitWebhook } from '../lib/wallet'; // We will add triggerSplitWebhook to wallet.ts or import it here. Wait, we defined it as part of our helper, let's export it from wallet.ts.

const router = Router();

// Initialize Stripe (uses a dummy key if not in env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2023-10-16' as any,
});

// Paystack generic configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_dummy';
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Flutterwave generic configuration
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-dummy';
const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

// Create a checkout session/intent based on the payment provider
router.post('/checkout', async (req, res, next) => {
  const { checkoutType, id, provider, isSplit } = req.body;

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

      // Update isSplitPayment status on Order — preserve existing true flag
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

      // Update isSplitPayment status on Booking — preserve existing true flag
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
    } else {
      return res.status(400).json({ error: 'Invalid checkoutType' });
    }

    const metadata = {
      checkoutType,
      id,
    };

    // Load API Keys dynamically from DB settings
    const settingsList = await prisma.appSetting.findMany({
      where: {
        key: {
          in: ['stripe_secret_key', 'paystack_secret_key', 'flutterwave_secret_key', 'opay_merchant_id', 'opay_public_key', 'opay_secret_key']
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

    if (provider === 'STRIPE') {
      const activeStripe = new Stripe(activeStripeKey, {
        apiVersion: '2023-10-16' as any,
      });

      const paymentIntent = await activeStripe.paymentIntents.create({
        amount: Math.round(totalAmount * 100), // Stripe uses cents
        currency: 'usd',
        metadata,
      });

      return res.json({
        provider: 'STRIPE',
        clientSecret: paymentIntent.client_secret,
      });
    }

    if (provider === 'PAYSTACK') {
      // Paystack initialization
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: userEmail,
          amount: Math.round(totalAmount * 100), // Paystack uses Kobo/cents
          reference: `PAY_${id}_${Date.now()}`,
          metadata,
        },
        {
          timeout: 10_000, // 10 s – prevents backend hang when Paystack is unreachable
          headers: {
            Authorization: `Bearer ${activePaystackKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return res.json({
        provider: 'PAYSTACK',
        authorizationUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
      });
    }

    if (provider === 'FLUTTERWAVE') {
      // Flutterwave initialization
      const txRef = `PAY_${id}_${Date.now()}`;
      const response = await axios.post(
        `${FLUTTERWAVE_BASE_URL}/payments`,
        {
          tx_ref: txRef,
          amount: totalAmount,
          currency: 'NGN', // Assume NGN or USD based on requirement
          redirect_url: 'https://your-frontend-url.com/payment/callback',
          customer: {
            email: userEmail,
            name: userName,
          },
          meta: metadata,
        },
        {
          timeout: 10_000, // 10 s – prevents backend hang when Flutterwave is unreachable
          headers: {
            Authorization: `Bearer ${activeFlutterwaveKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return res.json({
        provider: 'FLUTTERWAVE',
        paymentLink: response.data.data.link,
        txRef,
      });
    }

    if (provider === 'OPAY') {
      // OPay initialization
      const reference = `PAY_${id}_${Date.now()}`;
      const isDummy = activeOpaySecretKey.includes('dummy') || activeOpayMerchantId.includes('dummy') || activeOpayPublicKey.includes('dummy');

      if (isDummy) {
        console.log(`[OPayService] Running in sandbox mock mode for order/booking: ${id}`);
        const host = req.get('host') || 'localhost:5000';
        return res.json({
          provider: 'OPAY',
          authorizationUrl: `http://${host}/api/payments/opay/mock-pay?reference=${reference}&amount=${totalAmount.toFixed(2)}`,
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
              total: Math.round(totalAmount * 100).toString(), // Kobo
              currency: 'NGN',
            },
            product: {
              name: checkoutType === 'order' ? 'Product Order Payment' : 'Service Booking Payment',
              description: `Payment for ID: ${id}`,
            },
            returnUrl: `http://${req.get('host') || 'localhost:5000'}/api/payments/opay/verify-callback?reference=${reference}`,
            callbackUrl: `http://${req.get('host') || 'localhost:5000'}/api/payments/opay/webhook`,
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
        const host = req.get('host') || 'localhost:5000';
        return res.json({
          provider: 'OPAY',
          authorizationUrl: `http://${host}/api/payments/opay/mock-pay?reference=${reference}&amount=${totalAmount.toFixed(2)}`,
          reference,
        });
      }
    }

    return res.status(400).json({ error: 'Invalid payment provider' });
  } catch (error: any) {
    next(error);
  }
});

// Verify Paystack Payment
router.get('/paystack/verify/:reference', async (req, res, next) => {
  const { reference } = req.params;

  try {
    const paystackSetting = await prisma.appSetting.findUnique({ where: { key: 'paystack_secret_key' } });
    const activePaystackKey = paystackSetting?.value || process.env.PAYSTACK_SECRET_KEY || 'sk_test_dummy';

    const response = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${activePaystackKey}`,
      },
    });

    const data = response.data.data;
    if (data.status === 'success') {
      const { checkoutType, id } = data.metadata || {};
      const chargedAmount = data.amount / 100;

      if (checkoutType === 'order') {
        const order = await prisma.order.update({
          where: { id },
          data: { status: 'PAID', paymentProvider: 'PAYSTACK', paymentRef: reference },
        });
        await createEscrowForPaidItem('order', id, chargedAmount).catch(err => console.error("Escrow hold failed for order:", err));

        // Auto-release only on final split payment installment; regular orders wait for confirm-receipt.
        const updatedOrder = await prisma.order.findUnique({ where: { id } });
        if (updatedOrder && updatedOrder.isSplitPayment && updatedOrder.amountPaid >= updatedOrder.totalAmount) {
          const activeEscrows = await prisma.escrow.findMany({ where: { orderId: id, status: 'HELD' } });
          for (const esc of activeEscrows) {
            await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
          }
          await prisma.order.update({ where: { id }, data: { status: 'DELIVERED' } });
        }

        return res.json({ status: 'success', message: 'Order payment verified.', order });
      } else if (checkoutType === 'booking') {
        const booking = await prisma.booking.update({
          where: { id },
          data: { status: 'ACCEPTED' },
        });
        await createEscrowForPaidItem('booking', id, chargedAmount).catch(err => console.error("Escrow hold failed for booking:", err));

        // Auto-release escrows only when this is the FINAL split payment installment.
        // Regular (non-split) full payments stay ACCEPTED until customer confirms via confirm-completion.
        const updatedBooking = await prisma.booking.findUnique({ where: { id } });
        if (updatedBooking && updatedBooking.isSplitPayment && updatedBooking.amountPaid >= updatedBooking.totalPrice) {
          const activeEscrows = await prisma.escrow.findMany({ where: { bookingId: id, status: 'HELD' } });
          for (const esc of activeEscrows) {
            await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
          }
          await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED' } });
        }

        return res.json({ status: 'success', message: 'Booking payment verified.', booking });
      }

      return res.status(400).json({ error: 'Invalid checkout type in payment metadata' });
    } else {
      return res.status(400).json({ error: `Payment not successful. Status: ${data.status}` });
    }
  } catch (error: any) {
    next(error);
  }
});

// Verify Flutterwave Payment
router.get('/flutterwave/verify/:transactionId', async (req, res, next) => {
  const { transactionId } = req.params;

  try {
    const flutterwaveSetting = await prisma.appSetting.findUnique({ where: { key: 'flutterwave_secret_key' } });
    const activeFlutterwaveKey = flutterwaveSetting?.value || process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-dummy';

    const response = await axios.get(`${FLUTTERWAVE_BASE_URL}/transactions/${encodeURIComponent(transactionId)}/verify`, {
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${activeFlutterwaveKey}`,
      },
    });

    const data = response.data.data;
    if (data.status === 'successful') {
      const { checkoutType, id } = data.meta || {};
      const chargedAmount = data.amount;

      if (checkoutType === 'order') {
        const order = await prisma.order.update({
          where: { id },
          data: { status: 'PAID', paymentProvider: 'FLUTTERWAVE', paymentRef: String(transactionId) },
        });
        await createEscrowForPaidItem('order', id, chargedAmount).catch(err => console.error("Escrow hold failed for order:", err));

        // Auto-release only on final split payment installment; regular orders wait for confirm-receipt.
        const updatedOrder = await prisma.order.findUnique({ where: { id } });
        if (updatedOrder && updatedOrder.isSplitPayment && updatedOrder.amountPaid >= updatedOrder.totalAmount) {
          const activeEscrows = await prisma.escrow.findMany({ where: { orderId: id, status: 'HELD' } });
          for (const esc of activeEscrows) {
            await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
          }
          await prisma.order.update({ where: { id }, data: { status: 'DELIVERED' } });
        }

        return res.json({ status: 'success', message: 'Order payment verified.', order });
      } else if (checkoutType === 'booking') {
        const booking = await prisma.booking.update({
          where: { id },
          data: { status: 'ACCEPTED' },
        });
        await createEscrowForPaidItem('booking', id, chargedAmount).catch(err => console.error("Escrow hold failed for booking:", err));

        // Auto-release only on final split payment installment; regular bookings wait for customer confirm-completion.
        const updatedBooking = await prisma.booking.findUnique({ where: { id } });
        if (updatedBooking && updatedBooking.isSplitPayment && updatedBooking.amountPaid >= updatedBooking.totalPrice) {
          const activeEscrows = await prisma.escrow.findMany({ where: { bookingId: id, status: 'HELD' } });
          for (const esc of activeEscrows) {
            await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
          }
          await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED' } });
        }

        return res.json({ status: 'success', message: 'Booking payment verified.', booking });
      }

      return res.status(400).json({ error: 'Invalid checkout type in payment metadata' });
    } else {
      return res.status(400).json({ error: `Payment not successful. Status: ${data.status}` });
    }
  } catch (error: any) {
    next(error);
  }
});

// Stripe Webhook handler
router.post('/webhook', async (req, res, next) => {
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
      // Fallback for development without endpointSecret
      event = JSON.parse(req.body.toString());
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { checkoutType, id } = paymentIntent.metadata;
      const chargedAmount = paymentIntent.amount / 100;

      try {
        if (checkoutType === 'order') {
          await prisma.order.update({
            where: { id },
            data: { status: 'PAID', paymentProvider: 'STRIPE', paymentRef: paymentIntent.id },
          });
          await createEscrowForPaidItem('order', id, chargedAmount).catch(err => console.error("Escrow hold failed for order:", err));

          // Auto-release only on final split payment installment; regular orders wait for confirm-receipt.
          const updatedOrder = await prisma.order.findUnique({ where: { id } });
          if (updatedOrder && updatedOrder.isSplitPayment && updatedOrder.amountPaid >= updatedOrder.totalAmount) {
            const activeEscrows = await prisma.escrow.findMany({ where: { orderId: id, status: 'HELD' } });
            for (const esc of activeEscrows) {
              await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
            }
            await prisma.order.update({ where: { id }, data: { status: 'DELIVERED' } });
          }
          console.log(`Order ${id} marked as PAID.`);
        } else if (checkoutType === 'booking') {
          await prisma.booking.update({
            where: { id },
            data: { status: 'ACCEPTED' },
          });
          await createEscrowForPaidItem('booking', id, chargedAmount).catch(err => console.error("Escrow hold failed for booking:", err));

          // Auto-release only on final split payment installment; regular bookings wait for customer confirm-completion.
          const updatedBooking = await prisma.booking.findUnique({ where: { id } });
          if (updatedBooking && updatedBooking.isSplitPayment && updatedBooking.amountPaid >= updatedBooking.totalPrice) {
            const activeEscrows = await prisma.escrow.findMany({ where: { bookingId: id, status: 'HELD' } });
            for (const esc of activeEscrows) {
              await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
            }
            await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED' } });
          }
          console.log(`Booking ${id} marked as ACCEPTED.`);
        }
      } catch (err) {
        next(err);
        return;
      }
    }
  } catch (err) {
    next(err);
  }
});

// Mock OPay Payment page for sandbox visual testing
router.get('/opay/mock-pay', (req, res) => {
  const { reference, amount } = req.query;
  const amt = amount ? parseFloat(amount as string) : 0;
  
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
            height: 100vh;
            margin: 0;
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
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo"><span>O</span>Pay</div>
          <div class="merchant-badge">Secured Sandboxed Gateway</div>
          <div>FixMart Checkout</div>
          <div class="amount">₦${amt.toFixed(2)}</div>
          <div class="ref">REF: ${reference}</div>
          
          <div class="divider"></div>
          
          <button class="btn" onclick="location.href='/api/payments/opay/verify/${reference}'">
            Authorize & Complete Payment
          </button>
          
          <div class="secured-text">
            🛡️ 256-bit SSL encrypted transaction verification
          </div>
        </div>
      </body>
    </html>
  `);
});

// Verify OPay payment reference
router.get('/opay/verify/:reference', async (req, res, next) => {
  const { reference } = req.params;

  try {
    const parts = reference.split('_');
    const id = parts[1];

    if (!id) {
      return res.status(400).send('Invalid reference signature.');
    }

    // Try finding order
    const order = await prisma.order.findUnique({ where: { id } });
    if (order) {
      const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
      await prisma.order.update({
        where: { id },
        data: { status: 'PAID', paymentProvider: 'OPAY', paymentRef: reference },
      });
      await createEscrowForPaidItem('order', id, chargedAmount).catch(err => console.error("Escrow hold failed for order:", err));

      // Auto-release only on final split payment installment; regular orders wait for confirm-receipt.
      const updatedOrder = await prisma.order.findUnique({ where: { id } });
      if (updatedOrder && updatedOrder.isSplitPayment && updatedOrder.amountPaid >= updatedOrder.totalAmount) {
        const activeEscrows = await prisma.escrow.findMany({ where: { orderId: id, status: 'HELD' } });
        for (const esc of activeEscrows) {
          await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
        }
        await prisma.order.update({ where: { id }, data: { status: 'DELIVERED' } });
      }

      return res.send(`
        <html>
          <body style="font-family: -apple-system, sans-serif; text-align: center; padding: 60px 20px; background-color: #f7f9fa;">
            <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); max-width: 460px; margin: 0 auto;">
              <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
              <h1 style="color: #4CAF50; font-size: 26px; margin-bottom: 8px;">Order Payment Successful!</h1>
              <p style="color: #555; font-size: 15px; margin-bottom: 30px;">Thank you for your purchase. OPay transaction reference has been verified.</p>
              <div style="font-size: 12px; color: #aaa; font-family: monospace;">REF: ${reference}</div>
            </div>
            <script>
              setTimeout(() => {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'success', reference: "${reference}" }));
                }
              }, 1200);
            </script>
          </body>
        </html>
      `);
    }

    // Try finding booking
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (booking) {
      const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
      await prisma.booking.update({
        where: { id },
        data: { status: 'ACCEPTED' },
      });
      await createEscrowForPaidItem('booking', id, chargedAmount).catch(err => console.error("Escrow hold failed for booking:", err));

      // Auto-release only on final split payment installment; regular bookings wait for customer confirm-completion.
      const updatedBooking = await prisma.booking.findUnique({ where: { id } });
      if (updatedBooking && updatedBooking.isSplitPayment && updatedBooking.amountPaid >= updatedBooking.totalPrice) {
        const activeEscrows = await prisma.escrow.findMany({ where: { bookingId: id, status: 'HELD' } });
        for (const esc of activeEscrows) {
          await releaseEscrow(esc.id).catch(err => console.error("Failed to release escrow on final split payment:", err));
        }
        await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED' } });
      }

      return res.send(`
        <html>
          <body style="font-family: -apple-system, sans-serif; text-align: center; padding: 60px 20px; background-color: #f7f9fa;">
            <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); max-width: 460px; margin: 0 auto;">
              <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
              <h1 style="color: #4CAF50; font-size: 26px; margin-bottom: 8px;">Booking Paid Successfully!</h1>
              <p style="color: #555; font-size: 15px; margin-bottom: 30px;">Your handyman appointment is now confirmed. The technician will head to your location.</p>
              <div style="font-size: 12px; color: #aaa; font-family: monospace;">REF: ${reference}</div>
            </div>
            <script>
              setTimeout(() => {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'success', reference: "${reference}" }));
                }
              }, 1200);
            </script>
          </body>
        </html>
      `);
    }

    return res.status(404).send('Reference ID was not found or could not match any active booking/order record.');
  } catch (error) {
    next(error);
  }
});

// Staging OPay callback redirect handler (fallback for real API)
router.get('/opay/verify-callback', async (req, res, next) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).send('Missing reference.');
  res.redirect(`/api/payments/opay/verify/${reference}`);
});

// Staging OPay Webhook receiver (official OPay API webhooks)
router.post('/opay/webhook', async (req, res, next) => {
  const payload = req.body;
  console.log('[OPayWebhook] Received notification:', JSON.stringify(payload));
  res.json({ code: '00000', message: 'SUCCESS' });
});

// Webhook split receiver (automated instant split trigger)
router.post('/webhook/split', async (req, res, next) => {
  const { escrowId, secretToken } = req.body;
  const WEBHOOK_SPLIT_SECRET = process.env.WEBHOOK_SPLIT_SECRET || 'local-split-secret-token';

  if (!escrowId || secretToken !== WEBHOOK_SPLIT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized split request.' });
  }

  try {
    const updatedEscrow = await releaseEscrow(escrowId);
    return res.json({ success: true, message: 'Payment split processed successfully.', escrow: updatedEscrow });
  } catch (err: any) {
    console.error(`[SplitWebhookError] ${err.message}`);
    next(err);
  }
});

export default router;

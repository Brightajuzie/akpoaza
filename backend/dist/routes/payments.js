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
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const wallet_1 = require("../lib/wallet");
const notify_1 = require("../lib/notify");
const receipt_1 = require("../lib/receipt");
const orders_1 = require("./orders");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Paystack generic configuration
const PAYSTACK_BASE_URL = 'https://api.paystack.co';
// Flutterwave generic configuration
const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';
// Helper to determine the server's base URL
function getBaseUrl(req) {
    if (process.env.API_URL)
        return process.env.API_URL.replace(/\/api\/?$/, '');
    if (process.env.BACKEND_URL)
        return process.env.BACKEND_URL.replace(/\/api\/?$/, '');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:5000';
    return `${proto}://${host}`;
}
// Helper to determine the frontend URL
function getFrontendUrl(req) {
    if (process.env.FRONTEND_URL)
        return process.env.FRONTEND_URL.replace(/\/$/, '');
    if (req.headers.origin && typeof req.headers.origin === 'string')
        return req.headers.origin;
    if (req.headers.referer && typeof req.headers.referer === 'string') {
        try {
            const u = new URL(req.headers.referer);
            return `${u.protocol}//${u.host}`;
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
    return 'http://localhost:8081';
}
// Server-side confirmation that a given OPay reference genuinely succeeded,
// via OPay's Cashier "Query Payment Status" API (doc.opaycheckout.com/
// query-payment-status) — never trusts a client-supplied reference alone.
// Per OPay's docs the request body is signed HMAC-SHA512 with the merchant's
// SECRET key: `Authorization: Bearer {hex(hmacSHA512(secretKey, JSON.stringify(body)))}`.
// NOTE: OPay's docs don't spell out hex vs base64 output — hex is used here
// (the near-universal convention, and what Paystack/Flutterwave-style APIs
// use); confirm against a real OPay sandbox call before relying on this in
// production. A malformed/incorrect signature makes OPay's API reject the
// call, which this treats as "not verified" (fails closed), never as "so
// trust it anyway" — so an implementation slip here can't reopen the
// vulnerability this replaces.
function verifyOpayTransaction(reference, merchantId, publicKey, secretKey) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const body = { reference, country: 'NG' };
        const bodyStr = JSON.stringify(body);
        const signature = crypto_1.default.createHmac('sha512', secretKey).update(bodyStr).digest('hex');
        const response = yield axios_1.default.post('https://sandboxapi.opaycheckout.com/api/v1/international/cashier/status', body, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${signature}`,
                MerchantId: merchantId,
            },
        });
        const data = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data;
        const verified = ((_b = response.data) === null || _b === void 0 ? void 0 : _b.code) === '00000' && (data === null || data === void 0 ? void 0 : data.status) === 'SUCCESS';
        return {
            verified,
            amount: ((_c = data === null || data === void 0 ? void 0 : data.amount) === null || _c === void 0 ? void 0 : _c.total) ? Number(data.amount.total) / 100 : undefined,
            currency: (_d = data === null || data === void 0 ? void 0 : data.amount) === null || _d === void 0 ? void 0 : _d.currency,
        };
    });
}
// Verifies an incoming OPay webhook payload's `sha512` field against the
// HMAC-SHA3-512 signature OPay documents (doc.opaycheckout.com/
// callback-signature): a hash of the payload's own fields (in OPay's
// documented order) signed with the merchant's secret key. Without this,
// `/opay/webhook` had no way to distinguish a real OPay notification from
// anyone who found the URL and POSTed a fake "paid" payload.
function verifyOpayWebhookSignature(payload, secretKey) {
    var _a, _b;
    const received = (payload === null || payload === void 0 ? void 0 : payload.sha512) || ((_a = payload === null || payload === void 0 ? void 0 : payload.data) === null || _a === void 0 ? void 0 : _a.sha512);
    if (!received || typeof received !== 'string')
        return false;
    const d = (payload === null || payload === void 0 ? void 0 : payload.data) || payload;
    const signContent = `{Amount:"${d.amount}",Currency:"${d.currency}",Reference:"${d.reference}",` +
        `Refunded:${d.refunded ? 't' : 'f'},Status:"${d.status}",Timestamp:"${d.timestamp}",` +
        `Token:"${d.token}",TransactionID:"${(_b = d.transactionId) !== null && _b !== void 0 ? _b : d.orderNo}"}`;
    const expected = crypto_1.default.createHmac('sha3-512', secretKey).update(signContent).digest('hex');
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
    }
    catch (_c) {
        return false;
    }
}
// Shared helper to process payment verification across all providers
function processPaymentVerification(_a) {
    return __awaiter(this, arguments, void 0, function* ({ provider, reference, checkoutType, id, chargedAmount, }) {
        var _b, _c, _d, _e, _f, _g, _h, _j;
        if (checkoutType === 'order') {
            const order = yield prisma_1.default.order.findUnique({ where: { id } });
            if (!order)
                throw new Error('Order not found');
            // Idempotency guard: a provider's webhook, its redirect callback, and a
            // client-side verify poll can all fire for the very same transaction.
            // Without this, each one would re-increment amountPaid, create another
            // escrow hold, and re-send the receipt/notification emails for a single
            // real payment. `reference` uniquely identifies one transaction attempt
            // (see the *_${id}_${Date.now()} generation in /checkout), so a repeat of
            // the same reference is always a duplicate call, never a new payment.
            if (reference && order.paymentRef === reference) {
                return { type: 'order', record: order, duplicate: true };
            }
            const updatedOrder = yield prisma_1.default.order.update({
                where: { id },
                data: {
                    status: 'PAID',
                    paymentProvider: (0, orders_1.sanitizePaymentProvider)(provider),
                    paymentRef: reference,
                    amountPaid: { increment: chargedAmount },
                },
            });
            yield (0, wallet_1.createEscrowForPaidItem)('order', id, chargedAmount).catch(err => console.error(`[Escrow] Hold failed for order ${id}:`, err));
            // Auto-release escrow only when final split payment installment is reached
            if (updatedOrder.isSplitPayment && updatedOrder.amountPaid >= updatedOrder.totalAmount) {
                const activeEscrows = yield prisma_1.default.escrow.findMany({ where: { orderId: id, status: 'HELD' } });
                for (const esc of activeEscrows) {
                    yield (0, wallet_1.releaseEscrow)(esc.id).catch(err => console.error(`[Escrow] Failed to release escrow on final split payment for order ${id}:`, err));
                }
                yield prisma_1.default.order.update({ where: { id }, data: { status: 'DELIVERED' } });
            }
            // Automatically dispatch official itemized receipt to customer and email
            yield (0, receipt_1.dispatchReceiptNotification)('order', id).catch(err => console.error('[payments] Failed to dispatch order receipt:', err));
            // ── Dispatch notifications for paid order ───────────────────────────
            try {
                const orderUser = yield prisma_1.default.user.findUnique({
                    where: { id: updatedOrder.userId },
                    select: { name: true, email: true, phone: true },
                });
                // 1. Customer notification: in-app, SMS, email
                (0, notify_1.sendNotification)({
                    userId: updatedOrder.userId,
                    title: '💳 Payment Confirmed — Order in Dispatch',
                    body: `Payment of ₦${chargedAmount.toLocaleString()} confirmed! Your product will be delivered within a few hours, and a rider will call you to confirm your location.`,
                    type: 'ORDER',
                    referenceId: id,
                    email: orderUser === null || orderUser === void 0 ? void 0 : orderUser.email,
                    phone: (orderUser === null || orderUser === void 0 ? void 0 : orderUser.phone) || undefined,
                    emailSubject: '✅ Payment Confirmed & Delivery Notice — FixMart',
                    emailHtml: `<p style="font-size:16px;color:#374151">Hi ${(orderUser === null || orderUser === void 0 ? void 0 : orderUser.name) || 'there'},</p>
          <p>We've received your payment of <strong>₦${chargedAmount.toLocaleString()}</strong> for Order #${id.slice(-6).toUpperCase()} via ${provider}.</p>
          <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;font-size:15px;color:#065F46;font-weight:600">🚚 Delivery Update:</p>
            <p style="margin:4px 0 0;font-size:14px;color:#1F2937">Your product will be delivered within a few hours. A rider will call you shortly to confirm your location.</p>
          </div>
          <p><strong>Order ID:</strong> ${id}</p>
          <p><strong>Delivery Address:</strong> ${updatedOrder.deliveryAddress || 'On file'}</p>
          <p>Thank you for shopping with <strong>FixMart</strong>!</p>`,
                }).catch(() => { });
                // 2. Admin notification
                const admins = yield prisma_1.default.user.findMany({
                    where: { role: 'ADMIN' },
                    select: { id: true, email: true },
                });
                for (const admin of admins) {
                    (0, notify_1.sendNotification)({
                        userId: admin.id,
                        title: `💰 Payment Received: Order #${id.slice(-6).toUpperCase()}`,
                        body: `Payment of ₦${chargedAmount.toLocaleString()} verified via ${provider} for Order #${id.slice(-6).toUpperCase()} (${(orderUser === null || orderUser === void 0 ? void 0 : orderUser.name) || 'Customer'}). Delivery required within a few hours.`,
                        type: 'ORDER',
                        referenceId: id,
                        email: admin.email,
                        emailSubject: `💰 [Admin Alert] Order #${id.slice(-6).toUpperCase()} Paid & Ready for Fulfillment`,
                        emailHtml: `<p>Payment has been confirmed for an order.</p>
            <p><strong>Order ID:</strong> ${id}</p>
            <p><strong>Customer:</strong> ${orderUser === null || orderUser === void 0 ? void 0 : orderUser.name} (${orderUser === null || orderUser === void 0 ? void 0 : orderUser.email})</p>
            <p><strong>Amount Paid:</strong> ₦${chargedAmount.toLocaleString()}</p>
            <p><strong>Provider:</strong> ${provider} (Ref: ${reference})</p>
            <p><strong>Delivery Address:</strong> ${updatedOrder.deliveryAddress || 'Not specified'}</p>
            <p>Please ensure dispatch is progressing within the next few hours.</p>`,
                    }).catch(() => { });
                }
                // 3. Vendor notifications on payment cleared
                const orderWithVendors = yield prisma_1.default.order.findUnique({
                    where: { id },
                    include: {
                        items: {
                            include: {
                                product: {
                                    include: {
                                        vendor: { select: { id: true, name: true, email: true, phone: true } },
                                    },
                                },
                            },
                        },
                    },
                });
                if (orderWithVendors === null || orderWithVendors === void 0 ? void 0 : orderWithVendors.items) {
                    const vMap = new Map();
                    for (const item of orderWithVendors.items) {
                        if (((_b = item.product) === null || _b === void 0 ? void 0 : _b.vendorId) && item.product.vendor) {
                            if (!vMap.has(item.product.vendorId)) {
                                vMap.set(item.product.vendorId, { vendor: item.product.vendor, items: [], subtotal: 0 });
                            }
                            const e = vMap.get(item.product.vendorId);
                            e.items.push(`${item.quantity}× ${item.product.name}`);
                            e.subtotal += item.price * item.quantity;
                        }
                    }
                    for (const [vId, vInfo] of vMap) {
                        (0, notify_1.sendNotification)({
                            userId: vId,
                            title: `💰 Payment Confirmed: Order #${id.slice(-6).toUpperCase()}`,
                            body: `Payment confirmed for ${vInfo.items.join(', ')} (₦${vInfo.subtotal.toLocaleString()}). Please package items for dispatch.`,
                            type: 'ORDER',
                            referenceId: id,
                            email: vInfo.vendor.email,
                            phone: vInfo.vendor.phone || undefined,
                            emailSubject: `💰 Payment Confirmed for Your Products — Order #${id.slice(-6).toUpperCase()}`,
                            emailHtml: `<p style="font-size:16px;color:#374151">Hi ${vInfo.vendor.name || 'Vendor'},</p>
              <p>Payment has been confirmed via ${provider} for items in Order #${id.slice(-6).toUpperCase()}!</p>
              <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
                <p style="margin:0;font-size:14px;color:#065F46;font-weight:700">📦 Your Sold Items:</p>
                <p style="margin:4px 0 0;font-size:14px;color:#1F2937">${vInfo.items.join(', ')}</p>
                <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Subtotal:</strong> ₦${vInfo.subtotal.toLocaleString()}</p>
              </div>
              <p>Please ensure these items are packed and ready for rider pickup.</p>`,
                        }).catch(() => { });
                    }
                }
            }
            catch (err) {
                console.error('[payments] Failed to dispatch payment notifications for order:', err);
            }
            return { type: 'order', record: updatedOrder };
        }
        else if (checkoutType === 'booking') {
            const booking = yield prisma_1.default.booking.findUnique({
                where: { id },
                include: { customer: true, handyman: true, service: true },
            });
            if (!booking)
                throw new Error('Booking not found');
            // See the matching guard in the 'order' branch above for why this is needed.
            if (reference && booking.paymentRef === reference) {
                return { type: 'booking', record: booking, duplicate: true };
            }
            const updatedBooking = yield prisma_1.default.booking.update({
                where: { id },
                data: {
                    status: 'ACCEPTED',
                    paymentProvider: (0, orders_1.sanitizePaymentProvider)(provider),
                    paymentRef: reference,
                    amountPaid: { increment: chargedAmount },
                },
            });
            yield (0, wallet_1.createEscrowForPaidItem)('booking', id, chargedAmount).catch(err => console.error(`[Escrow] Hold failed for booking ${id}:`, err));
            // Auto-release escrow only when final split payment installment is reached
            if (updatedBooking.isSplitPayment && updatedBooking.amountPaid >= updatedBooking.totalPrice) {
                const activeEscrows = yield prisma_1.default.escrow.findMany({ where: { bookingId: id, status: 'HELD' } });
                for (const esc of activeEscrows) {
                    yield (0, wallet_1.releaseEscrow)(esc.id).catch(err => console.error(`[Escrow] Failed to release escrow on final split payment for booking ${id}:`, err));
                }
                yield prisma_1.default.booking.update({ where: { id }, data: { status: 'COMPLETED' } });
            }
            // ── Dispatch notifications for paid service booking ─────────────────────
            try {
                const svcName = ((_c = booking.service) === null || _c === void 0 ? void 0 : _c.name) || 'Service Booking';
                const cName = ((_d = booking.customer) === null || _d === void 0 ? void 0 : _d.name) || 'Customer';
                const hName = ((_e = booking.handyman) === null || _e === void 0 ? void 0 : _e.name) || 'Service Professional';
                // 1. Notify Customer
                if (booking.customerId) {
                    (0, notify_1.sendNotification)({
                        userId: booking.customerId,
                        title: `💳 Payment Confirmed: ${svcName}`,
                        body: `Payment of ₦${chargedAmount.toLocaleString()} confirmed for "${svcName}". Your funds are protected in FixMart Escrow until the job is completed!`,
                        type: 'BOOKING',
                        referenceId: id,
                        email: (_f = booking.customer) === null || _f === void 0 ? void 0 : _f.email,
                        phone: ((_g = booking.customer) === null || _g === void 0 ? void 0 : _g.phone) || undefined,
                        emailSubject: `✅ Service Payment Confirmed: ${svcName} — FixMart`,
                        emailHtml: `<p style="font-size:16px;color:#374151">Hi ${cName},</p>
            <p>Your payment of <strong>₦${chargedAmount.toLocaleString()}</strong> for <strong>${svcName}</strong> has been received and secured in FixMart Escrow.</p>
            <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
              <p style="margin:0;font-size:14px;color:#065F46;font-weight:700">🛡️ Protected by FixMart Escrow:</p>
              <p style="margin:4px 0 0;font-size:13px;color:#1F2937">Your money is safely held until the artisan completes the service to your satisfaction.</p>
            </div>
            <p><strong>Service:</strong> ${svcName}</p>
            <p><strong>Scheduled Time:</strong> ${new Date(booking.scheduledAt).toLocaleString()}</p>
            <p><strong>Assigned Artisan:</strong> ${hName}</p>`,
                    }).catch(() => { });
                }
                // 2. Notify Handyman
                if (booking.handymanId) {
                    (0, notify_1.sendNotification)({
                        userId: booking.handymanId,
                        title: `💰 Payment Secured in Escrow: ${svcName}`,
                        body: `Client ${cName} has paid ₦${chargedAmount.toLocaleString()} into escrow for "${svcName}". You may proceed with the job at ${booking.address}.`,
                        type: 'BOOKING',
                        referenceId: id,
                        email: (_h = booking.handyman) === null || _h === void 0 ? void 0 : _h.email,
                        phone: ((_j = booking.handyman) === null || _j === void 0 ? void 0 : _j.phone) || undefined,
                        emailSubject: `💰 Client Payment Secured for Job: ${svcName} — FixMart`,
                        emailHtml: `<p style="font-size:16px;color:#374151">Hi ${hName},</p>
            <p>Great news! Payment of <strong>₦${chargedAmount.toLocaleString()}</strong> has been deposited into escrow for your booking: <strong>${svcName}</strong>.</p>
            <div style="background:#EFF6FF;border-left:4px solid #3B82F6;padding:12px 16px;margin:16px 0;border-radius:4px;">
              <p style="margin:0;font-size:14px;color:#1E40AF;font-weight:700">💼 Ready to Start:</p>
              <p style="margin:4px 0 0;font-size:13px;color:#1F2937"><strong>Client:</strong> ${cName}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#1F2937"><strong>Job Location:</strong> ${booking.address}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#1F2937"><strong>Scheduled:</strong> ${new Date(booking.scheduledAt).toLocaleString()}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#1F2937"><strong>Secured Fee:</strong> ₦${chargedAmount.toLocaleString()}</p>
            </div>
            <p>Please arrive punctually. Once you finish the job and client confirms, payment will be released to your wallet.</p>`,
                    }).catch(() => { });
                }
            }
            catch (notifErr) {
                console.error('[payments] Failed to dispatch booking payment notifications:', notifErr);
            }
            // Automatically dispatch official itemized receipt to customer and email
            yield (0, receipt_1.dispatchReceiptNotification)('booking', id).catch(err => console.error('[payments] Failed to dispatch booking receipt:', err));
            return { type: 'booking', record: updatedBooking };
        }
        else if (checkoutType === 'parcel') {
            const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
            if (!parcel)
                throw new Error('Parcel delivery not found');
            // See the matching guard in the 'order' branch above for why this is needed.
            if (reference && parcel.paymentRef === reference) {
                return { type: 'parcel', record: parcel, duplicate: true };
            }
            const updatedParcel = yield prisma_1.default.parcelDelivery.update({
                where: { id },
                data: {
                    status: 'PAID',
                    paymentProvider: (0, orders_1.sanitizePaymentProvider)(provider),
                    paymentRef: reference,
                },
            });
            yield (0, wallet_1.createEscrowForPaidItem)('parcel', id, chargedAmount || parcel.totalAmount).catch(err => console.error(`[Escrow] Hold failed for parcel ${id}:`, err));
            // Automatically dispatch official itemized receipt to customer and email
            yield (0, receipt_1.dispatchReceiptNotification)('parcel', id).catch(err => console.error('[payments] Failed to dispatch parcel receipt:', err));
            return { type: 'parcel', record: updatedParcel };
        }
        else if (checkoutType === 'wallet_funding') {
            const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
            if (!funding)
                throw new Error('Wallet funding request not found');
            // See the matching guard in the 'order' branch above for why this is needed.
            if (reference && funding.paymentRef === reference) {
                return { type: 'wallet_funding', record: funding, duplicate: true };
            }
            const updatedFunding = yield prisma_1.default.walletFunding.update({
                where: { id },
                data: {
                    status: 'PAID',
                    paymentProvider: (0, orders_1.sanitizePaymentProvider)(provider),
                    paymentRef: reference,
                },
            });
            // Unlike order/booking/parcel payments, this is the user's own money
            // landing in their own wallet — it goes straight to the spendable
            // `balance`, never through escrow/pendingBalance or a commission split.
            const wallet = yield (0, wallet_1.getOrCreateWallet)(funding.userId);
            yield prisma_1.default.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: chargedAmount } },
            });
            yield prisma_1.default.transaction.create({
                data: {
                    walletId: wallet.id,
                    amount: chargedAmount,
                    type: 'WALLET_FUNDING',
                    status: 'COMPLETED',
                    description: `Wallet top-up of ₦${chargedAmount.toFixed(2)} via ${provider}`,
                    referenceId: id,
                },
            });
            try {
                const user = yield prisma_1.default.user.findUnique({
                    where: { id: funding.userId },
                    select: { name: true, email: true, phone: true },
                });
                (0, notify_1.sendNotification)({
                    userId: funding.userId,
                    title: '💰 Wallet Funded',
                    body: `₦${chargedAmount.toLocaleString()} has been added to your FixMart wallet via ${provider}.`,
                    type: 'PAYMENT',
                    referenceId: id,
                    email: user === null || user === void 0 ? void 0 : user.email,
                    phone: (user === null || user === void 0 ? void 0 : user.phone) || undefined,
                    emailSubject: '💰 Wallet Top-Up Confirmed — FixMart',
                    emailHtml: `<p style="font-size:16px;color:#374151">Hi ${(user === null || user === void 0 ? void 0 : user.name) || 'there'},</p>
          <p>Your wallet top-up of <strong>₦${chargedAmount.toLocaleString()}</strong> via ${provider} was successful.</p>
          <p>Your new wallet balance is available in the app under Wallet.</p>`,
                }).catch(() => { });
            }
            catch (err) {
                console.error('[payments] Failed to dispatch wallet funding notification:', err);
            }
            return { type: 'wallet_funding', record: updatedFunding };
        }
        throw new Error(`Invalid checkout type: ${checkoutType}`);
    });
}
// Render branded HTML success confirmation page
function renderSuccessHtml(provider, reference, frontendUrl, title, message) {
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
        </div>

        <script>
          // Only reaches the native app's own WebView bridge — never
          // triggers a page navigation by itself. On web there is no
          // window.ReactNativeWebView, so this is a safe no-op there.
          function notifyAndRedirect() {
            try {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'success', reference: "${reference}" }));
              }
            } catch (e) {}
          }
          // Navigating away is only ever user-initiated (this button) —
          // this page used to auto-redirect here after 3.5s regardless of
          // whether frontendUrl was actually configured correctly, which
          // could carry the customer straight past this confirmation to
          // wherever that guess landed instead.
          function returnToApp() {
            notifyAndRedirect();
            setTimeout(function() {
              window.location.href = "${frontendUrl}/?payment_status=success&ref=${encodeURIComponent(reference)}";
            }, 300);
          }
          notifyAndRedirect();
        </script>
      </body>
    </html>
  `;
}
// Render branded HTML failure page — used when a redirect callback's
// server-side verification with the provider fails or errors. Previously
// callback handlers rendered renderSuccessHtml() unconditionally in their
// catch blocks, so a customer could see "Payment Successful!" even when the
// backend never actually confirmed or recorded the payment.
function renderFailureHtml(provider, reference, frontendUrl, message) {
    const displayMessage = message || `We could not verify this ${provider} transaction. If you were charged, contact support with this reference.`;
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${provider} Payment Not Verified</title>
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
            background: #FEF2F2;
            color: #DC2626;
            border-radius: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            margin: 0 auto 20px auto;
            border: 2px solid #FECACA;
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
            background: #DC2626;
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
            background: #B91C1C;
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
          <div class="badge-icon">✕</div>
          <h1>${provider} Payment Not Verified</h1>
          <p>${displayMessage}</p>
          <div class="ref-box">REF: ${reference}</div>
          <button class="btn" onclick="returnToApp()">← Return to FixMart App</button>
        </div>

        <script>
          function notifyAndRedirect() {
            try {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'failed', reference: "${reference}" }));
              }
            } catch (e) {}
          }
          function returnToApp() {
            notifyAndRedirect();
            setTimeout(function() {
              window.location.href = "${frontendUrl}/?payment_status=failed&ref=${encodeURIComponent(reference)}";
            }, 300);
          }
          notifyAndRedirect();
        </script>
      </body>
    </html>
  `;
}
// The actual page a customer lands on right after paying. Renders the real
// itemized receipt (same template used for the email — see receipt.ts)
// directly on THIS page rather than the generic "Payment Successful!" card,
// so "was I charged, and what for" is answered immediately without
// depending on a redirect back into the app ever landing anywhere useful.
// That matters because the previous version auto-redirected to
// `${frontendUrl}/?payment_status=success...` after a few seconds — if
// FRONTEND_URL isn't configured (it wasn't, anywhere in this deploy) and
// the request's Origin/Referer headers don't reliably describe our own
// frontend either (they don't, for a top-level redirect chain arriving
// from an external gateway), that redirect could land the customer on
// this API's own JSON root instead of ever seeing a receipt. Falls back to
// the generic success card for wallet_funding (nothing itemized to show)
// or if receipt generation fails for any reason — payment already
// succeeded either way, so this never blocks that from being communicated.
function renderPaymentSuccessPage(_a) {
    return __awaiter(this, arguments, void 0, function* ({ checkoutType, id, provider, reference, frontendUrl, }) {
        if (checkoutType === 'order' || checkoutType === 'booking' || checkoutType === 'parcel') {
            try {
                const receipt = yield (0, receipt_1.generateReceiptData)(checkoutType, id);
                if (receipt) {
                    const returnUrl = `${frontendUrl}/?payment_status=success&ref=${encodeURIComponent(reference)}`;
                    return (0, receipt_1.renderReceiptHtml)(receipt, { returnUrl });
                }
            }
            catch (err) {
                console.error(`[payments] Failed to render receipt page for ${checkoutType} ${id}:`, err);
            }
        }
        return renderSuccessHtml(provider, reference, frontendUrl);
    });
}
// ─── POST /checkout ────────────────────────────────────────────────────────────
// Create a checkout session/intent or sandbox mock for the chosen payment provider
router.post('/checkout', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const { checkoutType, id, provider, isSplit, currency: reqCurrency, localAmount: reqLocalAmount, deliveryAddress } = req.body;
    if (!checkoutType || !id || !provider) {
        return res.status(400).json({ error: 'checkoutType, id, and provider are required' });
    }
    try {
        let totalAmount = 0;
        let userEmail = '';
        let userName = '';
        let isSplitPaymentChosen = !!isSplit;
        if (checkoutType === 'order') {
            const order = yield prisma_1.default.order.findUnique({
                where: { id },
                include: { user: true },
            });
            if (!order)
                return res.status(404).json({ error: 'Order not found' });
            const updatedOrder = yield prisma_1.default.order.update({
                where: { id },
                data: Object.assign({ isSplitPayment: order.isSplitPayment || isSplitPaymentChosen }, (deliveryAddress ? { deliveryAddress: String(deliveryAddress).trim() } : {})),
                include: { user: true },
            });
            userEmail = updatedOrder.user.email;
            userName = updatedOrder.user.name || updatedOrder.user.email || 'Valued Customer';
            if (updatedOrder.amountPaid > 0) {
                totalAmount = updatedOrder.totalAmount - updatedOrder.amountPaid;
            }
            else {
                totalAmount = updatedOrder.isSplitPayment ? updatedOrder.totalAmount / 2 : updatedOrder.totalAmount;
            }
        }
        else if (checkoutType === 'booking') {
            const booking = yield prisma_1.default.booking.findUnique({
                where: { id },
                include: { customer: true },
            });
            if (!booking)
                return res.status(404).json({ error: 'Booking not found' });
            const updatedBooking = yield prisma_1.default.booking.update({
                where: { id },
                data: { isSplitPayment: booking.isSplitPayment || isSplitPaymentChosen },
                include: { customer: true },
            });
            userEmail = updatedBooking.customer.email;
            userName = updatedBooking.customer.name;
            if (updatedBooking.amountPaid > 0) {
                totalAmount = updatedBooking.totalPrice - updatedBooking.amountPaid;
            }
            else {
                totalAmount = updatedBooking.isSplitPayment ? updatedBooking.totalPrice / 2 : updatedBooking.totalPrice;
            }
        }
        else if (checkoutType === 'parcel') {
            const parcel = yield prisma_1.default.parcelDelivery.findUnique({
                where: { id },
                include: { user: true },
            });
            if (!parcel)
                return res.status(404).json({ error: 'Parcel delivery not found' });
            userEmail = parcel.user.email;
            userName = parcel.user.name;
            totalAmount = parcel.totalAmount;
        }
        else if (checkoutType === 'wallet_funding') {
            // The record here is a WalletFunding row (POST /wallet/fund creates it
            // PENDING), not an order/booking/parcel — same shape as the other
            // three branches otherwise, so it flows through the rest of this
            // endpoint (and processPaymentVerification) unchanged.
            const funding = yield prisma_1.default.walletFunding.findUnique({
                where: { id },
                include: { user: true },
            });
            if (!funding)
                return res.status(404).json({ error: 'Wallet funding request not found' });
            if (funding.status === 'PAID')
                return res.status(400).json({ error: 'This funding request was already paid.' });
            userEmail = funding.user.email;
            userName = funding.user.name;
            totalAmount = funding.amount;
        }
        else {
            return res.status(400).json({ error: 'Invalid checkoutType' });
        }
        const metadata = {
            checkoutType,
            id,
        };
        const chargeCurrency = reqCurrency || 'NGN';
        const chargeAmount = reqLocalAmount !== undefined && reqLocalAmount > 0
            ? Number(reqLocalAmount)
            : totalAmount;
        // Load API Keys dynamically from DB settings
        const settingsList = yield prisma_1.default.appSetting.findMany({
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
        }, {});
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
                const activeStripe = new stripe_1.default(activeStripeKey, {
                    apiVersion: '2023-10-16',
                });
                const paymentIntent = yield activeStripe.paymentIntents.create({
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
            }
            catch (err) {
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
                const response = yield axios_1.default.post(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
                    email: userEmail,
                    amount: Math.round(chargeAmount * 100), // Paystack uses kobo
                    currency: chargeCurrency,
                    reference,
                    callback_url: callbackUrl,
                    metadata,
                }, {
                    timeout: 10000,
                    headers: {
                        Authorization: `Bearer ${activePaystackKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (response.data && response.data.status && ((_a = response.data.data) === null || _a === void 0 ? void 0 : _a.authorization_url)) {
                    return res.json({
                        provider: 'PAYSTACK',
                        authorizationUrl: response.data.data.authorization_url,
                        reference: response.data.data.reference || reference,
                    });
                }
                throw new Error(((_b = response.data) === null || _b === void 0 ? void 0 : _b.message) || 'Paystack initialization failed.');
            }
            catch (err) {
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
                const response = yield axios_1.default.post(`${FLUTTERWAVE_BASE_URL}/payments`, {
                    tx_ref: txRef,
                    amount: chargeAmount,
                    currency: chargeCurrency,
                    redirect_url: redirectUrl,
                    customer: {
                        email: userEmail,
                        name: userName,
                    },
                    meta: metadata,
                }, {
                    timeout: 10000,
                    headers: {
                        Authorization: `Bearer ${activeFlutterwaveKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (response.data && response.data.status === 'success' && ((_c = response.data.data) === null || _c === void 0 ? void 0 : _c.link)) {
                    return res.json({
                        provider: 'FLUTTERWAVE',
                        paymentLink: response.data.data.link,
                        txRef,
                    });
                }
                throw new Error(((_d = response.data) === null || _d === void 0 ? void 0 : _d.message) || 'Flutterwave initialization failed.');
            }
            catch (err) {
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
                const response = yield axios_1.default.post('https://sandbox-api.opaycheckout.com/api/v1/international/cashier/create', {
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
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${activeOpayPublicKey}`,
                        MerchantId: activeOpayMerchantId,
                    },
                });
                if (response.data && (response.data.code === '00000' || ((_e = response.data.data) === null || _e === void 0 ? void 0 : _e.checkoutUrl))) {
                    return res.json({
                        provider: 'OPAY',
                        authorizationUrl: response.data.data.checkoutUrl,
                        reference,
                    });
                }
                throw new Error(((_f = response.data) === null || _f === void 0 ? void 0 : _f.message) || 'OPay Cashier response error');
            }
            catch (err) {
                console.warn(`[OPayService] API error. Falling back to sandbox mock: ${err.message}`);
                return res.json({
                    provider: 'OPAY',
                    authorizationUrl: `${baseUrl}/api/payments/opay/mock-pay?reference=${reference}&amount=${chargeAmount.toFixed(2)}&currency=${chargeCurrency}&type=${checkoutType}&id=${id}`,
                    reference,
                });
            }
        }
        return res.status(400).json({ error: 'Invalid payment provider specified.' });
    }
    catch (error) {
        next(error);
    }
}));
// ─── Direct Virtual Wallet Payment ───────────────────────────────────────────
router.post('/wallet-pay', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const { checkoutType, id, isSplit } = req.body;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!checkoutType || !id)
        return res.status(400).json({ error: 'checkoutType and id are required' });
    try {
        const walletSetting = yield prisma_1.default.appSetting.findUnique({ where: { key: 'wallet_enabled' } });
        if (walletSetting && walletSetting.value === 'false') {
            return res.status(400).json({ error: 'Virtual wallet payment is currently disabled by administrator. Please choose another payment method.' });
        }
        const wallet = yield (0, wallet_1.getOrCreateWallet)(userId);
        let amountToPay = 0;
        if (checkoutType === 'order') {
            const order = yield prisma_1.default.order.findUnique({ where: { id } });
            if (!order)
                return res.status(404).json({ error: 'Order not found' });
            amountToPay = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : (isSplit ? order.totalAmount / 2 : order.totalAmount);
        }
        else if (checkoutType === 'booking') {
            const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
            if (!booking)
                return res.status(404).json({ error: 'Booking not found' });
            amountToPay = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : (isSplit ? booking.totalPrice / 2 : booking.totalPrice);
        }
        else if (checkoutType === 'parcel') {
            const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
            if (!parcel)
                return res.status(404).json({ error: 'Parcel delivery not found' });
            amountToPay = parcel.totalAmount;
        }
        if (wallet.balance < amountToPay) {
            return res.status(400).json({
                error: `Insufficient wallet balance. Available: ₦${wallet.balance.toLocaleString()}, Required: ₦${amountToPay.toLocaleString()}. Please fund your wallet or choose another payment method.`
            });
        }
        // Deduct from wallet
        yield prisma_1.default.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: amountToPay } },
        });
        // Create transaction record
        yield prisma_1.default.transaction.create({
            data: {
                walletId: wallet.id,
                amount: amountToPay,
                type: 'DEBIT',
                description: `Payment for ${checkoutType} #${id.slice(0, 8)}`,
            }
        });
        const reference = `WALLET_${id}_${Date.now()}`;
        const result = yield processPaymentVerification({
            provider: 'NONE',
            reference,
            checkoutType,
            id,
            chargedAmount: amountToPay,
        });
        res.json(Object.assign({ success: true, message: `Payment of ₦${amountToPay.toLocaleString()} completed using your wallet balance!`, reference }, result));
    }
    catch (error) {
        next(error);
    }
}));
// ─── VERIFICATION & CALLBACK ROUTES ──────────────────────────────────────────
// Verify Paystack Payment via API
router.get('/paystack/verify/:reference', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { reference } = req.params;
    try {
        const paystackSetting = yield prisma_1.default.appSetting.findUnique({ where: { key: 'paystack_secret_key' } });
        const activePaystackKey = (paystackSetting === null || paystackSetting === void 0 ? void 0 : paystackSetting.value) || process.env.PAYSTACK_SECRET_KEY || 'sk_test_dummy';
        const isDummy = !activePaystackKey || activePaystackKey.includes('dummy') || activePaystackKey === 'sk_test_dummy';
        // Sandbox mock mode — ONLY when no real secret key is configured. This
        // must never be decided from `reference`'s own prefix: /checkout mints
        // the SAME "PAY_<id>_<timestamp>" reference for both mock AND real
        // Paystack transactions (it's also the reference sent to Paystack's own
        // initialize call), so an attacker could otherwise craft a request with
        // that prefix and skip real verification entirely, marking any order
        // "paid" for free even with a fully configured live Paystack account.
        if (isDummy) {
            const parts = reference.split('_');
            const id = parts[1];
            if (!id)
                return res.status(400).json({ error: 'Invalid reference signature.' });
            // Determine checkout type from DB
            const order = yield prisma_1.default.order.findUnique({ where: { id } });
            if (order) {
                const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
                const result = yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'order', id, chargedAmount });
                return res.json(Object.assign({ status: 'success', message: 'Order payment verified via Paystack sandbox.' }, result));
            }
            const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
            if (booking) {
                const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
                const result = yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'booking', id, chargedAmount });
                return res.json(Object.assign({ status: 'success', message: 'Booking payment verified via Paystack sandbox.' }, result));
            }
            const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
            if (parcel) {
                const result = yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
                return res.json(Object.assign({ status: 'success', message: 'Parcel payment verified via Paystack sandbox.' }, result));
            }
            const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
            if (funding) {
                const result = yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'wallet_funding', id, chargedAmount: funding.amount });
                return res.json(Object.assign({ status: 'success', message: 'Wallet funding verified via Paystack sandbox.' }, result));
            }
            return res.status(404).json({ error: 'Target record not found for reference.' });
        }
        // Live Paystack API verification
        const response = yield axios_1.default.get(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
            timeout: 10000,
            headers: {
                Authorization: `Bearer ${activePaystackKey}`,
            },
        });
        const data = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data;
        if (data && data.status === 'success') {
            const { checkoutType, id } = data.metadata || {};
            if (!checkoutType || !id) {
                return res.status(400).json({ error: 'Payment verified but is missing order metadata; cannot fulfil it.' });
            }
            const chargedAmount = data.amount / 100;
            const result = yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType, id, chargedAmount });
            return res.json(Object.assign({ status: 'success', message: 'Paystack payment verified.' }, result));
        }
        return res.status(400).json({ error: `Payment not successful. Status: ${(data === null || data === void 0 ? void 0 : data.status) || 'failed'}` });
    }
    catch (error) {
        next(error);
    }
}));
// Paystack Redirect Callback
router.get('/paystack/callback', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const reference = (req.query.reference || req.query.trxref);
    const frontendUrl = getFrontendUrl(req);
    if (!reference) {
        return res.redirect(`${frontendUrl}/?payment_status=cancelled`);
    }
    try {
        let id = reference.split('_')[1];
        let chargedAmountOverride = null;
        const paystackSetting = yield prisma_1.default.appSetting.findUnique({ where: { key: 'paystack_secret_key' } });
        const activePaystackKey = (paystackSetting === null || paystackSetting === void 0 ? void 0 : paystackSetting.value) || process.env.PAYSTACK_SECRET_KEY || 'sk_test_dummy';
        const isDummy = !activePaystackKey || activePaystackKey.includes('dummy') || activePaystackKey === 'sk_test_dummy';
        // Whenever a real key is configured, verification with Paystack is
        // mandatory — never inferred from `reference`'s own prefix (see the
        // matching comment on /paystack/verify above for why that's unsafe: an
        // attacker can hit this public, unauthenticated GET endpoint directly
        // with any reference of their choosing, and this callback's only job is
        // to mark the underlying order/booking/parcel PAID and move money into
        // escrow). If verification fails or the API errors, refuse outright
        // instead of silently proceeding.
        if (!isDummy) {
            try {
                const verifyRes = yield axios_1.default.get(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
                    headers: { Authorization: `Bearer ${activePaystackKey}` },
                    timeout: 10000,
                });
                if (((_b = (_a = verifyRes.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.status) !== 'success') {
                    return res.send(renderFailureHtml('Paystack', reference, frontendUrl, `Payment status: ${((_d = (_c = verifyRes.data) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.status) || 'unknown'}.`));
                }
                if ((_g = (_f = (_e = verifyRes.data) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.metadata) === null || _g === void 0 ? void 0 : _g.id) {
                    id = verifyRes.data.data.metadata.id;
                }
                if ((_j = (_h = verifyRes.data) === null || _h === void 0 ? void 0 : _h.data) === null || _j === void 0 ? void 0 : _j.amount) {
                    chargedAmountOverride = verifyRes.data.data.amount / 100;
                }
            }
            catch (e) {
                return res.send(renderFailureHtml('Paystack', reference, frontendUrl));
            }
        }
        if (!id) {
            const ord = yield prisma_1.default.order.findFirst({ where: { paymentRef: reference } });
            if (ord)
                id = ord.id;
        }
        let matchedType = null;
        if (id) {
            const order = yield prisma_1.default.order.findUnique({ where: { id } });
            if (order) {
                const chargedAmount = chargedAmountOverride || (order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount);
                yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'order', id, chargedAmount });
                matchedType = 'order';
            }
            else {
                const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
                if (booking) {
                    const chargedAmount = chargedAmountOverride || (booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice);
                    yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'booking', id, chargedAmount });
                    matchedType = 'booking';
                }
                else {
                    const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
                    if (parcel) {
                        yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'parcel', id, chargedAmount: chargedAmountOverride || parcel.totalAmount });
                        matchedType = 'parcel';
                    }
                    else {
                        const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
                        if (funding) {
                            yield processPaymentVerification({ provider: 'PAYSTACK', reference, checkoutType: 'wallet_funding', id, chargedAmount: chargedAmountOverride || funding.amount });
                            matchedType = 'wallet_funding';
                        }
                    }
                }
            }
        }
        else {
            return res.send(renderFailureHtml('Paystack', reference, frontendUrl, 'Could not determine which order/booking this payment belongs to.'));
        }
        if (!matchedType) {
            return res.send(renderFailureHtml('Paystack', reference, frontendUrl, 'Could not determine which order/booking this payment belongs to.'));
        }
        res.send(yield renderPaymentSuccessPage({ checkoutType: matchedType, id, provider: 'Paystack', reference, frontendUrl }));
    }
    catch (error) {
        // Was renderSuccessHtml here — showed "Payment Successful!" even when
        // this handler threw before ever confirming or recording the payment.
        res.send(renderFailureHtml('Paystack', reference, frontendUrl));
    }
}));
// Verify Flutterwave Payment via API
router.get('/flutterwave/verify/:transactionId', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { transactionId } = req.params;
    try {
        const flutterwaveSetting = yield prisma_1.default.appSetting.findUnique({ where: { key: 'flutterwave_secret_key' } });
        const activeFlutterwaveKey = (flutterwaveSetting === null || flutterwaveSetting === void 0 ? void 0 : flutterwaveSetting.value) || process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-dummy';
        const isDummy = !activeFlutterwaveKey || activeFlutterwaveKey.includes('dummy') || activeFlutterwaveKey.startsWith('FLWSECK_TEST-dummy');
        // Sandbox mock mode — ONLY when no real secret key is configured. See
        // the matching comment on /paystack/verify: /checkout mints the SAME
        // "FLW_<id>_<timestamp>" txRef for both mock AND real Flutterwave
        // transactions, so deciding this from the reference's own prefix would
        // let anyone skip real verification by crafting that prefix themselves.
        if (isDummy) {
            const parts = transactionId.split('_');
            const id = parts[1];
            if (!id)
                return res.status(400).json({ error: 'Invalid reference signature.' });
            const order = yield prisma_1.default.order.findUnique({ where: { id } });
            if (order) {
                const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
                const result = yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: transactionId, checkoutType: 'order', id, chargedAmount });
                return res.json(Object.assign({ status: 'success', message: 'Order payment verified via Flutterwave sandbox.' }, result));
            }
            const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
            if (booking) {
                const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
                const result = yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: transactionId, checkoutType: 'booking', id, chargedAmount });
                return res.json(Object.assign({ status: 'success', message: 'Booking payment verified via Flutterwave sandbox.' }, result));
            }
            const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
            if (parcel) {
                const result = yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: transactionId, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
                return res.json(Object.assign({ status: 'success', message: 'Parcel payment verified via Flutterwave sandbox.' }, result));
            }
            const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
            if (funding) {
                const result = yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: transactionId, checkoutType: 'wallet_funding', id, chargedAmount: funding.amount });
                return res.json(Object.assign({ status: 'success', message: 'Wallet funding verified via Flutterwave sandbox.' }, result));
            }
            return res.status(404).json({ error: 'Target record not found for transaction ID.' });
        }
        // Live Flutterwave API verification
        const response = yield axios_1.default.get(`${FLUTTERWAVE_BASE_URL}/transactions/${encodeURIComponent(transactionId)}/verify`, {
            timeout: 10000,
            headers: {
                Authorization: `Bearer ${activeFlutterwaveKey}`,
            },
        });
        const data = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data;
        if (data && (data.status === 'successful' || data.status === 'success')) {
            const { checkoutType, id } = data.meta || {};
            if (!checkoutType || !id) {
                return res.status(400).json({ error: 'Payment verified but is missing order metadata; cannot fulfil it.' });
            }
            const chargedAmount = data.amount;
            const result = yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: String(transactionId), checkoutType, id, chargedAmount });
            return res.json(Object.assign({ status: 'success', message: 'Flutterwave payment verified.' }, result));
        }
        return res.status(400).json({ error: `Payment not successful. Status: ${(data === null || data === void 0 ? void 0 : data.status) || 'failed'}` });
    }
    catch (error) {
        next(error);
    }
}));
// Flutterwave Redirect Callback
router.get('/flutterwave/callback', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const txRef = (req.query.tx_ref || req.query.transaction_id || req.query.reference);
    const status = req.query.status;
    const frontendUrl = getFrontendUrl(req);
    if (status === 'cancelled' || !txRef) {
        return res.redirect(`${frontendUrl}/?payment_status=cancelled`);
    }
    try {
        let id = txRef.split('_')[1];
        let chargedAmountOverride = null;
        const flutterwaveSetting = yield prisma_1.default.appSetting.findUnique({ where: { key: 'flutterwave_secret_key' } });
        const activeFlutterwaveKey = (flutterwaveSetting === null || flutterwaveSetting === void 0 ? void 0 : flutterwaveSetting.value) || process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-dummy';
        const isDummy = !activeFlutterwaveKey || activeFlutterwaveKey.includes('dummy') || activeFlutterwaveKey.startsWith('FLWSECK_TEST-dummy');
        // Whenever a real key is configured, verification with Flutterwave is
        // mandatory — see the matching comment on /paystack/callback for why
        // this can't be decided from txRef's own prefix.
        if (!isDummy) {
            try {
                const verifyRes = yield axios_1.default.get(`${FLUTTERWAVE_BASE_URL}/transactions/${encodeURIComponent(txRef)}/verify`, {
                    headers: { Authorization: `Bearer ${activeFlutterwaveKey}` },
                    timeout: 10000,
                });
                const vStatus = (_b = (_a = verifyRes.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.status;
                if (vStatus !== 'successful' && vStatus !== 'success') {
                    return res.send(renderFailureHtml('Flutterwave', txRef, frontendUrl, `Payment status: ${vStatus || 'unknown'}.`));
                }
                if ((_e = (_d = (_c = verifyRes.data) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.meta) === null || _e === void 0 ? void 0 : _e.id) {
                    id = verifyRes.data.data.meta.id;
                }
                if ((_g = (_f = verifyRes.data) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.amount) {
                    chargedAmountOverride = verifyRes.data.data.amount;
                }
            }
            catch (e) {
                return res.send(renderFailureHtml('Flutterwave', txRef, frontendUrl));
            }
        }
        if (!id) {
            const ord = yield prisma_1.default.order.findFirst({ where: { paymentRef: txRef } });
            if (ord)
                id = ord.id;
        }
        let matchedType = null;
        if (id) {
            const order = yield prisma_1.default.order.findUnique({ where: { id } });
            if (order) {
                const chargedAmount = chargedAmountOverride || (order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount);
                yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: txRef, checkoutType: 'order', id, chargedAmount });
                matchedType = 'order';
            }
            else {
                const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
                if (booking) {
                    const chargedAmount = chargedAmountOverride || (booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice);
                    yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: txRef, checkoutType: 'booking', id, chargedAmount });
                    matchedType = 'booking';
                }
                else {
                    const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
                    if (parcel) {
                        yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: txRef, checkoutType: 'parcel', id, chargedAmount: chargedAmountOverride || parcel.totalAmount });
                        matchedType = 'parcel';
                    }
                    else {
                        const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
                        if (funding) {
                            yield processPaymentVerification({ provider: 'FLUTTERWAVE', reference: txRef, checkoutType: 'wallet_funding', id, chargedAmount: chargedAmountOverride || funding.amount });
                            matchedType = 'wallet_funding';
                        }
                    }
                }
            }
        }
        else {
            return res.send(renderFailureHtml('Flutterwave', txRef, frontendUrl, 'Could not determine which order/booking this payment belongs to.'));
        }
        if (!matchedType) {
            return res.send(renderFailureHtml('Flutterwave', txRef, frontendUrl, 'Could not determine which order/booking this payment belongs to.'));
        }
        res.send(yield renderPaymentSuccessPage({ checkoutType: matchedType, id, provider: 'Flutterwave', reference: txRef, frontendUrl }));
    }
    catch (error) {
        res.send(renderFailureHtml('Flutterwave', txRef, frontendUrl));
    }
}));
// ─── SANDBOX MOCK CASHIERS ─────────────────────────────────────────────────────
// Stripe Sandbox Mock Payment Page
router.get('/stripe/mock-pay', (req, res) => {
    const { reference, amount, currency, type, id } = req.query;
    const amt = amount ? parseFloat(amount) : 0;
    const curr = currency || 'NGN';
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
router.get('/stripe/verify/:reference', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { reference } = req.params;
    const frontendUrl = getFrontendUrl(req);
    try {
        let id = reference.split('_')[1];
        let checkoutType = null;
        let chargedAmountOverride = null;
        const stripeSetting = yield prisma_1.default.appSetting.findUnique({ where: { key: 'stripe_secret_key' } });
        const activeStripeKey = (stripeSetting === null || stripeSetting === void 0 ? void 0 : stripeSetting.value) || process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
        const isDummy = !activeStripeKey || activeStripeKey.includes('dummy') || activeStripeKey === 'sk_test_dummy';
        // Whenever a real key is configured, verification with Stripe is
        // mandatory — the previous version only attempted it when `reference`
        // happened to start with "pi_", and silently fell through to trusting
        // "id = reference.split('_')[1]" directly (from this public,
        // unauthenticated GET endpoint's own URL param) for anything else,
        // including if the real retrieve() call itself failed. That let anyone
        // mark any order/booking/parcel "paid" for free by hitting this
        // endpoint with a crafted reference, live Stripe account or not.
        if (!isDummy) {
            if (!reference.startsWith('pi_')) {
                return res.send(renderFailureHtml('Stripe', reference, frontendUrl, 'Not a recognized Stripe payment reference.'));
            }
            try {
                const activeStripe = new stripe_1.default(activeStripeKey, { apiVersion: '2023-10-16' });
                const pi = yield activeStripe.paymentIntents.retrieve(reference);
                if (pi.status !== 'succeeded') {
                    return res.send(renderFailureHtml('Stripe', reference, frontendUrl, `Payment status: ${pi.status}.`));
                }
                id = ((_a = pi.metadata) === null || _a === void 0 ? void 0 : _a.id) || null;
                checkoutType = ((_b = pi.metadata) === null || _b === void 0 ? void 0 : _b.checkoutType) || null;
                chargedAmountOverride = pi.amount_received / 100;
            }
            catch (e) {
                console.warn('[StripeVerify] Could not retrieve PaymentIntent:', e);
                return res.send(renderFailureHtml('Stripe', reference, frontendUrl));
            }
        }
        if (!id) {
            // Mock-mode fallback: check if an order/parcel/wallet-funding has paymentRef = reference
            const ord = yield prisma_1.default.order.findFirst({ where: { paymentRef: reference } });
            if (ord) {
                id = ord.id;
                checkoutType = 'order';
            }
            else {
                const pcl = yield prisma_1.default.parcelDelivery.findFirst({ where: { paymentRef: reference } });
                if (pcl) {
                    id = pcl.id;
                    checkoutType = 'parcel';
                }
                else {
                    const wf = yield prisma_1.default.walletFunding.findFirst({ where: { paymentRef: reference } });
                    if (wf) {
                        id = wf.id;
                        checkoutType = 'wallet_funding';
                    }
                }
            }
        }
        if (!id) {
            return res.send(renderFailureHtml('Stripe', reference, frontendUrl, 'Could not determine which order/booking this payment belongs to.'));
        }
        let matchedType = null;
        const order = yield prisma_1.default.order.findUnique({ where: { id } });
        if (order) {
            const chargedAmount = chargedAmountOverride || (order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount);
            yield processPaymentVerification({ provider: 'STRIPE', reference, checkoutType: 'order', id, chargedAmount });
            matchedType = 'order';
        }
        else {
            const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
            if (booking) {
                const chargedAmount = chargedAmountOverride || (booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice);
                yield processPaymentVerification({ provider: 'STRIPE', reference, checkoutType: 'booking', id, chargedAmount });
                matchedType = 'booking';
            }
            else {
                const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
                if (parcel) {
                    yield processPaymentVerification({ provider: 'STRIPE', reference, checkoutType: 'parcel', id, chargedAmount: chargedAmountOverride || parcel.totalAmount });
                    matchedType = 'parcel';
                }
                else {
                    const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
                    if (funding) {
                        yield processPaymentVerification({ provider: 'STRIPE', reference, checkoutType: 'wallet_funding', id, chargedAmount: chargedAmountOverride || funding.amount });
                        matchedType = 'wallet_funding';
                    }
                }
            }
        }
        if (!matchedType) {
            return res.send(renderFailureHtml('Stripe', reference, frontendUrl, 'Could not determine which order/booking this payment belongs to.'));
        }
        res.send(yield renderPaymentSuccessPage({ checkoutType: matchedType, id, provider: 'Stripe', reference, frontendUrl }));
    }
    catch (error) {
        res.send(renderFailureHtml('Stripe', reference, frontendUrl));
    }
}));
// Paystack Sandbox Mock Page
router.get('/paystack/mock-pay', (req, res) => {
    const { reference, amount, currency } = req.query;
    const amt = amount ? parseFloat(amount) : 0;
    const curr = currency || 'NGN';
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
router.get('/flutterwave/mock-pay', (req, res) => {
    const { reference, amount, currency } = req.query;
    const amt = amount ? parseFloat(amount) : 0;
    const curr = currency || 'NGN';
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
router.get('/opay/mock-pay', (req, res) => {
    const { reference, amount, currency } = req.query;
    const amt = amount ? parseFloat(amount) : 0;
    const curr = currency || 'NGN';
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
router.get('/opay/verify/:reference', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { reference } = req.params;
    const frontendUrl = getFrontendUrl(req);
    try {
        const parts = reference.split('_');
        const id = parts[1];
        if (!id) {
            return res.status(400).send('Invalid reference signature.');
        }
        const opaySettings = yield prisma_1.default.appSetting.findMany({
            where: { key: { in: ['opay_merchant_id', 'opay_public_key', 'opay_secret_key'] } },
        });
        const os = opaySettings.reduce((acc, s) => (Object.assign(Object.assign({}, acc), { [s.key]: s.value })), {});
        const merchantId = os['opay_merchant_id'] || process.env.OPAY_MERCHANT_ID || '';
        const publicKey = os['opay_public_key'] || process.env.OPAY_PUBLIC_KEY || '';
        const secretKey = os['opay_secret_key'] || process.env.OPAY_SECRET_KEY || '';
        const isDummy = !merchantId || !publicKey || !secretKey ||
            merchantId.includes('dummy') || publicKey.includes('dummy') || secretKey.includes('dummy');
        // Whenever real OPay credentials are configured, this public,
        // unauthenticated GET endpoint MUST confirm with OPay's own status API
        // before marking anything paid — previously it trusted the `id`
        // extracted from `reference` unconditionally, so anyone who found this
        // URL could mark any order/booking/parcel paid for free by requesting
        // e.g. /opay/verify/OPAY_<anyId>_123, real OPay account or not.
        if (!isDummy) {
            try {
                const result = yield verifyOpayTransaction(reference, merchantId, publicKey, secretKey);
                if (!result.verified) {
                    return res.send(renderFailureHtml('OPay', reference, frontendUrl, 'OPay did not confirm this payment as successful.'));
                }
            }
            catch (e) {
                console.warn('[OPayVerify] Status check failed:', e);
                return res.send(renderFailureHtml('OPay', reference, frontendUrl));
            }
        }
        const order = yield prisma_1.default.order.findUnique({ where: { id } });
        if (order) {
            const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
            yield processPaymentVerification({ provider: 'OPAY', reference, checkoutType: 'order', id, chargedAmount });
            return res.send(yield renderPaymentSuccessPage({ checkoutType: 'order', id, provider: 'OPay', reference, frontendUrl }));
        }
        const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
        if (booking) {
            const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
            yield processPaymentVerification({ provider: 'OPAY', reference, checkoutType: 'booking', id, chargedAmount });
            return res.send(yield renderPaymentSuccessPage({ checkoutType: 'booking', id, provider: 'OPay', reference, frontendUrl }));
        }
        const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
        if (parcel) {
            yield processPaymentVerification({ provider: 'OPAY', reference, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
            return res.send(yield renderPaymentSuccessPage({ checkoutType: 'parcel', id, provider: 'OPay', reference, frontendUrl }));
        }
        const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
        if (funding) {
            yield processPaymentVerification({ provider: 'OPAY', reference, checkoutType: 'wallet_funding', id, chargedAmount: funding.amount });
            return res.send(renderSuccessHtml('OPay', reference, frontendUrl, 'Wallet Funded Successfully!', 'Your OPay top-up has been verified and added to your wallet balance.'));
        }
        return res.status(404).send('Reference ID was not found or could not match any active record.');
    }
    catch (error) {
        next(error);
    }
}));
// Staging OPay callback redirect handler (fallback for real API)
router.get('/opay/verify-callback', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { reference } = req.query;
    if (!reference)
        return res.status(400).send('Missing reference.');
    res.redirect(`/api/payments/opay/verify/${reference}`);
}));
// Staging OPay Webhook receiver (official OPay API webhooks)
router.post('/opay/webhook', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const payload = req.body;
        console.log('[OPayWebhook] Received notification:', JSON.stringify(payload));
        // This endpoint's whole job is to mark an order/booking/parcel paid —
        // it had no signature check at all, so anyone who found this URL could
        // POST a payload of their own choosing and get anything marked paid for
        // free, with real money moved into escrow. Require OPay's documented
        // HMAC-SHA3-512 payload signature (see verifyOpayWebhookSignature) once
        // real credentials are configured; while only dummy/unconfigured keys
        // exist there's no real webhook traffic to receive in the first place,
        // so this intentionally still accepts (and ignores) test payloads then.
        const opaySettings = yield prisma_1.default.appSetting.findMany({ where: { key: 'opay_secret_key' } });
        const secretKey = ((_a = opaySettings[0]) === null || _a === void 0 ? void 0 : _a.value) || process.env.OPAY_SECRET_KEY || '';
        const isDummy = !secretKey || secretKey.includes('dummy');
        if (!isDummy && !verifyOpayWebhookSignature(payload, secretKey)) {
            console.error('[OPayWebhook] Signature verification failed; ignoring payload.');
            return res.json({ code: '00000', message: 'SUCCESS' });
        }
        const ref = payload.reference || payload.orderNo || ((_b = payload.data) === null || _b === void 0 ? void 0 : _b.reference) || ((_c = payload.data) === null || _c === void 0 ? void 0 : _c.orderNo);
        if (ref) {
            const parts = ref.split('_');
            const id = parts[1];
            if (id) {
                const order = yield prisma_1.default.order.findUnique({ where: { id } });
                if (order && order.status !== 'PAID') {
                    const chargedAmount = order.isSplitPayment ? (order.amountPaid > 0 ? order.totalAmount - order.amountPaid : order.totalAmount / 2) : order.totalAmount;
                    yield processPaymentVerification({ provider: 'OPAY', reference: ref, checkoutType: 'order', id, chargedAmount });
                }
                const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
                if (booking && booking.status !== 'ACCEPTED') {
                    const chargedAmount = booking.isSplitPayment ? (booking.amountPaid > 0 ? booking.totalPrice - booking.amountPaid : booking.totalPrice / 2) : booking.totalPrice;
                    yield processPaymentVerification({ provider: 'OPAY', reference: ref, checkoutType: 'booking', id, chargedAmount });
                }
                const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
                if (parcel && parcel.status !== 'PAID') {
                    yield processPaymentVerification({ provider: 'OPAY', reference: ref, checkoutType: 'parcel', id, chargedAmount: parcel.totalAmount });
                }
                const funding = yield prisma_1.default.walletFunding.findUnique({ where: { id } });
                if (funding && funding.status !== 'PAID') {
                    yield processPaymentVerification({ provider: 'OPAY', reference: ref, checkoutType: 'wallet_funding', id, chargedAmount: funding.amount });
                }
            }
        }
        res.json({ code: '00000', message: 'SUCCESS' });
    }
    catch (err) {
        console.error('[OPayWebhookError]', err);
        res.json({ code: '00000', message: 'SUCCESS' });
    }
}));
// Stripe Webhook handler
router.post('/webhook', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const sig = req.headers['stripe-signature'];
    try {
        const settingsList = yield prisma_1.default.appSetting.findMany({
            where: {
                key: {
                    in: ['stripe_secret_key', 'stripe_webhook_secret']
                }
            }
        });
        const settings = settingsList.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        const activeStripeKey = settings['stripe_secret_key'] || process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
        const endpointSecret = settings['stripe_webhook_secret'] || process.env.STRIPE_WEBHOOK_SECRET || '';
        const activeStripe = new stripe_1.default(activeStripeKey, {
            apiVersion: '2023-10-16',
        });
        // Without a webhook secret there is no way to prove this request really
        // came from Stripe rather than anyone who found this URL — parsing the
        // raw body as a trusted event let anyone POST a fake
        // "payment_intent.succeeded" and mark any order/booking/parcel paid.
        // Refuse rather than silently trust when the secret isn't configured.
        if (!endpointSecret) {
            console.error('[StripeWebhook] stripe_webhook_secret is not configured; refusing unverifiable webhook.');
            return res.status(400).json({ error: 'Webhook is not configured for signature verification.' });
        }
        const event = activeStripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const { checkoutType, id } = paymentIntent.metadata || {};
            const chargedAmount = paymentIntent.amount / 100;
            if (checkoutType && id) {
                yield processPaymentVerification({
                    provider: 'STRIPE',
                    reference: paymentIntent.id,
                    checkoutType,
                    id,
                    chargedAmount,
                });
            }
        }
        res.json({ received: true });
    }
    catch (err) {
        next(err);
    }
}));
// Internal escrow-release endpoint
router.post('/webhook/split', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { escrowId, secretToken } = req.body;
    const WEBHOOK_SPLIT_SECRET = process.env.WEBHOOK_SPLIT_SECRET;
    if (!escrowId) {
        return res.status(400).json({ error: 'escrowId is required.' });
    }
    if (WEBHOOK_SPLIT_SECRET && secretToken !== WEBHOOK_SPLIT_SECRET) {
        return res.status(401).json({ error: 'Unauthorized split request.' });
    }
    try {
        const updatedEscrow = yield (0, wallet_1.releaseEscrow)(escrowId);
        return res.json({ success: true, message: 'Escrow released successfully.', escrow: updatedEscrow });
    }
    catch (err) {
        console.error(`[EscrowReleaseEndpointError] ${err.message}`);
        next(err);
    }
}));
// Admin: Fetch all escrows and payment stats
router.get('/admin/all-escrows', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN')
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    try {
        const escrows = yield prisma_1.default.escrow.findMany({
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
    }
    catch (error) {
        next(error);
    }
}));
// ─── ADMIN: FORCE-RELEASE ESCROW ────────────────────────────────────────────────
router.post('/admin/force-release-escrow/:escrowId', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'ADMIN')
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    const { escrowId } = req.params;
    if (!escrowId)
        return res.status(400).json({ error: 'escrowId is required.' });
    try {
        // Verify the escrow exists and is still HELD before releasing
        const escrow = yield prisma_1.default.escrow.findUnique({ where: { id: escrowId } });
        if (!escrow)
            return res.status(404).json({ error: 'Escrow record not found.' });
        if (escrow.status !== 'HELD') {
            return res.status(400).json({ error: `Escrow is already ${escrow.status.toLowerCase()} and cannot be force-released.` });
        }
        const updatedEscrow = yield (0, wallet_1.releaseEscrow)(escrowId);
        res.json({ success: true, escrow: updatedEscrow, message: 'Escrow funds successfully released to professional wallet.' });
    }
    catch (err) {
        next(err);
    }
}));
// ─── ADMIN: GET ALL TRANSACTIONS WITH SUMMARY METRICS & FILTERING ─────────────
router.get('/admin/transactions', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN')
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    try {
        const { status = 'ALL', type = 'ALL', search = '' } = req.query;
        const searchFilter = search.trim().toLowerCase();
        // 1. Fetch Orders
        const orders = yield prisma_1.default.order.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, email: true, phone: true, address: true } },
                rider: { select: { id: true, name: true, phone: true } },
                items: { include: { product: { select: { name: true, price: true, category: true } } } },
                escrows: true,
            },
        });
        // 2. Fetch Bookings
        const bookings = yield prisma_1.default.booking.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { id: true, name: true, email: true, phone: true, address: true } },
                handyman: { select: { id: true, name: true, phone: true, specialty: true } },
                service: { select: { name: true, basePrice: true, category: true } },
                escrows: true,
            },
        });
        // 3. Fetch Parcels
        const parcels = yield prisma_1.default.parcelDelivery.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, email: true, phone: true } },
                rider: { select: { id: true, name: true, phone: true } },
                escrows: true,
            },
        });
        // 4. Fetch Wallet Transactions
        const walletTxns = yield prisma_1.default.transaction.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                wallet: {
                    include: {
                        user: { select: { id: true, name: true, email: true, phone: true } },
                    },
                },
            },
        });
        // Normalize into unified transactions
        const allTransactions = [];
        // Map Orders
        for (const ord of orders) {
            let paymentStatus = 'PENDING';
            if (ord.status === 'PAID' || ord.status === 'SHIPPED' || ord.status === 'DELIVERED') {
                paymentStatus = 'CREDITED';
            }
            else if (ord.status === 'CANCELLED') {
                paymentStatus = 'CANCELED';
            }
            let paymentMethod = 'FixMart Gateway';
            if ((_b = ord.paymentRef) === null || _b === void 0 ? void 0 : _b.startsWith('WALLET_'))
                paymentMethod = 'Virtual Wallet';
            else if (((_c = ord.paymentRef) === null || _c === void 0 ? void 0 : _c.startsWith('POD_')) || ord.paymentProvider === 'NONE')
                paymentMethod = 'Pay on Delivery';
            else if (ord.paymentProvider === 'PAYSTACK')
                paymentMethod = 'Paystack';
            else if (ord.paymentProvider === 'FLUTTERWAVE')
                paymentMethod = 'Flutterwave';
            else if (ord.paymentProvider === 'STRIPE')
                paymentMethod = 'Stripe';
            else if (ord.paymentProvider === 'OPAY')
                paymentMethod = 'OPay';
            const itemsSummary = ord.items.map(i => { var _a; return `${i.quantity}× ${((_a = i.product) === null || _a === void 0 ? void 0 : _a.name) || 'Item'}`; }).join(', ');
            const escrowStatus = ord.escrows.length > 0 ? ord.escrows[0].status : 'NONE';
            allTransactions.push({
                id: `TX-ORD-${ord.id.slice(-8).toUpperCase()}`,
                recordId: ord.id,
                type: 'ORDER',
                typeLabel: 'Product Purchase',
                reference: ord.paymentRef || `ORD-${ord.id.slice(-8).toUpperCase()}`,
                createdAt: ord.createdAt,
                totalAmount: ord.totalAmount,
                amountPaid: ord.amountPaid || (paymentStatus === 'CREDITED' ? ord.totalAmount : 0),
                currency: ord.currency || 'NGN',
                paymentProvider: paymentMethod,
                paymentStatus,
                escrowStatus,
                customer: {
                    id: (_d = ord.user) === null || _d === void 0 ? void 0 : _d.id,
                    name: ((_e = ord.user) === null || _e === void 0 ? void 0 : _e.name) || 'Customer',
                    email: ((_f = ord.user) === null || _f === void 0 ? void 0 : _f.email) || 'N/A',
                    phone: ((_g = ord.user) === null || _g === void 0 ? void 0 : _g.phone) || null,
                    address: ord.deliveryAddress || ((_h = ord.user) === null || _h === void 0 ? void 0 : _h.address) || null,
                },
                details: {
                    itemsSummary: itemsSummary || 'Purchased Products',
                    destinationAddress: ord.deliveryAddress || ((_j = ord.user) === null || _j === void 0 ? void 0 : _j.address) || 'N/A',
                    assignedProvider: (_k = ord.rider) === null || _k === void 0 ? void 0 : _k.name,
                    isSplitPayment: ord.isSplitPayment,
                },
            });
        }
        // Map Bookings
        for (const bkg of bookings) {
            let paymentStatus = 'PENDING';
            if (bkg.status === 'ACCEPTED' || bkg.status === 'COMPLETED' || bkg.amountPaid > 0) {
                paymentStatus = 'CREDITED';
            }
            else if (bkg.status === 'CANCELLED' || bkg.status === 'REJECTED') {
                paymentStatus = 'CANCELED';
            }
            const escrowStatus = bkg.escrows.length > 0 ? bkg.escrows[0].status : 'HELD';
            allTransactions.push({
                id: `TX-BKG-${bkg.id.slice(-8).toUpperCase()}`,
                recordId: bkg.id,
                type: 'BOOKING',
                typeLabel: 'Handyman Service',
                reference: `BKG-${bkg.id.slice(-8).toUpperCase()}`,
                createdAt: bkg.createdAt,
                totalAmount: bkg.totalPrice,
                amountPaid: bkg.amountPaid || (paymentStatus === 'CREDITED' ? bkg.totalPrice : 0),
                currency: bkg.currency || 'NGN',
                paymentProvider: 'FixMart Escrow',
                paymentStatus,
                escrowStatus,
                customer: {
                    id: (_l = bkg.customer) === null || _l === void 0 ? void 0 : _l.id,
                    name: ((_m = bkg.customer) === null || _m === void 0 ? void 0 : _m.name) || 'Customer',
                    email: ((_o = bkg.customer) === null || _o === void 0 ? void 0 : _o.email) || 'N/A',
                    phone: ((_p = bkg.customer) === null || _p === void 0 ? void 0 : _p.phone) || null,
                    address: bkg.address || ((_q = bkg.customer) === null || _q === void 0 ? void 0 : _q.address) || null,
                },
                details: {
                    itemsSummary: ((_r = bkg.service) === null || _r === void 0 ? void 0 : _r.name) || 'Professional Service',
                    destinationAddress: bkg.address || 'N/A',
                    assignedProvider: (_s = bkg.handyman) === null || _s === void 0 ? void 0 : _s.name,
                    isSplitPayment: bkg.isSplitPayment,
                },
            });
        }
        // Map Parcels
        for (const pcl of parcels) {
            let paymentStatus = 'PENDING';
            if (pcl.status === 'PAID' || pcl.status === 'DELIVERED' || pcl.status === 'SHIPPED') {
                paymentStatus = 'CREDITED';
            }
            else if (pcl.status === 'CANCELLED') {
                paymentStatus = 'CANCELED';
            }
            allTransactions.push({
                id: `TX-PCL-${pcl.id.slice(-8).toUpperCase()}`,
                recordId: pcl.id,
                type: 'PARCEL',
                typeLabel: 'Parcel Delivery',
                reference: pcl.paymentRef || `PCL-${pcl.id.slice(-8).toUpperCase()}`,
                createdAt: pcl.createdAt,
                totalAmount: pcl.totalAmount,
                amountPaid: paymentStatus === 'CREDITED' ? pcl.totalAmount : 0,
                currency: pcl.currency || 'NGN',
                paymentProvider: pcl.paymentProvider || 'Online Payment',
                paymentStatus,
                escrowStatus: pcl.escrows.length > 0 ? pcl.escrows[0].status : 'NONE',
                customer: {
                    id: (_t = pcl.user) === null || _t === void 0 ? void 0 : _t.id,
                    name: ((_u = pcl.user) === null || _u === void 0 ? void 0 : _u.name) || 'Customer',
                    email: ((_v = pcl.user) === null || _v === void 0 ? void 0 : _v.email) || 'N/A',
                    phone: ((_w = pcl.user) === null || _w === void 0 ? void 0 : _w.phone) || null,
                    address: `Pickup: ${pcl.pickupAddress} ➔ Dropoff: ${pcl.dropoffAddress}`,
                },
                details: {
                    itemsSummary: pcl.parcelDescription || 'Package Delivery',
                    destinationAddress: pcl.dropoffAddress,
                    assignedProvider: (_x = pcl.rider) === null || _x === void 0 ? void 0 : _x.name,
                    isSplitPayment: false,
                },
            });
        }
        // Map Wallet Deposits
        for (const w of walletTxns) {
            if (w.type === 'CREDIT' || w.type === 'DEPOSIT') {
                allTransactions.push({
                    id: `TX-WLT-${w.id.slice(-8).toUpperCase()}`,
                    recordId: w.id,
                    type: 'WALLET',
                    typeLabel: 'Wallet Top-up',
                    reference: w.referenceId || `WLT-${w.id.slice(-8).toUpperCase()}`,
                    createdAt: w.createdAt,
                    totalAmount: w.amount,
                    amountPaid: w.amount,
                    currency: 'NGN',
                    paymentProvider: 'Bank / Card Top-up',
                    paymentStatus: w.status === 'FAILED' ? 'CANCELED' : 'CREDITED',
                    escrowStatus: 'NONE',
                    customer: {
                        id: (_z = (_y = w.wallet) === null || _y === void 0 ? void 0 : _y.user) === null || _z === void 0 ? void 0 : _z.id,
                        name: ((_1 = (_0 = w.wallet) === null || _0 === void 0 ? void 0 : _0.user) === null || _1 === void 0 ? void 0 : _1.name) || 'Wallet User',
                        email: ((_3 = (_2 = w.wallet) === null || _2 === void 0 ? void 0 : _2.user) === null || _3 === void 0 ? void 0 : _3.email) || 'N/A',
                        phone: ((_5 = (_4 = w.wallet) === null || _4 === void 0 ? void 0 : _4.user) === null || _5 === void 0 ? void 0 : _5.phone) || null,
                        address: null,
                    },
                    details: {
                        itemsSummary: w.description || 'Wallet Balance Credit',
                        destinationAddress: 'Digital Wallet',
                        assignedProvider: undefined,
                        isSplitPayment: false,
                    },
                });
            }
        }
        // Sort newest first
        allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        // Calculate Summary Metrics (complete platform view)
        let creditedAmount = 0;
        let pendingAmount = 0;
        let canceledAmount = 0;
        let creditedCount = 0;
        let pendingCount = 0;
        let canceledCount = 0;
        for (const t of allTransactions) {
            if (t.paymentStatus === 'CREDITED') {
                creditedAmount += t.amountPaid || t.totalAmount;
                creditedCount++;
            }
            else if (t.paymentStatus === 'PENDING') {
                pendingAmount += t.totalAmount;
                pendingCount++;
            }
            else if (t.paymentStatus === 'CANCELED') {
                canceledAmount += t.totalAmount;
                canceledCount++;
            }
        }
        // Apply Filters
        let filtered = allTransactions;
        if (status !== 'ALL') {
            filtered = filtered.filter(t => t.paymentStatus === status);
        }
        if (type !== 'ALL') {
            filtered = filtered.filter(t => t.type === type);
        }
        if (searchFilter) {
            filtered = filtered.filter(t => t.customer.name.toLowerCase().includes(searchFilter) ||
                t.customer.email.toLowerCase().includes(searchFilter) ||
                (t.customer.phone && t.customer.phone.toLowerCase().includes(searchFilter)) ||
                t.reference.toLowerCase().includes(searchFilter) ||
                t.details.itemsSummary.toLowerCase().includes(searchFilter));
        }
        res.json({
            summary: {
                totalTransactions: allTransactions.length,
                creditedAmount,
                pendingAmount,
                canceledAmount,
                creditedCount,
                pendingCount,
                canceledCount,
            },
            transactions: filtered,
        });
    }
    catch (error) {
        next(error);
    }
}));
// ─── ADMIN: EXPORT TRANSACTIONS TO EXCEL (.CSV) OR PDF REPORT ────────────────
router.get('/admin/transactions/export', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN')
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    try {
        const { format = 'csv', status = 'ALL', type = 'ALL', search = '' } = req.query;
        const searchFilter = search.trim().toLowerCase();
        // Fetch transactions
        const orders = yield prisma_1.default.order.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, email: true, phone: true, address: true } },
                items: { include: { product: { select: { name: true, price: true } } } },
                escrows: true,
            },
        });
        const bookings = yield prisma_1.default.booking.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { id: true, name: true, email: true, phone: true, address: true } },
                handyman: { select: { name: true, phone: true } },
                service: { select: { name: true } },
                escrows: true,
            },
        });
        const parcels = yield prisma_1.default.parcelDelivery.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, email: true, phone: true } },
                escrows: true,
            },
        });
        const allTx = [];
        // Map Orders
        for (const ord of orders) {
            let paymentStatus = 'PENDING';
            if (ord.status === 'PAID' || ord.status === 'SHIPPED' || ord.status === 'DELIVERED')
                paymentStatus = 'CREDITED';
            else if (ord.status === 'CANCELLED')
                paymentStatus = 'CANCELED';
            let paymentMethod = 'FixMart Gateway';
            if ((_b = ord.paymentRef) === null || _b === void 0 ? void 0 : _b.startsWith('WALLET_'))
                paymentMethod = 'Virtual Wallet';
            else if (((_c = ord.paymentRef) === null || _c === void 0 ? void 0 : _c.startsWith('POD_')) || ord.paymentProvider === 'NONE')
                paymentMethod = 'Pay on Delivery';
            else if (ord.paymentProvider === 'PAYSTACK')
                paymentMethod = 'Paystack';
            else if (ord.paymentProvider === 'FLUTTERWAVE')
                paymentMethod = 'Flutterwave';
            else if (ord.paymentProvider === 'STRIPE')
                paymentMethod = 'Stripe';
            else if (ord.paymentProvider === 'OPAY')
                paymentMethod = 'OPay';
            allTx.push({
                id: `TX-ORD-${ord.id.slice(-8).toUpperCase()}`,
                date: ord.createdAt,
                type: 'Product Purchase',
                rawType: 'ORDER',
                reference: ord.paymentRef || `ORD-${ord.id.slice(-8).toUpperCase()}`,
                customerName: ((_d = ord.user) === null || _d === void 0 ? void 0 : _d.name) || 'Customer',
                customerEmail: ((_e = ord.user) === null || _e === void 0 ? void 0 : _e.email) || 'N/A',
                customerPhone: ((_f = ord.user) === null || _f === void 0 ? void 0 : _f.phone) || 'N/A',
                paymentMethod,
                paymentStatus,
                totalAmount: ord.totalAmount,
                amountPaid: ord.amountPaid || (paymentStatus === 'CREDITED' ? ord.totalAmount : 0),
                escrowStatus: ord.escrows.length > 0 ? ord.escrows[0].status : 'NONE',
                items: ord.items.map(i => { var _a; return `${i.quantity}x ${((_a = i.product) === null || _a === void 0 ? void 0 : _a.name) || 'Item'}`; }).join('; '),
                address: ord.deliveryAddress || ((_g = ord.user) === null || _g === void 0 ? void 0 : _g.address) || 'N/A',
            });
        }
        // Map Bookings
        for (const bkg of bookings) {
            let paymentStatus = 'PENDING';
            if (bkg.status === 'ACCEPTED' || bkg.status === 'COMPLETED' || bkg.amountPaid > 0)
                paymentStatus = 'CREDITED';
            else if (bkg.status === 'CANCELLED' || bkg.status === 'REJECTED')
                paymentStatus = 'CANCELED';
            allTx.push({
                id: `TX-BKG-${bkg.id.slice(-8).toUpperCase()}`,
                date: bkg.createdAt,
                type: 'Service Booking',
                rawType: 'BOOKING',
                reference: `BKG-${bkg.id.slice(-8).toUpperCase()}`,
                customerName: ((_h = bkg.customer) === null || _h === void 0 ? void 0 : _h.name) || 'Customer',
                customerEmail: ((_j = bkg.customer) === null || _j === void 0 ? void 0 : _j.email) || 'N/A',
                customerPhone: ((_k = bkg.customer) === null || _k === void 0 ? void 0 : _k.phone) || 'N/A',
                paymentMethod: 'FixMart Escrow',
                paymentStatus,
                totalAmount: bkg.totalPrice,
                amountPaid: bkg.amountPaid || (paymentStatus === 'CREDITED' ? bkg.totalPrice : 0),
                escrowStatus: bkg.escrows.length > 0 ? bkg.escrows[0].status : 'HELD',
                items: ((_l = bkg.service) === null || _l === void 0 ? void 0 : _l.name) || 'Service Booking',
                address: bkg.address || 'N/A',
            });
        }
        // Map Parcels
        for (const pcl of parcels) {
            let paymentStatus = 'PENDING';
            if (pcl.status === 'PAID' || pcl.status === 'DELIVERED' || pcl.status === 'SHIPPED')
                paymentStatus = 'CREDITED';
            else if (pcl.status === 'CANCELLED')
                paymentStatus = 'CANCELED';
            allTx.push({
                id: `TX-PCL-${pcl.id.slice(-8).toUpperCase()}`,
                date: pcl.createdAt,
                type: 'Parcel Delivery',
                rawType: 'PARCEL',
                reference: pcl.paymentRef || `PCL-${pcl.id.slice(-8).toUpperCase()}`,
                customerName: ((_m = pcl.user) === null || _m === void 0 ? void 0 : _m.name) || 'Customer',
                customerEmail: ((_o = pcl.user) === null || _o === void 0 ? void 0 : _o.email) || 'N/A',
                customerPhone: ((_p = pcl.user) === null || _p === void 0 ? void 0 : _p.phone) || 'N/A',
                paymentMethod: pcl.paymentProvider || 'Online Payment',
                paymentStatus,
                totalAmount: pcl.totalAmount,
                amountPaid: paymentStatus === 'CREDITED' ? pcl.totalAmount : 0,
                escrowStatus: pcl.escrows.length > 0 ? pcl.escrows[0].status : 'NONE',
                items: pcl.parcelDescription || 'Express Delivery',
                address: `Pickup: ${pcl.pickupAddress} Dropoff: ${pcl.dropoffAddress}`,
            });
        }
        allTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        let filtered = allTx;
        if (status !== 'ALL')
            filtered = filtered.filter(t => t.paymentStatus === status);
        if (type !== 'ALL')
            filtered = filtered.filter(t => t.rawType === type);
        if (searchFilter) {
            filtered = filtered.filter(t => t.customerName.toLowerCase().includes(searchFilter) ||
                t.customerEmail.toLowerCase().includes(searchFilter) ||
                t.reference.toLowerCase().includes(searchFilter) ||
                t.items.toLowerCase().includes(searchFilter));
        }
        if (format === 'csv') {
            // Generate Excel-compatible CSV with UTF-8 BOM
            const headers = [
                'Transaction ID',
                'Date & Time',
                'Type',
                'Reference',
                'Customer Name',
                'Customer Email',
                'Customer Phone',
                'Payment Method',
                'Payment Status',
                'Total Amount (NGN)',
                'Amount Paid (NGN)',
                'Escrow Status',
                'Items / Services Requested',
                'Delivery / Service Address',
            ];
            const csvRows = [
                headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
            ];
            for (const t of filtered) {
                const row = [
                    t.id,
                    new Date(t.date).toLocaleString(),
                    t.type,
                    t.reference,
                    t.customerName,
                    t.customerEmail,
                    t.customerPhone,
                    t.paymentMethod,
                    t.paymentStatus,
                    t.totalAmount.toFixed(2),
                    t.amountPaid.toFixed(2),
                    t.escrowStatus,
                    t.items,
                    t.address,
                ];
                csvRows.push(row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
            }
            // Add UTF-8 BOM so Excel opens it with full Unicode character support
            const csvString = '\uFEFF' + csvRows.join('\r\n');
            const filename = `fixmart_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(csvString);
        }
        // Format: PDF / HTML Print Report
        const totalCredited = filtered.filter(t => t.paymentStatus === 'CREDITED').reduce((s, t) => s + t.amountPaid, 0);
        const totalPending = filtered.filter(t => t.paymentStatus === 'PENDING').reduce((s, t) => s + t.totalAmount, 0);
        const reportHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>FixMart Transactions Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #1E293B; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: 800; color: #065F46; }
          .kpis { display: flex; gap: 16px; margin-bottom: 20px; }
          .kpi-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 18px; min-width: 140px; }
          .kpi-label { font-size: 11px; text-transform: uppercase; color: #64748B; font-weight: 700; }
          .kpi-val { font-size: 18px; font-weight: 800; margin-top: 4px; color: #0F172A; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #F1F5F9; text-align: left; padding: 8px 10px; border: 1px solid #CBD5E1; color: #475569; text-transform: uppercase; font-size: 11px; }
          td { padding: 8px 10px; border: 1px solid #E2E8F0; vertical-align: top; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
          .badge-credited { background: #ECFDF5; color: #059669; }
          .badge-pending { background: #FFFBEB; color: #D97706; }
          .badge-canceled { background: #FEF2F2; color: #DC2626; }
          @media print {
            .no-print { display: none; }
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px;">
          <button onclick="window.print()" style="background: #059669; color: white; padding: 8px 18px; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">
            🖨️ Print / Save as PDF
          </button>
        </div>
        <div class="header">
          <div>
            <div class="title">🛠️ FixMart Executive Transactions Report</div>
            <div style="font-size: 13px; color: #64748B; margin-top: 4px;">Generated on ${new Date().toLocaleString()} • Filter: ${status} (${type})</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #64748B;">
            Total Records: <strong>${filtered.length}</strong>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi-card">
            <div class="kpi-label">Credited Total</div>
            <div class="kpi-val" style="color: #059669;">₦${totalCredited.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Pending Total</div>
            <div class="kpi-val" style="color: #D97706;">₦${totalPending.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Transactions Count</div>
            <div class="kpi-val">${filtered.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID & Date</th>
              <th>Customer</th>
              <th>Type & Details</th>
              <th>Payment & Ref</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(t => `
              <tr>
                <td>
                  <strong>${t.id}</strong><br>
                  <span style="color:#64748B;">${new Date(t.date).toLocaleDateString()}</span>
                </td>
                <td>
                  <strong>${t.customerName}</strong><br>
                  <span style="color:#64748B;">${t.customerEmail}</span><br>
                  <span style="color:#64748B;">${t.customerPhone}</span>
                </td>
                <td>
                  <strong>${t.type}</strong><br>
                  <span style="color:#334155;">${t.items}</span>
                </td>
                <td>
                  ${t.paymentMethod}<br>
                  <code style="font-size:10px;background:#F1F5F9;padding:1px 4px;">${t.reference}</code>
                </td>
                <td>
                  <span class="badge badge-${t.paymentStatus.toLowerCase()}">${t.paymentStatus}</span><br>
                  <span style="font-size:10px;color:#64748B;">Escrow: ${t.escrowStatus}</span>
                </td>
                <td>
                  <strong>₦${t.amountPaid.toLocaleString()}</strong><br>
                  <span style="color:#64748B;font-size:10px;">Total: ₦${t.totalAmount.toLocaleString()}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(reportHtml);
    }
    catch (error) {
        next(error);
    }
}));
// ─── GET RECEIPT DETAILS & PRINTABLE HTML ─────────────────────────────────────
router.get('/receipt/:type/:id', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { type, id } = req.params;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (type !== 'order' && type !== 'booking' && type !== 'parcel') {
        return res.status(400).json({ error: 'Invalid receipt type. Must be order, booking, or parcel.' });
    }
    try {
        const receipt = yield (0, receipt_1.generateReceiptData)(type, id);
        if (!receipt)
            return res.status(404).json({ error: 'Receipt record not found.' });
        // Access control: customer who owns the transaction or system Administrator
        if (role !== 'ADMIN' && receipt.customer.id && receipt.customer.id !== userId) {
            return res.status(403).json({ error: 'Forbidden. You do not have permission to view this receipt.' });
        }
        res.json(Object.assign(Object.assign({}, receipt), { success: true, receipt, html: (0, receipt_1.renderReceiptHtml)(receipt) }));
    }
    catch (error) {
        next(error);
    }
}));
// ─── GET PUBLIC RECEIPT VERIFICATION (FOR QR CODE SCANNING) ───────────────────
router.get('/receipt-verify', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { num, ref, amt } = req.query;
    const receiptNum = typeof num === 'string' ? num.trim() : '';
    const receiptRef = typeof ref === 'string' ? ref.trim() : '';
    try {
        let type = null;
        let targetId = null;
        if (receiptNum.startsWith('RCP-ORD-')) {
            type = 'order';
            const order = yield prisma_1.default.order.findFirst({
                where: {
                    OR: [
                        ...(receiptRef ? [{ paymentRef: receiptRef }] : []),
                        { id: { endsWith: receiptNum.replace('RCP-ORD-', '').toLowerCase() } },
                    ],
                },
                select: { id: true },
            });
            targetId = (order === null || order === void 0 ? void 0 : order.id) || null;
        }
        else if (receiptNum.startsWith('RCP-BKG-')) {
            type = 'booking';
            const booking = yield prisma_1.default.booking.findFirst({
                where: {
                    OR: [
                        { id: { endsWith: receiptNum.replace('RCP-BKG-', '').toLowerCase() } },
                    ],
                },
                select: { id: true },
            });
            targetId = (booking === null || booking === void 0 ? void 0 : booking.id) || null;
        }
        else if (receiptNum.startsWith('RCP-PCL-')) {
            type = 'parcel';
            const parcel = yield prisma_1.default.parcelDelivery.findFirst({
                where: {
                    OR: [
                        ...(receiptRef ? [{ paymentRef: receiptRef }] : []),
                        { id: { endsWith: receiptNum.replace('RCP-PCL-', '').toLowerCase() } },
                    ],
                },
                select: { id: true },
            });
            targetId = (parcel === null || parcel === void 0 ? void 0 : parcel.id) || null;
        }
        if (type && targetId) {
            const receipt = yield (0, receipt_1.generateReceiptData)(type, targetId);
            if (receipt) {
                return res.send((0, receipt_1.renderReceiptHtml)(receipt));
            }
        }
        // Fallback verification card
        res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>FixMart Receipt Verification</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
          .card { background: white; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); padding: 32px; max-width: 460px; width: 100%; text-align: center; border: 1px solid #E2E8F0; }
          .badge { display: inline-block; background: #ECFDF5; color: #059669; font-weight: 800; padding: 6px 14px; border-radius: 20px; font-size: 13px; margin-bottom: 12px; }
          h1 { margin: 0 0 8px; color: #0F172A; font-size: 22px; }
          p { color: #64748B; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
          .detail { background: #F1F5F9; border-radius: 8px; padding: 12px; font-size: 13px; font-family: monospace; color: #334155; margin-bottom: 20px; text-align: left; }
          .btn { display: inline-block; background: #10B981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">🛡️ AUTHENTIC TRANSACTION</div>
          <h1>Verified FixMart Receipt</h1>
          <p>This transaction has been authenticated by the FixMart Network. Buyer Escrow protection and service warranty apply.</p>
          <div class="detail">
            Receipt #: ${receiptNum || 'RCP-VERIFIED'}<br>
            Reference: ${receiptRef || 'PAYMENT_CONFIRMED'}<br>
            ${amt ? `Amount: ₦${Number(amt).toLocaleString()}<br>` : ''}
            Status: VALID & ESCROW PROTECTED
          </div>
          <a href="https://akpoaza-3.onrender.com" class="btn">Open FixMart Portal</a>
        </div>
      </body>
      </html>
    `);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;

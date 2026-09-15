/**
 * receipt.ts — Unified receipt generation and dispatch service for FixMart
 * 
 * Supports:
 *  - Product Orders (Order with OrderItems)
 *  - Handyman Services (Booking with Service)
 *  - Parcel Deliveries (ParcelDelivery)
 *  - Pay-on-Delivery (POD) Orders
 */

import prisma from './prisma';
import { sendNotification } from './notify';

export interface ReceiptItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ReceiptData {
  receiptNumber: string;
  type: 'order' | 'booking' | 'parcel';
  typeLabel: string;
  recordId: string;
  createdAt: Date;
  paidAt: Date;
  status: 'PAID' | 'DUE_ON_DELIVERY' | 'ESCROW_HELD' | 'PENDING';
  statusLabel: string;
  paymentMethod: string;
  reference: string;
  currency: string;
  customer: {
    id?: string;
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
  };
  items: ReceiptItem[];
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  isSplitPayment: boolean;
  notes?: string;
  assignedProvider?: {
    name: string;
    phone?: string | null;
    role: 'RIDER' | 'HANDYMAN';
  } | null;
}

/**
 * Generate structured receipt data for any transaction
 */
export async function generateReceiptData(
  type: 'order' | 'booking' | 'parcel',
  id: string
): Promise<ReceiptData | null> {
  try {
    if (type === 'order') {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { product: true },
          },
          user: true,
          rider: true,
        },
      });

      if (!order) return null;

      const isPOD = order.paymentProvider === 'NONE' && (!order.paymentRef || order.paymentRef.startsWith('POD_'));
      const isPaid = order.status === 'PAID' || order.status === 'DELIVERED' || order.status === 'SHIPPED';
      const items: ReceiptItem[] = order.items.map((item) => ({
        name: item.product.name,
        description: item.product.category || undefined,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
      }));

      const subtotal = items.reduce((acc, i) => acc + i.subtotal, 0);
      const deliveryFee = Math.max(0, order.totalAmount - subtotal);
      const receiptNumber = `RCP-ORD-${order.id.slice(-6).toUpperCase()}`;

      let paymentMethod = 'FixMart Payment Gateway';
      if (order.paymentRef?.startsWith('WALLET_')) paymentMethod = 'FixMart Virtual Wallet';
      else if (order.paymentRef?.startsWith('POD_') || isPOD) paymentMethod = 'Cash / Transfer on Delivery (POD)';
      else if (order.paymentProvider === 'PAYSTACK') paymentMethod = 'Paystack (Cards / Bank / USSD)';
      else if (order.paymentProvider === 'FLUTTERWAVE') paymentMethod = 'Flutterwave';
      else if (order.paymentProvider === 'STRIPE') paymentMethod = 'Stripe (Credit / Debit Card)';
      else if (order.paymentProvider === 'OPAY') paymentMethod = 'OPay';

      const status = isPaid ? 'PAID' : isPOD ? 'DUE_ON_DELIVERY' : 'PENDING';
      const statusLabel = isPaid ? 'Payment Confirmed' : isPOD ? 'Pay on Delivery' : 'Payment Pending';

      return {
        receiptNumber,
        type: 'order',
        typeLabel: 'Product Purchase',
        recordId: order.id,
        createdAt: order.createdAt,
        paidAt: order.updatedAt,
        status,
        statusLabel,
        paymentMethod,
        reference: order.paymentRef || `ORD-${order.id.slice(-8).toUpperCase()}`,
        currency: order.currency || 'NGN',
        customer: {
          id: order.user.id,
          name: order.user.name,
          email: order.user.email,
          phone: order.user.phone,
          address: order.deliveryAddress || order.user.address,
        },
        items,
        subtotal,
        deliveryFee,
        totalAmount: order.totalAmount,
        amountPaid: order.amountPaid || (isPaid ? order.totalAmount : 0),
        balanceDue: Math.max(0, order.totalAmount - (order.amountPaid || (isPaid ? order.totalAmount : 0))),
        isSplitPayment: order.isSplitPayment,
        notes: 'Your product will be delivered within a few hours. A rider will call you to confirm your location.',
        assignedProvider: order.rider
          ? {
              name: order.rider.name,
              phone: order.rider.phone,
              role: 'RIDER',
            }
          : null,
      };
    } else if (type === 'booking') {
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: {
          service: true,
          customer: true,
          handyman: true,
        },
      });

      if (!booking) return null;

      const isPaid = booking.status === 'ACCEPTED' || booking.status === 'COMPLETED' || booking.amountPaid > 0;
      const receiptNumber = `RCP-BKG-${booking.id.slice(-6).toUpperCase()}`;

      const items: ReceiptItem[] = [
        {
          name: booking.service.name,
          description: booking.service.description || 'Professional Handyman Service',
          quantity: 1,
          unitPrice: booking.totalPrice,
          subtotal: booking.totalPrice,
        },
      ];

      return {
        receiptNumber,
        type: 'booking',
        typeLabel: 'Handyman Service Booking',
        recordId: booking.id,
        createdAt: booking.createdAt,
        paidAt: booking.updatedAt,
        status: isPaid ? 'ESCROW_HELD' : 'PENDING',
        statusLabel: isPaid ? 'Secured in FixMart Escrow' : 'Payment Pending',
        paymentMethod: 'FixMart Escrow Payment',
        reference: `BKG-${booking.id.slice(-8).toUpperCase()}`,
        currency: booking.currency || 'NGN',
        customer: {
          id: booking.customer.id,
          name: booking.customer.name,
          email: booking.customer.email,
          phone: booking.customer.phone,
          address: booking.address || booking.customer.address,
        },
        items,
        subtotal: booking.totalPrice,
        deliveryFee: 0,
        totalAmount: booking.totalPrice,
        amountPaid: booking.amountPaid || (isPaid ? booking.totalPrice : 0),
        balanceDue: Math.max(0, booking.totalPrice - (booking.amountPaid || (isPaid ? booking.totalPrice : 0))),
        isSplitPayment: booking.isSplitPayment,
        notes: `Appointment scheduled for ${new Date(booking.scheduledAt).toLocaleString()}. Funds are securely protected in FixMart Escrow until completion.`,
        assignedProvider: booking.handyman
          ? {
              name: booking.handyman.name,
              phone: booking.handyman.phone,
              role: 'HANDYMAN',
            }
          : null,
      };
    } else if (type === 'parcel') {
      const parcel = await prisma.parcelDelivery.findUnique({
        where: { id },
        include: {
          user: true,
          rider: true,
        },
      });

      if (!parcel) return null;

      const isPaid = parcel.status === 'PAID' || parcel.status === 'DELIVERED' || parcel.status === 'SHIPPED';
      const receiptNumber = `RCP-PCL-${parcel.id.slice(-6).toUpperCase()}`;

      const items: ReceiptItem[] = [
        {
          name: 'Direct Point-to-Point Parcel Dispatch',
          description: parcel.parcelDescription || 'Delivery Package',
          quantity: 1,
          unitPrice: parcel.totalAmount,
          subtotal: parcel.totalAmount,
        },
      ];

      return {
        receiptNumber,
        type: 'parcel',
        typeLabel: 'Express Parcel Delivery',
        recordId: parcel.id,
        createdAt: parcel.createdAt,
        paidAt: parcel.updatedAt,
        status: isPaid ? 'PAID' : 'PENDING',
        statusLabel: isPaid ? 'Paid & Dispatched' : 'Payment Pending',
        paymentMethod: parcel.paymentProvider || 'Online Payment',
        reference: parcel.paymentRef || `PCL-${parcel.id.slice(-8).toUpperCase()}`,
        currency: parcel.currency || 'NGN',
        customer: {
          id: parcel.user.id,
          name: parcel.user.name,
          email: parcel.user.email,
          phone: parcel.user.phone,
          address: `Pickup: ${parcel.pickupAddress} ➔ Dropoff: ${parcel.dropoffAddress}`,
        },
        items,
        subtotal: parcel.totalAmount,
        deliveryFee: 0,
        totalAmount: parcel.totalAmount,
        amountPaid: isPaid ? parcel.totalAmount : 0,
        balanceDue: isPaid ? 0 : parcel.totalAmount,
        isSplitPayment: false,
        notes: 'A dispatch rider will call you to confirm your parcel pickup and delivery route.',
        assignedProvider: parcel.rider
          ? {
              name: parcel.rider.name,
              phone: parcel.rider.phone,
              role: 'RIDER',
            }
          : null,
      };
    }
  } catch (error) {
    console.error(`[Receipt] Failed to generate receipt data for ${type} ${id}:`, error);
  }
  return null;
}

/**
 * Render an executive, high-converting HTML receipt template
 */
export function renderReceiptHtml(data: ReceiptData): string {
  const currencySymbol = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : data.currency === 'GBP' ? '£' : '₦';
  const statusColor = data.status === 'PAID' ? '#10B981' : data.status === 'ESCROW_HELD' ? '#3B82F6' : data.status === 'DUE_ON_DELIVERY' ? '#F59E0B' : '#6B7280';
  const statusBg = data.status === 'PAID' ? '#ECFDF5' : data.status === 'ESCROW_HELD' ? '#EFF6FF' : data.status === 'DUE_ON_DELIVERY' ? '#FFFBEB' : '#F3F4F6';

  const rows = data.items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 12px 14px; text-align: left; color: #111827; font-size: 14px;">
          <strong>${item.name}</strong>
          ${item.description ? `<br><span style="font-size: 12px; color: #6B7280;">${item.description}</span>` : ''}
        </td>
        <td style="padding: 12px 14px; text-align: center; color: #374151; font-size: 14px;">
          ${item.quantity}
        </td>
        <td style="padding: 12px 14px; text-align: right; color: #374151; font-size: 14px;">
          ${currencySymbol}${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="padding: 12px 14px; text-align: right; color: #111827; font-size: 14px; font-weight: 600;">
          ${currencySymbol}${item.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `
    )
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Receipt ${data.receiptNumber}</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #1E293B;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 30px 10px; background-color: #F8FAFC;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #E2E8F0;">
            <!-- Header with FixMart Gradient -->
            <tr>
              <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 32px; color: #FFFFFF;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <div style="font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">🛠️ FixMart</div>
                      <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">Smart Repairs, Verified Artisans & Genuine Tools</div>
                    </td>
                    <td align="right">
                      <div style="background: rgba(255,255,255,0.2); display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                        Official Receipt
                      </div>
                      <div style="font-size: 14px; font-weight: 700; margin-top: 6px;"># ${data.receiptNumber}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Status Banner -->
            <tr>
              <td style="padding: 20px 32px 10px; background-color: #FFFFFF;">
                <div style="background-color: ${statusBg}; border: 1px solid ${statusColor}40; border-left: 4px solid ${statusColor}; border-radius: 8px; padding: 14px 18px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <span style="font-size: 15px; font-weight: 800; color: ${statusColor};">${data.statusLabel}</span>
                        <div style="font-size: 13px; color: #475569; margin-top: 3px;">
                          ${data.notes || 'Transaction verified and processed successfully.'}
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>

            <!-- Customer & Transaction Details Grid -->
            <tr>
              <td style="padding: 16px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" valign="top" style="padding-right: 15px;">
                      <div style="font-size: 11px; text-transform: uppercase; color: #94A3B8; font-weight: 700; margin-bottom: 6px;">Billed To</div>
                      <div style="font-size: 15px; font-weight: 700; color: #0F172A;">${data.customer.name}</div>
                      <div style="font-size: 13px; color: #475569; margin-top: 2px;">${data.customer.email}</div>
                      ${data.customer.phone ? `<div style="font-size: 13px; color: #475569;">${data.customer.phone}</div>` : ''}
                      ${data.customer.address ? `<div style="font-size: 13px; color: #475569; margin-top: 4px;"><strong>Location:</strong> ${data.customer.address}</div>` : ''}
                    </td>
                    <td width="50%" valign="top" style="padding-left: 15px; border-left: 1px solid #F1F5F9;">
                      <div style="font-size: 11px; text-transform: uppercase; color: #94A3B8; font-weight: 700; margin-bottom: 6px;">Payment Summary</div>
                      <div style="font-size: 13px; color: #475569; margin-bottom: 4px;"><strong>Date:</strong> ${new Date(data.paidAt).toLocaleString()}</div>
                      <div style="font-size: 13px; color: #475569; margin-bottom: 4px;"><strong>Method:</strong> ${data.paymentMethod}</div>
                      <div style="font-size: 13px; color: #475569; margin-bottom: 4px;"><strong>Reference:</strong> <code style="background:#F1F5F9;padding:2px 6px;border-radius:4px;font-size:12px;">${data.reference}</code></div>
                      ${data.assignedProvider ? `<div style="font-size: 13px; color: #065F46; margin-top: 4px; font-weight: 600;">Assigned ${data.assignedProvider.role === 'RIDER' ? 'Rider' : 'Artisan'}: ${data.assignedProvider.name} ${data.assignedProvider.phone ? `(${data.assignedProvider.phone})` : ''}</div>` : ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Line Items Table -->
            <tr>
              <td style="padding: 10px 32px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden;">
                  <thead>
                    <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                      <th style="padding: 10px 14px; text-align: left; font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 700;">Service / Product</th>
                      <th style="padding: 10px 14px; text-align: center; font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 700; width: 60px;">Qty</th>
                      <th style="padding: 10px 14px; text-align: right; font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 700; width: 100px;">Price</th>
                      <th style="padding: 10px 14px; text-align: right; font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 700; width: 110px;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              </td>
            </tr>

            <!-- Financial Totals -->
            <tr>
              <td style="padding: 0 32px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="55%"></td>
                    <td width="45%">
                      <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 14px; color: #475569;">
                        <tr>
                          <td>Subtotal:</td>
                          <td align="right" style="font-weight: 600; color: #1E293B;">${currencySymbol}${data.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        ${
                          data.deliveryFee > 0
                            ? `
                        <tr>
                          <td>Delivery & Logistics:</td>
                          <td align="right" style="font-weight: 600; color: #1E293B;">${currencySymbol}${data.deliveryFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>`
                            : ''
                        }
                        <tr style="border-top: 1px solid #CBD5E1; font-size: 16px;">
                          <td style="padding-top: 8px;"><strong>Total Amount:</strong></td>
                          <td align="right" style="padding-top: 8px; font-weight: 800; color: #0F172A;">${currencySymbol}${data.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        <tr style="font-size: 16px; color: #059669;">
                          <td style="padding-top: 4px;"><strong>Amount Paid:</strong></td>
                          <td align="right" style="padding-top: 4px; font-weight: 800;">${currencySymbol}${data.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        ${
                          data.balanceDue > 0
                            ? `
                        <tr style="font-size: 14px; color: #DC2626;">
                          <td>Remaining Balance:</td>
                          <td align="right" style="font-weight: 700;">${currencySymbol}${data.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>`
                            : ''
                        }
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- FixMart Trust & Security Badge -->
            <tr>
              <td style="padding: 0 32px 30px;">
                <div style="background-color: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 14px 18px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.6;">
                  🛡️ <strong>FixMart Buyer & Service Guarantee:</strong> Payments for services remain safely guarded in FixMart Escrow until completion. All genuine tools and products are covered by our replacement policy. For assistance or inquiries, reach out to our 24/7 support.
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color: #F1F5F9; padding: 20px 32px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
                FixMart Multi-Service Marketplace • All rights reserved • © ${new Date().getFullYear()} FixMart Inc.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

/**
 * Generate plain text receipt for SMS or fallback
 */
export function renderReceiptText(data: ReceiptData): string {
  const currencySymbol = data.currency === 'USD' ? '$' : '₦';
  const itemLines = data.items.map((i) => `${i.quantity}x ${i.name} - ${currencySymbol}${i.subtotal.toLocaleString()}`).join('\n');

  return `[FixMart Official Receipt #${data.receiptNumber}]
Date: ${new Date(data.paidAt).toLocaleString()}
Billed to: ${data.customer.name} (${data.customer.email})
Status: ${data.statusLabel}
Payment Method: ${data.paymentMethod}
Reference: ${data.reference}

Items Requested:
${itemLines}

Subtotal: ${currencySymbol}${data.subtotal.toLocaleString()}
Total Amount: ${currencySymbol}${data.totalAmount.toLocaleString()}
Amount Paid: ${currencySymbol}${data.amountPaid.toLocaleString()}
${data.balanceDue > 0 ? `Balance Due: ${currencySymbol}${data.balanceDue.toLocaleString()}\n` : ''}
${data.notes || ''}

Thank you for choosing FixMart!`;
}

/**
 * Dispatches the receipt notification in-app, via email, and notifies admins
 */
export async function dispatchReceiptNotification(
  type: 'order' | 'booking' | 'parcel',
  id: string,
  customTitle?: string
): Promise<{ success: boolean; receipt?: ReceiptData }> {
  const receipt = await generateReceiptData(type, id);
  if (!receipt) {
    console.error(`[Receipt] Could not dispatch receipt: record not found for ${type} ${id}`);
    return { success: false };
  }

  const currencySymbol = receipt.currency === 'USD' ? '$' : '₦';
  const title = customTitle || `🧾 Payment Receipt #${receipt.receiptNumber} — ${currencySymbol}${receipt.amountPaid.toLocaleString()}`;
  const plainText = renderReceiptText(receipt);
  const emailHtml = renderReceiptHtml(receipt);

  // 1. Dispatch Customer In-App Notification and Email
  if (receipt.customer.id) {
    await sendNotification({
      userId: receipt.customer.id,
      title,
      body: `Your payment of ${currencySymbol}${receipt.amountPaid.toLocaleString()} was confirmed. Tap to view your itemized receipt and delivery details.`,
      type: 'PAYMENT',
      referenceId: id,
      email: receipt.customer.email,
      phone: receipt.customer.phone || undefined,
      emailSubject: `🧾 FixMart Receipt: #${receipt.receiptNumber} (${receipt.statusLabel})`,
      emailHtml,
    }).catch((err) => console.error('[Receipt] Customer receipt dispatch failed:', err));
  }

  // 2. Dispatch Admin Alert
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true },
  });

  for (const admin of admins) {
    sendNotification({
      userId: admin.id,
      title: `💰 Transaction Receipt #${receipt.receiptNumber}: ${currencySymbol}${receipt.amountPaid.toLocaleString()}`,
      body: `Payment verified for ${receipt.typeLabel} (${receipt.customer.name}). Ref: ${receipt.reference}.`,
      type: 'PAYMENT',
      referenceId: id,
      email: admin.email,
      emailSubject: `💰 [Admin Alert] Transaction Receipt #${receipt.receiptNumber} (${receipt.typeLabel})`,
      emailHtml,
    }).catch(() => {});
  }

  return { success: true, receipt };
}

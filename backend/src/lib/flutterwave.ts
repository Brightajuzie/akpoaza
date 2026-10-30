import axios from 'axios';
import crypto from 'crypto';
import prisma from './prisma';

export const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

export interface FlutterwaveBank {
  id: number | string;
  code: string;
  name: string;
}

// Fallback list of top Nigerian Commercial Banks, Microfinance Banks, and Digital Banks
// Guaranteed to be available even if Flutterwave API is temporarily unreachable or running in mock mode.
export const NIGERIAN_BANKS_FALLBACK: FlutterwaveBank[] = [
  { id: 1, code: '044', name: 'Access Bank' },
  { id: 2, code: '023', name: 'Citibank Nigeria' },
  { id: 3, code: '050', name: 'Ecobank Nigeria' },
  { id: 4, code: '070', name: 'Fidelity Bank' },
  { id: 5, code: '011', name: 'First Bank of Nigeria' },
  { id: 6, code: '214', name: 'First City Monument Bank (FCMB)' },
  { id: 7, code: '058', name: 'Guaranty Trust Bank (GTBank)' },
  { id: 8, code: '030', name: 'Heritage Bank' },
  { id: 9, code: '301', name: 'Jaiz Bank' },
  { id: 10, code: '082', name: 'Keystone Bank' },
  { id: 11, code: '50211', name: 'Kuda Bank' },
  { id: 12, code: '50515', name: 'Moniepoint Microfinance Bank' },
  { id: 13, code: '999992', name: 'OPay Digital Services (Paycom)' },
  { id: 14, code: '999991', name: 'PalmPay' },
  { id: 15, code: '526', name: 'Parallex Bank' },
  { id: 16, code: '076', name: 'Polaris Bank' },
  { id: 17, code: '101', name: 'Providus Bank' },
  { id: 18, code: '221', name: 'Stanbic IBTC Bank' },
  { id: 19, code: '068', name: 'Standard Chartered Bank' },
  { id: 20, code: '232', name: 'Sterling Bank' },
  { id: 21, code: '100', name: 'Suntrust Bank' },
  { id: 22, code: '032', name: 'Union Bank of Nigeria' },
  { id: 23, code: '033', name: 'United Bank for Africa (UBA)' },
  { id: 24, code: '215', name: 'Unity Bank' },
  { id: 25, code: '035', name: 'Wema Bank' },
  { id: 26, code: '057', name: 'Zenith Bank' },
  { id: 27, code: '566', name: 'VFD Microfinance Bank' },
  { id: 28, code: '090251', name: 'Carbon' },
  { id: 29, code: '090328', name: 'FairMoney Microfinance Bank' },
  { id: 30, code: '100033', name: 'PalmPay Limited' },
  { id: 31, code: '100004', name: 'OPay / Paycom' },
  { id: 32, code: '090267', name: 'Kuda Microfinance Bank' },
  { id: 33, code: '090405', name: 'Moniepoint MFB' },
  { id: 34, code: '302', name: 'TAJ Bank' },
  { id: 35, code: '102', name: 'Titan Trust Bank' },
  { id: 36, code: '103', name: 'Globus Bank' },
  { id: 37, code: '000027', name: 'Optimus Bank' },
  { id: 38, code: '104', name: 'Signature Bank' },
  { id: 39, code: '105', name: 'Premium Trust Bank' },
  { id: 40, code: '565', name: 'One Finance' },
  { id: 41, code: '090175', name: 'Rubies MFB' },
  { id: 42, code: '090325', name: 'Sparkle Microfinance Bank' },
  { id: 43, code: '090495', name: 'Raven Bank' },
  { id: 44, code: '090408', name: 'Gomoney' },
  { id: 45, code: '090270', name: 'AB Microfinance Bank' },
];

/**
 * Checks if a given Flutterwave key is a dummy/mock/placeholder key or invalid.
 * Valid live Flutterwave secret keys start with 'FLWSECK-'
 * Valid test Flutterwave secret keys start with 'FLWSECK_TEST-'
 * Keys like 'V4dotSws...' are Flutterwave Encryption Keys (not secret keys)
 * and cannot be used as Bearer tokens against the v3 API.
 */
export function isDummyFlutterwaveKey(key: string | undefined | null): boolean {
  if (!key) return true;
  const trimmed = key.trim();
  if (!trimmed) return true;
  if (trimmed.includes('dummy') || trimmed === 'FLWSECK_TEST-dummy') return true;
  if (!trimmed.startsWith('FLWSECK-') && !trimmed.startsWith('FLWSECK_TEST-')) {
    return true; // Not a valid v3 Secret Key
  }
  return false;
}

/**
 * Retrieve active Flutterwave secret key from database settings or process.env
 */
export async function getActiveFlutterwaveKey(): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: 'flutterwave_secret_key' },
    });
    if (setting?.value && setting.value.trim().length > 0) {
      return setting.value.trim();
    }
  } catch (err) {
    // Database query failed, fall through to process.env
  }

  return (process.env.FLUTTERWAVE_SECRET_KEY || '').trim();
}

/**
 * Retrieve active Flutterwave webhook secret / secret hash
 */
export async function getActiveFlutterwaveWebhookSecret(): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: 'flutterwave_webhook_secret' },
    });
    if (setting?.value && setting.value.trim().length > 0) {
      return setting.value.trim();
    }
  } catch (err) {}

  return (
    process.env.FLUTTERWAVE_WEBHOOK_SECRET ||
    process.env.FLUTTERWAVE_SECRET_HASH ||
    ''
  ).trim();
}

// In-memory cache for bank list (24 hours TTL)
let cachedBanks: FlutterwaveBank[] | null = null;
let cacheExpiry = 0;

/**
 * Fetches all supported banks in Nigeria from Flutterwave API with local fallback.
 */
export async function getNigerianBanks(): Promise<FlutterwaveBank[]> {
  const now = Date.now();
  if (cachedBanks && cacheExpiry > now) {
    return cachedBanks;
  }

  const key = await getActiveFlutterwaveKey();
  if (!isDummyFlutterwaveKey(key)) {
    try {
      const response = await axios.get(`${FLUTTERWAVE_BASE_URL}/banks/NG`, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });

      if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
        const banks: FlutterwaveBank[] = response.data.data.map((b: any) => ({
          id: b.id,
          code: String(b.code),
          name: String(b.name).trim(),
        }));

        // Sort alphabetically by name
        banks.sort((a, b) => a.name.localeCompare(b.name));

        cachedBanks = banks;
        cacheExpiry = now + 24 * 60 * 60 * 1000; // 24 hours
        return banks;
      }
    } catch (err: any) {
      console.warn('[Flutterwave] Failed to fetch live banks from API, using fallback list:', err?.message || err);
    }
  }

  // Fallback to pre-configured list
  const sortedFallback = [...NIGERIAN_BANKS_FALLBACK].sort((a, b) => a.name.localeCompare(b.name));
  cachedBanks = sortedFallback;
  cacheExpiry = now + 60 * 60 * 1000; // 1 hour
  return sortedFallback;
}

/**
 * Validates and resolves a 10-digit NUBAN bank account number into the beneficiary's registered name.
 */
export async function resolveBankAccount(accountNumber: string, bankCode: string): Promise<{
  success: boolean;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  isMock?: boolean;
}> {
  const cleanAccount = String(accountNumber || '').trim();
  const cleanBankCode = String(bankCode || '').trim();

  if (!cleanAccount || cleanAccount.length !== 10 || !/^\d{10}$/.test(cleanAccount)) {
    throw new Error('A valid 10-digit NUBAN account number is required.');
  }
  if (!cleanBankCode) {
    throw new Error('Bank selection is required.');
  }

  const key = await getActiveFlutterwaveKey();

  if (!isDummyFlutterwaveKey(key)) {
    try {
      const response = await axios.post(
        `${FLUTTERWAVE_BASE_URL}/accounts/resolve`,
        {
          account_number: cleanAccount,
          account_bank: cleanBankCode,
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        }
      );

      if (response.data && response.data.status === 'success' && response.data.data?.account_name) {
        return {
          success: true,
          accountName: response.data.data.account_name,
          accountNumber: cleanAccount,
          bankCode: cleanBankCode,
          isMock: false,
        };
      }
      throw new Error(response.data?.message || 'Could not verify account name with bank.');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Account resolution failed';
      throw new Error(msg);
    }
  }

  // In sandbox / mock mode, generate a verified placeholder name for test accounts
  const bank = NIGERIAN_BANKS_FALLBACK.find(b => b.code === cleanBankCode);
  const mockNames: Record<string, string> = {
    '044': 'ACCESS BANK TEST USER',
    '058': 'GTBANK VERIFIED USER',
    '057': 'ZENITH BANK ACCOUNT HOLDER',
    '011': 'FIRST BANK BENEFICIARY',
    '033': 'UBA TEST RECIPIENT',
    '50211': 'KUDA MICROFINANCE TEST USER',
    '999992': 'OPAY VERIFIED MERCHANT',
    '999991': 'PALMPAY RECIPIENT',
    '50515': 'MONIEPOINT AGENT ACCOUNT',
  };

  const defaultMock = `VERIFIED ACCOUNT (${bank?.name || 'BANK'} - ${cleanAccount.slice(-4)})`;
  const resolvedName = mockNames[cleanBankCode] || defaultMock;

  return {
    success: true,
    accountName: resolvedName,
    accountNumber: cleanAccount,
    bankCode: cleanBankCode,
    isMock: true,
  };
}

/**
 * Dispatches a bank transfer payout via Flutterwave Transfers API.
 */
export async function initiateBankTransfer(params: {
  bankCode: string;
  accountNumber: string;
  amount: number;
  narration?: string;
  reference: string;
  callbackUrl?: string;
}): Promise<{
  success: boolean;
  transferId: string | number;
  reference: string;
  status: string;
  message: string;
  isMock: boolean;
  raw?: any;
}> {
  const { bankCode, accountNumber, amount, narration, reference, callbackUrl } = params;
  const key = await getActiveFlutterwaveKey();

  if (isDummyFlutterwaveKey(key)) {
    console.log(`[Flutterwave Mock Payout] Simulated bank transfer of ₦${amount} to ${bankCode}/${accountNumber} (Ref: ${reference})`);
    return {
      success: true,
      transferId: `MOCK_TRF_${Date.now()}`,
      reference,
      status: 'SUCCESSFUL',
      message: 'Sandbox transfer simulated successfully.',
      isMock: true,
    };
  }

  try {
    const payload: any = {
      account_bank: bankCode,
      account_number: accountNumber,
      amount: Math.round(amount * 100) / 100,
      narration: narration || `FixMart Wallet Payout ${reference}`,
      currency: 'NGN',
      reference,
      debit_currency: 'NGN',
    };

    if (callbackUrl) {
      payload.callback_url = callbackUrl;
    }

    const response = await axios.post(
      `${FLUTTERWAVE_BASE_URL}/transfers`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    if (response.data && response.data.status === 'success') {
      const data = response.data.data;
      return {
        success: true,
        transferId: data?.id || reference,
        reference: data?.reference || reference,
        status: data?.status || 'PENDING',
        message: response.data.message || 'Transfer queued successfully.',
        isMock: false,
        raw: data,
      };
    }

    throw new Error(response.data?.message || 'Flutterwave transfer rejected.');
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message || 'Bank transfer failed';
    console.error('[Flutterwave Transfer Error]:', msg, err.response?.data || '');
    throw new Error(msg);
  }
}

/**
 * Verifies any Flutterwave transaction using either numeric transaction ID or merchant tx_ref string.
 */
export async function verifyFlutterwaveTransaction(refOrId: string | number): Promise<{
  successful: boolean;
  status: string;
  amount: number;
  currency: string;
  txRef: string;
  flwId: number | string;
  meta: any;
  customer: any;
  raw: any;
}> {
  const key = await getActiveFlutterwaveKey();
  const stringId = String(refOrId).trim();

  if (isDummyFlutterwaveKey(key)) {
    return {
      successful: true,
      status: 'successful',
      amount: 0,
      currency: 'NGN',
      txRef: stringId,
      flwId: stringId,
      meta: {},
      customer: {},
      raw: { mock: true },
    };
  }

  const isNumericId = /^\d+$/.test(stringId);
  const url = isNumericId
    ? `${FLUTTERWAVE_BASE_URL}/transactions/${encodeURIComponent(stringId)}/verify`
    : `${FLUTTERWAVE_BASE_URL}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(stringId)}`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${key}` },
    timeout: 12000,
  });

  const data = response.data?.data;
  const status = (data?.status || '').toLowerCase();
  const successful = status === 'successful' || status === 'success';

  return {
    successful,
    status,
    amount: data?.amount || 0,
    currency: data?.currency || 'NGN',
    txRef: data?.tx_ref || stringId,
    flwId: data?.id || stringId,
    meta: data?.meta || {},
    customer: data?.customer || {},
    raw: data,
  };
}

import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error caught by handler:', err);

  // Prisma unique constraint validation or not found error codes
  if (err.code === 'P2002') {
    return res.status(400).json({
      error: `Unique constraint failed on field: ${err.meta?.target || 'unknown'}`,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: err.meta?.cause || 'Record not found in database',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Authentication token expired.' });
  }

  // ─── Axios errors from backend → external API calls (Paystack, Flutterwave, Dojah, etc.) ───
  // AxiosError objects carry the HTTP status on err.response.status, NOT on err.status.
  // Without this block every failed external API call would surface as a generic 500.
  if (err.isAxiosError || err.name === 'AxiosError') {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'External payment/verification service timed out. Please try again.',
      });
    }

    if (err.response) {
      // The external service replied with an error status
      const upstreamStatus = err.response.status;
      const upstreamData   = err.response.data;

      // Expose the provider error message if available; otherwise fall back to a generic one.
      const providerMessage =
        upstreamData?.message ||
        upstreamData?.error   ||
        upstreamData?.data?.message ||
        `External service error (HTTP ${upstreamStatus})`;

      // Map common upstream 4xx → meaningful status codes for the client
      const clientStatus =
        upstreamStatus === 401 || upstreamStatus === 403 ? 502   // bad gateway / invalid API key
        : upstreamStatus >= 400 && upstreamStatus < 500 ? 422   // unprocessable upstream input
        : 502;

      console.error(`[errorHandler] Upstream ${upstreamStatus}:`, upstreamData);

      return res.status(clientStatus).json({ error: providerMessage });
    }

    // Network-level failure (no response received)
    return res.status(503).json({
      error: 'Could not reach external service. Check your network and API credentials.',
    });
  }

  // Generic / unknown errors
  const status  = err.status  || 500;
  const message = err.message || 'An unexpected error occurred on the server.';

  res.status(status).json({ error: message });
};

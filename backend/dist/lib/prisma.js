"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
/**
 * Singleton PrismaClient shared across all route modules so that only
 * ONE connection pool is created for the entire process.
 *
 * connection_limit=1 is required when the DATABASE_URL points at Supabase's
 * PgBouncer in *transaction* mode (port 6543, pgbouncer=true).
 * PgBouncer already multiplexes connections; Prisma must not try to maintain
 * its own pool on top, or it will saturate the allowance and throw P2024.
 *
 * pool_timeout=20 gives Prisma 20 s to acquire a slot before giving up,
 * which avoids spurious failures during momentary traffic spikes.
 */
const DATABASE_URL = (_a = process.env.DATABASE_URL) !== null && _a !== void 0 ? _a : '';
// Inject connection_limit and pool_timeout into the URL so this file is
// self-contained even if the .env value is missing those parameters.
function buildDatasourceUrl(url) {
    try {
        const parsed = new URL(url);
        if (!parsed.searchParams.has('connection_limit')) {
            parsed.searchParams.set('connection_limit', '1');
        }
        if (!parsed.searchParams.has('pool_timeout')) {
            parsed.searchParams.set('pool_timeout', '20');
        }
        return parsed.toString();
    }
    catch (_a) {
        // If the URL is malformed, fall back to the raw value and let Prisma
        // surface a clear error rather than crashing here.
        return url;
    }
}
const prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: buildDatasourceUrl(DATABASE_URL),
        },
    },
});
console.log('[Prisma] Client initialised with connection_limit=1 (PgBouncer transaction-mode compatible).');
exports.default = prisma;

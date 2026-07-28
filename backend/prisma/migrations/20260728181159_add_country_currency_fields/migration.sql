-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "ParcelDelivery" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "country" TEXT DEFAULT 'United States',
ADD COLUMN     "currency" TEXT DEFAULT 'USD';

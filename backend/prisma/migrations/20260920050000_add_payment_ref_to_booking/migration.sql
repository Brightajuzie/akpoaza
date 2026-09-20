-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "paymentRef" TEXT;

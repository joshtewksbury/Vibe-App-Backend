-- AlterTable
ALTER TABLE "venues" ADD COLUMN "popularTimes" JSONB,
ADD COLUMN "popularTimesUpdated" TIMESTAMP(3);

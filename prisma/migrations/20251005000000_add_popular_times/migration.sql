-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "popularTimes" JSONB,
ADD COLUMN "popularTimesUpdated" TIMESTAMP(3);

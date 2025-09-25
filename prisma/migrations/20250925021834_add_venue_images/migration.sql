-- CreateEnum
CREATE TYPE "public"."VenueImageType" AS ENUM ('ICON', 'BANNER', 'GALLERY', 'MENU', 'INTERIOR', 'EXTERIOR', 'FOOD', 'DRINKS', 'ATMOSPHERE', 'EVENTS');

-- CreateTable
CREATE TABLE "public"."venue_images" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "imageType" "public"."VenueImageType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "altText" TEXT,
    "caption" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" INTEGER,
    "format" TEXT,
    "colorPalette" TEXT[],
    "isPortrait" BOOLEAN,
    "aspectRatio" DOUBLE PRECISION,

    CONSTRAINT "venue_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_images_venueId_idx" ON "public"."venue_images"("venueId");

-- CreateIndex
CREATE INDEX "venue_images_imageType_idx" ON "public"."venue_images"("imageType");

-- CreateIndex
CREATE INDEX "venue_images_isActive_idx" ON "public"."venue_images"("isActive");

-- CreateIndex
CREATE INDEX "venue_images_venueId_imageType_isActive_idx" ON "public"."venue_images"("venueId", "imageType", "isActive");

-- AddForeignKey
ALTER TABLE "public"."venue_images" ADD CONSTRAINT "venue_images_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "public"."venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

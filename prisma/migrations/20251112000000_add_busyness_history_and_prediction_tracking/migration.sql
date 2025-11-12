-- CreateTable
CREATE TABLE "busyness_history" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hour" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "avgOccupancyCount" INTEGER NOT NULL,
    "avgOccupancyPercentage" INTEGER NOT NULL,
    "avgStatus" "BusyStatus" NOT NULL,
    "dataPointCount" INTEGER NOT NULL,
    "predictedOccupancyPercentage" INTEGER,
    "predictionAccuracy" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'aggregated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "busyness_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_metrics" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "weekOfYear" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "avgPredictionError" DOUBLE PRECISION NOT NULL,
    "totalPredictions" INTEGER NOT NULL,
    "accuratePredictions" INTEGER NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "busyness_history_venueId_date_idx" ON "busyness_history"("venueId", "date");

-- CreateIndex
CREATE INDEX "busyness_history_venueId_dayOfWeek_hour_idx" ON "busyness_history"("venueId", "dayOfWeek", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "busyness_history_venueId_date_hour_key" ON "busyness_history"("venueId", "date", "hour");

-- CreateIndex
CREATE INDEX "prediction_metrics_venueId_idx" ON "prediction_metrics"("venueId");

-- CreateIndex
CREATE INDEX "prediction_metrics_venueId_year_weekOfYear_idx" ON "prediction_metrics"("venueId", "year", "weekOfYear");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_metrics_venueId_year_weekOfYear_dayOfWeek_hour_key" ON "prediction_metrics"("venueId", "year", "weekOfYear", "dayOfWeek", "hour");

-- AddForeignKey
ALTER TABLE "busyness_history" ADD CONSTRAINT "busyness_history_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_metrics" ADD CONSTRAINT "prediction_metrics_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

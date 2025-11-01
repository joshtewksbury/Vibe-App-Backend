# Live Busyness System - Complete Technical Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        LIVE BUSYNESS PIPELINE                     │
└──────────────────────────────────────────────────────────────────┘

1. SERVER STARTUP (Railway)
   ↓
   server.ts:170 → busynessScheduler.start()
   ↓
2. SCHEDULER STARTS (Immediate + Every 15min)
   ↓
   busynessScheduler.ts:79 → fetchAndUpdateAllVenues()
   ↓
3. FOR EACH VENUE (41 venues, sequential)
   ↓
   ├─→ Get Place ID from database or fallback mapping
   ├─→ serpApi.ts:136 → fetchLiveBusyness(placeId)
   ├─→ SerpAPI → Google Maps Place Results API
   ├─→ Extract live_hash: { info, time_spent }
   ├─→ Convert text → busyness_score (0-100)
   ├─→ Calculate occupancy: (score/100) * capacity
   ├─→ Determine status: quiet/moderate/busy/packed
   ├─→ CREATE BusySnapshot in database
   └─→ Wait 500ms (rate limiting)
   ↓
4. CLEANUP OLD DATA
   ↓
   Delete snapshots older than 7 days
   ↓
5. REPEAT in 15 minutes

```

---

## Data Flow Diagram

```
┌─────────────────┐
│   iOS App       │
│  (User Opens    │
│  Venue Detail)  │
└────────┬────────┘
         │
         │ GET /venues/{id}/busy
         ↓
┌─────────────────────────────────────────┐
│  Backend API (Railway)                  │
│  routes/venues.ts:264                   │
│                                         │
│  1. Fetch snapshots (last 24h)         │
│  2. Fetch venue.popularTimes            │
│  3. Return JSON:                        │
│     {                                   │
│       snapshots: [...],                 │
│       popularTimes: {...},              │
│       hasLiveData: true/false           │
│     }                                   │
└─────────────┬───────────────────────────┘
              │
              ↓
┌───────────────────────────────────────┐
│  iOS: RealTimeBusynessService.swift   │
│  Line 180: convertVenueBusyData()     │
│                                       │
│  IF snapshots.length > 0:             │
│    → Use live snapshot data           │
│    → Mark isLive = true               │
│  ELSE IF popularTimes exists:         │
│    → Use Google Popular Times         │
│    → Mark isLive = false              │
│  ELSE:                                │
│    → Return nil (empty state)         │
└───────────────┬───────────────────────┘
                │
                ↓
┌───────────────────────────────────────┐
│  iOS: VenueDetailView.swift           │
│  Line 603: hasLiveData computed       │
│                                       │
│  IF data.lastUpdated < 15min ago:     │
│    → Show green "LIVE" badge          │
│  ELSE:                                │
│    → Show orange "Historical" badge   │
└───────────────────────────────────────┘
```

---

## Database Schema

```sql
-- Venues Table
CREATE TABLE venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  "placeId" TEXT,  -- Google Place ID (for SerpAPI)
  "popularTimes" JSONB,  -- Google Popular Times (fallback)
  ...
);

-- BusySnapshots Table
CREATE TABLE busy_snapshots (
  id TEXT PRIMARY KEY,
  "venueId" TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  "occupancyCount" INTEGER NOT NULL,
  "occupancyPercentage" INTEGER NOT NULL,
  status TEXT NOT NULL,  -- 'quiet', 'moderate', 'busy', 'packed'
  source TEXT DEFAULT 'realtime',  -- 'serp', 'realtime', 'estimated'

  CONSTRAINT fk_venue FOREIGN KEY ("venueId")
    REFERENCES venues(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_snapshots_venue_time
  ON busy_snapshots("venueId", timestamp);
```

---

## SerpAPI Integration

### Request Format:
```javascript
GET https://serpapi.com/search?
  engine=google_maps&
  type=place&
  place_id=ChIJWYPpUxNZkWsRaJOv74h0iT8&
  api_key=YOUR_API_KEY
```

### Response Format:
```json
{
  "place_results": {
    "title": "Hey Chica",
    "popular_times": {
      "live_hash": {
        "info": "Now: Usually not too busy",
        "time_spent": "People typically spend 1-2 hours here"
      },
      "graph_results": {
        "friday": [
          { "time": "6 AM", "busyness_score": 0 },
          { "time": "7 AM", "busyness_score": 0 },
          ...
          { "time": "10 PM", "busyness_score": 85 },
          { "time": "11 PM", "busyness_score": 95 }
        ]
      }
    }
  }
}
```

---

## Busyness Score Conversion

```typescript
// serpApi.ts:183
extractBusynessScore(liveInfo: string): number {
  const info = liveInfo.toLowerCase();

  if (info.includes('as busy as it gets'))    return 95;  // Packed
  if (info.includes('busier than usual'))     return 85;  // Very Busy
  if (info.includes('a little busy'))         return 65;  // Busy
  if (info.includes('not too busy'))          return 35;  // Moderate
  if (info.includes('quieter than usual'))    return 20;  // Quiet
  if (info.includes('not busy'))              return 15;  // Dead

  return 50;  // Default: Moderate
}
```

### Occupancy Calculation:
```typescript
// busynessScheduler.ts:165
occupancyPercentage = liveData.busynessScore;  // 0-100
occupancyCount = Math.round((occupancyPercentage / 100) * venue.capacity);

// Example: Hey Chica
// busynessScore = 65 ("A little busy")
// capacity = 300
// occupancyCount = (65/100) * 300 = 195 people
```

### Status Mapping:
```typescript
// busynessScheduler.ts:190
calculateBusyStatus(percentage: number): BusyStatus {
  if (percentage >= 90) return 'packed';    // 90-100%
  if (percentage >= 70) return 'busy';      // 70-89%
  if (percentage >= 40) return 'moderate';  // 40-69%
  if (percentage >= 20) return 'quiet';     // 20-39%
  return 'dead';                            // 0-19%
}
```

---

## Caching Strategy

### Backend Cache:
- **None** - Database acts as cache
- Snapshots stored for 7 days
- Old data auto-deleted by scheduler

### iOS Cache:
```swift
// RealTimeBusynessService.swift:57
private let cache = NSCache<NSString, _RTBDBox>()
private let cacheTimeout: TimeInterval = 300  // 5 minutes

// Cache strategy:
// 1. Check cache first (valid for 5 min)
// 2. If expired, fetch from API
// 3. Update cache with new data
```

---

## Error Handling

### Backend Errors:
```typescript
// serpApi.ts:136
try {
  const response = await axios.get(...)
  if (liveHash && liveHash.info) {
    return liveData;
  }
  console.log('⚠️  No live data available');
  return null;  // Skip snapshot creation
} catch (error) {
  console.error('❌ SerpAPI error:', error);
  return null;  // Don't create fake data
}
```

### iOS Errors:
```swift
// RealTimeBusynessService.swift:124-134
do {
  let data = try await fetchLiveDataFromAPI(for: venue)
  return data
} catch {
  await MainActor.run {
    self.error = error
    isLoading = false
  }
  print("⚠️ Failed to fetch: \(error)")
  return nil  // Show empty state or fallback
}
```

---

## Performance Optimization

### Rate Limiting:
```typescript
// busynessScheduler.ts:175
await this.delay(500);  // Wait 500ms between venue requests

// Total time for 41 venues:
// 41 venues × 500ms = 20.5 seconds per refresh cycle
```

### Database Indexing:
```sql
-- Fast lookup by venue + time
CREATE INDEX idx_snapshots_venue_time
  ON busy_snapshots("venueId", timestamp);

-- Typical query (< 10ms):
SELECT * FROM busy_snapshots
WHERE "venueId" = '1'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

### iOS Optimization:
```swift
// Only fetch when needed
// Cache for 5 minutes
// Reuse existing data when possible
```

---

## Monitoring & Debugging

### Backend Logs:
```bash
# Watch scheduler in real-time
railway logs -f | grep "Busyness Scheduler"

# Check for errors
railway logs | grep "❌"

# Count successful updates
railway logs | grep "✅" | wc -l
```

### Database Queries:
```sql
-- Check latest snapshots
SELECT
  v.name,
  bs.timestamp,
  bs."occupancyPercentage",
  bs.status,
  bs.source
FROM busy_snapshots bs
JOIN venues v ON v.id = bs."venueId"
ORDER BY bs.timestamp DESC
LIMIT 20;

-- Count snapshots per hour
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as snapshot_count
FROM busy_snapshots
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Venues without recent data
SELECT v.name
FROM venues v
LEFT JOIN busy_snapshots bs ON v.id = bs."venueId"
  AND bs.timestamp > NOW() - INTERVAL '1 hour'
WHERE bs.id IS NULL;
```

### iOS Debugging:
```swift
// RealTimeBusynessService.swift has extensive logging
// Check Xcode console for:
// "📡 Fetching live busyness for..."
// "✅ Updated Hey Chica with real popular times data"
// "⚠️ No live data available for..."
```

---

## Scaling Considerations

### Current Capacity:
- 41 venues × 4 updates/hour = **164 snapshots/hour**
- 164 × 24 hours = **3,936 snapshots/day**
- 7 day retention = **27,552 total snapshots**
- Database size: ~5-10 MB

### At 100 Venues:
- 100 × 4 = **400 snapshots/hour**
- 400 × 24 = **9,600 snapshots/day**
- 7 day retention = **67,200 total snapshots**
- Database size: ~15-25 MB

### At 1,000 Venues:
- 1,000 × 4 = **4,000 snapshots/hour**
- 4,000 × 24 = **96,000 snapshots/day**
- Database size: ~150-250 MB
- Consider: Batch processing, worker queues, distributed scheduling

---

## Security & Privacy

### SerpAPI Key Protection:
- Stored in Railway environment variables
- Never exposed to client
- Rotatable without code changes

### Data Privacy:
- All data comes from Google (already public)
- No user tracking or personal data
- Snapshots are anonymous aggregates

### Rate Limiting:
- 500ms delay between requests
- Prevents API abuse
- Stays within SerpAPI limits

---

## Future Enhancements

### Phase 2: Hybrid Data Sources
```typescript
class BusynessDataAggregator {
  async getBusynessData(venueId: string): BusyData {
    // Try multiple sources, use best available:
    const serpData = await serpApi.fetch(venueId);
    const checkInData = await userCheckIns.getCount(venueId);
    const venueData = await venuePOS.getRealTimeCount(venueId);

    return combineDataSources([serpData, checkInData, venueData]);
  }
}
```

### Phase 3: Machine Learning
```python
# Predict busyness based on:
# - Historical patterns
# - Events calendar
# - Weather
# - Day of week
# - Nearby venue activity

model = BusynessPredictionModel()
predicted_busyness = model.predict(
  venue_id='1',
  timestamp=datetime.now(),
  features={
    'weather': 'sunny',
    'nearby_events': ['concert_at_riverstage'],
    'day_of_week': 'friday'
  }
)
```

---

## Cost Optimization

### Current: $50-100/month
- 15-minute intervals
- All 41 venues
- 24/7 operation

### Optimized: $16-33/month (67% savings)
- 15-minute intervals
- Peak hours only (6 PM - 2 AM)
- All 41 venues

### Ultra-Optimized: $8-16/month (84% savings)
- 30-minute intervals
- Peak hours only
- All 41 venues

### Implementation:
```typescript
// busynessScheduler.ts
const currentHour = new Date().getHours();
const isPeakHours = currentHour >= 18 || currentHour < 2;
if (!isPeakHours) return;  // Skip non-peak hours
```

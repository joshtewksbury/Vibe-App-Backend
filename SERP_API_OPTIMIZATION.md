# SerpAPI Cost Optimization Guide

## ⏸️ Current Status: **PAUSED**

The automated SerpAPI busyness data scheduler has been **disabled** to prevent excessive API costs.

**Previous usage:**
- 200 venues × 4 calls/hour × 24 hours = **19,200 calls/day**
- **576,000 calls/month** = **$5,750/month** 💸

**Current state:**
- ✅ Scheduler is paused in `src/server.ts` (line 764)
- ✅ No automatic API calls are being made
- ✅ Estimated savings: **$5,750/month**

---

## 🎯 Recommended Next Steps

### Option 1: On-Demand Updates (User-Triggered) ⭐ RECOMMENDED
**Cost: $50-200/month | Savings: $5,500/month**

Only fetch busyness data when users actually view venues.

**Implementation:**
1. When user opens venue detail page → fetch live data for that venue
2. Cache result for 15 minutes
3. Serve cached data to other users viewing same venue

**Pros:**
- 95% cost reduction
- Always fresh data for active venues
- Better user experience (data is relevant)

**Cons:**
- Slightly slower first load (cache miss)
- Some venues won't have data (rarely viewed)

**Code changes needed:**
```typescript
// In VenueDetailView endpoint
app.get('/api/venues/:id', async (req, res) => {
  const venue = await prisma.venue.findUnique({ where: { id: req.params.id } });

  // Check cache first
  const cachedData = await getCachedBusyness(venue.id);
  if (cachedData && cachedData.age < 15 * 60 * 1000) {
    return res.json({ ...venue, liveData: cachedData });
  }

  // Fetch fresh data
  const liveData = await serpApiService.fetchLiveBusyness(venue.placeId, venue.name);
  await cacheBusyness(venue.id, liveData, 15); // Cache for 15 min

  return res.json({ ...venue, liveData });
});
```

---

### Option 2: Smart Scheduling (Popular Venues Only)
**Cost: $1,500-2,500/month | Savings: $3,000-4,000/month**

Update only popular venues frequently, others less often.

**Implementation:**
1. Track venue view count
2. Top 50 venues: Update every 30 minutes (5,400 calls/day)
3. Medium 100 venues: Update every 2 hours (1,200 calls/day)
4. Rest: Update once per day (50 calls/day)

**Total: ~6,650 calls/day = 200k/month = $2,000/month**

**Code changes:**
```typescript
// In busynessScheduler.ts
private async scheduleVenueUpdates() {
  const topVenues = await getTopVenuesByViews(50);
  const mediumVenues = await getMediumVenuesByViews(100);

  // Schedule different intervals
  setInterval(() => this.updateVenues(topVenues), 30 * 60 * 1000); // 30 min
  setInterval(() => this.updateVenues(mediumVenues), 2 * 60 * 60 * 1000); // 2 hours
  setInterval(() => this.updateVenues(restVenues), 24 * 60 * 60 * 1000); // 24 hours
}
```

---

### Option 3: Replace SerpAPI with Google Popular Times API 🚀 BEST LONG-TERM
**Cost: $288/month | Savings: $5,462/month (95%)**

Use Google's official API directly instead of SerpAPI.

**Why:**
- Same data source (Google Maps)
- $0.05 per request vs $0.30 (SerpAPI markup)
- More reliable, official support

**Implementation effort:** 2-3 days of development

**Resources:**
- [Google Popular Times API Docs](https://developers.google.com/maps/documentation/places/web-service/place-data-fields#populartimes)
- Cost: $17 per 1,000 Place Details calls (with Basic data)
- Need to request "Current Popular Times" field

**Code changes:**
```typescript
// Replace serpApi.ts with googlePlacesApi.ts
import { Client } from "@googlemaps/google-maps-services-js";

export class GooglePlacesService {
  private client: Client;

  async fetchLiveBusyness(placeId: string) {
    const response = await this.client.placeDetails({
      params: {
        place_id: placeId,
        fields: ['name', 'current_opening_hours', 'current_popular_times'],
        key: process.env.GOOGLE_PLACES_API_KEY!
      }
    });

    return response.data.result.current_popular_times;
  }
}
```

---

### Option 4: User-Generated Data (Hybrid Approach)
**Cost: $500-1,000/month | Savings: $4,500-5,000/month**

Combine API data with user check-ins for busyness estimates.

**Implementation:**
1. Users "check in" to venues
2. Track active users at each venue
3. Use API data as baseline, user data for real-time adjustments
4. Only call API for venues with low user activity

**Pros:**
- Extremely cost-effective
- More accurate for popular venues
- Builds user engagement

**Cons:**
- Requires critical mass of users
- Less accurate for unpopular venues
- Privacy considerations

---

### Option 5: Predictive Model (ML-Based)
**Cost: $0-100/month | Savings: $5,650/month**

Build ML model to predict busyness based on historical data.

**How it works:**
1. Use existing 7 days of historical data
2. Train model on patterns (day, time, weather, events)
3. Predict busyness without API calls
4. Occasionally validate with API (once per day per venue)

**Pros:**
- Almost zero ongoing costs
- Instant predictions
- Can factor in events, weather, holidays

**Cons:**
- 2-4 weeks development time
- Requires data science expertise
- May be less accurate than live data

**Tools:**
- TensorFlow.js (run predictions in Node.js)
- Historical busyness data (already collected)
- Public holiday/event APIs

---

## 📊 Comparison Table

| Option | Monthly Cost | Savings | Dev Time | Accuracy | User Impact |
|--------|-------------|---------|----------|----------|-------------|
| **Current (Paused)** | $0 | $5,750 | 0 | ❌ No data | ❌ No live data |
| **On-Demand** ⭐ | $50-200 | $5,500+ | 1 day | ✅ 100% | ✅ Minimal |
| **Smart Scheduling** | $1,500-2,500 | $3,000+ | 2 days | ✅ 90% | ✅ Good |
| **Google API** 🚀 | $288 | $5,462 | 3 days | ✅ 100% | ✅ None |
| **User-Generated** | $500-1,000 | $4,500+ | 1 week | ⚠️ Variable | ⚠️ Requires engagement |
| **ML Predictions** | $0-100 | $5,650+ | 2-4 weeks | ⚠️ 70-80% | ⚠️ Less precise |

---

## 🚀 Quick Implementation: On-Demand Updates

Here's a working example you can implement **today**:

### Step 1: Create Cache Service
```typescript
// src/services/busynessCache.ts
interface CachedBusyness {
  data: any;
  timestamp: Date;
}

const cache = new Map<string, CachedBusyness>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function getCachedBusyness(venueId: string): any | null {
  const cached = cache.get(venueId);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp.getTime();
  if (age > CACHE_TTL) {
    cache.delete(venueId);
    return null;
  }

  return cached.data;
}

export function setCachedBusyness(venueId: string, data: any): void {
  cache.set(venueId, { data, timestamp: new Date() });
}
```

### Step 2: Update Venue Endpoint
```typescript
// In src/server.ts or routes/venues.ts
app.get('/api/venues/:id/live-busyness', async (req, res) => {
  const { id } = req.params;

  try {
    // Check cache first
    const cached = getCachedBusyness(id);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // Fetch from API
    const venue = await prisma.venue.findUnique({
      where: { id },
      select: { placeId: true, name: true }
    });

    if (!venue?.placeId) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const liveData = await serpApiService.fetchLiveBusyness(venue.placeId, venue.name);

    if (liveData) {
      setCachedBusyness(id, liveData);
      return res.json({ ...liveData, cached: false });
    }

    res.status(404).json({ error: 'No live data available' });
  } catch (error) {
    console.error('Error fetching live busyness:', error);
    res.status(500).json({ error: 'Failed to fetch live data' });
  }
});
```

### Step 3: Update iOS App
```swift
// In VenueDetailView or RealTimeBusynessService
func fetchLiveBusyness(for venueId: String) async {
    let url = URL(string: "\(baseURL)/api/venues/\(venueId)/live-busyness")!

    do {
        let (data, _) = try await URLSession.shared.data(from: url)
        let busynessData = try JSONDecoder().decode(LiveBusynessData.self, from: data)

        await MainActor.run {
            self.currentBusyness = busynessData
        }
    } catch {
        print("Failed to fetch live busyness: \(error)")
    }
}
```

**Deployment:**
1. Add cache service to backend
2. Add new endpoint
3. Deploy to Railway
4. Update iOS app to call endpoint when viewing venue
5. **Test with 1 venue first!**

---

## 📈 Estimated Usage with On-Demand Model

**Assumptions:**
- 10,000 users
- 2,000 Daily Active Users (DAU)
- Each DAU views 5 venues/day
- 15-minute cache hit rate: 80%

**Calculations:**
- Total venue views: 2,000 × 5 = 10,000/day
- Cache misses (need API call): 10,000 × 20% = 2,000/day
- Monthly API calls: 2,000 × 30 = 60,000/month
- **Cost: 60,000 × $0.01 = $600/month** ✅

**At 25,000 users:**
- Monthly API calls: ~150,000
- **Cost: $1,500/month** (still 74% cheaper!)

---

## 🔧 How to Re-Enable Current Scheduler (Not Recommended)

If you need to temporarily re-enable:

1. Edit `/VibeBackend/src/server.ts` line 764
2. Uncomment: `busynessScheduler.start();`
3. Deploy to Railway
4. **Monitor costs closely!** Set billing alert at $100/day

---

## 💡 Recommendation

**Immediate (Today):** Implement **On-Demand Updates** (Option 1)
- Quick to implement (4-6 hours)
- 95% cost reduction
- Better user experience
- Cost: ~$600/month vs $5,750/month

**Short-term (This week):** Research **Google Popular Times API** (Option 3)
- Additional 50% savings ($600 → $288)
- Official Google API, more reliable
- One-time migration effort

**Long-term (Next month):** Add **User Check-ins** (Option 4)
- Further reduce API costs
- Increase user engagement
- Build community features

---

*Last updated: 2025-01-13*
*Status: Scheduler PAUSED in production*

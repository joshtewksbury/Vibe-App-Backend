# Live Busyness Snapshot Frequency Guide

## Current Settings
- **Refresh Interval**: 15 minutes
- **Snapshots/Hour**: 4 per venue (164 total)
- **API Calls/Day**: ~3,936
- **Estimated Cost**: $50-100/month

---

## How to Change Frequency

### Option 1: Increase Frequency (More Updates)

**5-Minute Intervals** (Most Aggressive)
```typescript
// File: src/services/busynessScheduler.ts:15
private readonly REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
```

**Impact:**
- ✅ Snapshots/Hour: 12 per venue (492 total)
- ✅ More accurate real-time tracking
- ❌ API Calls/Day: ~11,808 (3x more)
- ❌ Cost: $150-300/month (3x more)
- ❌ Higher rate limit risk

---

**10-Minute Intervals** (Balanced)
```typescript
private readonly REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
```

**Impact:**
- ✅ Snapshots/Hour: 6 per venue (246 total)
- ✅ Better than 15min, lower cost than 5min
- ❌ API Calls/Day: ~5,904 (1.5x more)
- ❌ Cost: $75-150/month (1.5x more)

---

### Option 2: Decrease Frequency (Lower Cost)

**30-Minute Intervals** (Budget-Friendly)
```typescript
private readonly REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
```

**Impact:**
- ✅ API Calls/Day: ~1,968 (50% reduction)
- ✅ Cost: $25-50/month (50% cheaper)
- ❌ Snapshots/Hour: 2 per venue (82 total)
- ❌ Less granular tracking

---

**60-Minute Intervals** (Minimal)
```typescript
private readonly REFRESH_INTERVAL = 60 * 60 * 1000; // 60 minutes
```

**Impact:**
- ✅ API Calls/Day: ~984 (75% reduction)
- ✅ Cost: $12-25/month (75% cheaper)
- ❌ Snapshots/Hour: 1 per venue (41 total)
- ❌ Minimal real-time value

---

## Advanced: Time-Based Scheduling

### Only Run During Peak Hours (6 PM - 2 AM)

```typescript
// src/services/busynessScheduler.ts - Add to fetchAndUpdateAllVenues()
private async fetchAndUpdateAllVenues(): Promise<void> {
  const currentHour = new Date().getHours();

  // Only run between 6 PM (18) and 2 AM (2)
  const isPeakHours = currentHour >= 18 || currentHour < 2;

  if (!isPeakHours) {
    console.log('⏭️  Skipping - outside peak hours (6 PM - 2 AM)');
    return;
  }

  // ... rest of existing code
}
```

**Impact:**
- ✅ API Calls/Day: ~1,312 (67% reduction)
- ✅ Cost: $16-33/month (67% cheaper)
- ✅ Still have data when users are active
- ❌ No daytime data

---

## Advanced: Tiered Venues (Priority System)

### Fetch Popular Venues Every 5min, Others Every 30min

```typescript
// src/services/busynessScheduler.ts

private readonly PRIORITY_VENUES = ['1', '2', '3', '17', '18']; // Top 5 venues
private priorityRefreshCount = 0;

start(): void {
  // Priority venues: Every 5 minutes
  setInterval(() => {
    this.fetchPriorityVenues();
  }, 5 * 60 * 1000);

  // All other venues: Every 30 minutes
  setInterval(() => {
    this.fetchRegularVenues();
  }, 30 * 60 * 1000);
}

private async fetchPriorityVenues(): Promise<void> {
  const venues = await prisma.venue.findMany({
    where: { id: { in: this.PRIORITY_VENUES } }
  });
  // ... fetch logic
}

private async fetchRegularVenues(): Promise<void> {
  const venues = await prisma.venue.findMany({
    where: { id: { notIn: this.PRIORITY_VENUES } }
  });
  // ... fetch logic
}
```

**Impact:**
- ✅ API Calls/Day: ~2,400 (39% reduction)
- ✅ Cost: $30-60/month (40% cheaper)
- ✅ Popular venues still get frequent updates
- ❌ More complex code

---

## Cost Breakdown by Frequency

| Interval | Calls/Day | Calls/Month | Est. Cost/Month | Data Quality |
|----------|-----------|-------------|-----------------|--------------|
| **5 min** | 11,808 | 354,240 | $150-300 | ⭐⭐⭐⭐⭐ Excellent |
| **10 min** | 5,904 | 177,120 | $75-150 | ⭐⭐⭐⭐ Very Good |
| **15 min** | 3,936 | 118,080 | $50-100 | ⭐⭐⭐⭐ Good (Current) |
| **30 min** | 1,968 | 59,040 | $25-50 | ⭐⭐⭐ Fair |
| **60 min** | 984 | 29,520 | $12-25 | ⭐⭐ Poor |
| **Peak Hours Only** | 1,312 | 39,360 | $16-33 | ⭐⭐⭐ Good (Smart) |
| **Tiered System** | 2,400 | 72,000 | $30-60 | ⭐⭐⭐⭐ Very Good (Smart) |

*Note: SerpAPI pricing varies by plan. Check https://serpapi.com/pricing*

---

## Recommendation

**For Launch (MVP):**
- **30-minute intervals** + **Peak hours only**
- Cost: ~$8-16/month
- Good enough for initial users
- Scale up based on demand

**For Growth:**
- **15-minute intervals** (current)
- Cost: ~$50-100/month
- Good balance of freshness and cost

**For Premium Experience:**
- **Tiered system** (5min for top venues, 30min for others)
- Cost: ~$30-60/month
- Best user experience at reasonable cost

---

## How to Deploy Changes

1. Edit `src/services/busynessScheduler.ts`
2. Change `REFRESH_INTERVAL` value
3. Build and deploy:
   ```bash
   npm run build
   git add .
   git commit -m "Adjust busyness refresh interval to X minutes"
   git push  # Triggers Railway deployment
   ```
4. Check logs: `railway logs | grep "Busyness Scheduler"`

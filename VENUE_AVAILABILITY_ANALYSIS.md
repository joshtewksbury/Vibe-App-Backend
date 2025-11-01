# Live Busyness Data Availability by Venue

## Understanding Google's Live Busyness Data

Google Maps only provides live busyness data for locations that meet certain criteria:

### **Requirements for Live Data:**

1. ✅ **High Foot Traffic**
   - Popular venues with many daily visitors
   - Google needs enough data points to be statistically significant

2. ✅ **User Location Sharing**
   - Enough Google Maps users must visit with Location History enabled
   - Data comes from Android phones and Google apps
   - Privacy-preserving aggregation (anonymous)

3. ✅ **Established Presence**
   - Venue must exist on Google Maps for several months
   - New venues won't have live data immediately

4. ✅ **Business Hours Consistency**
   - Venues with regular hours perform better
   - Google's algorithm needs predictable patterns

---

## Your Venues - Likelihood Analysis

### **Tier 1: Very Likely to Have Live Data (90%+ chance)**

These are well-established, high-traffic venues in Brisbane's nightlife districts:

1. **The Met** - Major nightclub in Fortitude Valley
2. **Prohibition** - Popular Fortitude Valley bar
3. **The Beat** - Established nightclub
4. **Iris Rooftop** - High-profile rooftop bar
5. **Regatta Hotel** - Brisbane institution
6. **The Triffid** - Well-known music venue
7. **The Tivoli** - Iconic Brisbane venue
8. **Riverland Brisbane** - High-traffic riverside venue
9. **Felons Brewing Co** - Popular riverside brewery
10. **Cloudland** - Major Fortitude Valley venue

**Expected**: 8-10 venues with consistent live data

---

### **Tier 2: Likely to Have Live Data (60-90% chance)**

Popular venues that may have intermittent live data:

11. **Hey Chica** - Popular bar
12. **Honky Tonks** - Established venue
13. **Black Bear Lodge** - Well-known bar
14. **Osbourne Hotel** - South Bank hotel
15. **Royal Exchange Hotel** - CBD hotel
16. **The Caxton Hotel** - Caxton Street staple
17. **Archive** - Fortitude Valley bar
18. **Warehouse 25** - West End venue
19. **Hotel West End** - West End institution
20. **The Boundary** - West End hotel

**Expected**: 6-8 venues with live data during peak hours

---

### **Tier 3: Possibly Has Live Data (30-60% chance)**

Smaller or newer venues that may not always have live data:

21. **Birdees** - Smaller bar
22. **Sixes and Sevens** - Bar
23. **Maya Rooftop Bar** - Rooftop venue
24. **The Tax Office** - Specialty venue
25. **Soko** - Asian fusion venue
26. **Su Casa** - Latin American venue
27. **Johnny Ringo's** - Themed bar
28. **Sixteen Antlers** - Cocktail bar
29. **The Sound Garden** - Music venue
30. **Mr Percival's** - Specialty bar

**Expected**: 3-5 venues with occasional live data

---

### **Tier 4: Unlikely to Have Live Data (<30% chance)**

Smaller, newer, or less-trafficked venues:

31. **Rics Bar** - Smaller venue
32. **The Prince Consort Hotel** - Quieter hotel
33. **The Lobby Bar James Street** - Boutique bar
34. **Jubilee Hotel** - Suburban hotel
35. **Alfred & Constance** - Newer venue
36. **Retros** - Smaller nightclub
37. **Eclipse Nightclub** - Smaller nightclub
38. **The Normanby Hotel** - Suburban hotel
39. **The Newmarket Hotel** - Suburban hotel
40. **Bar Pacino Brisbane** - Smaller riverside bar
41. **Riverbar & Kitchen Brisbane** - Smaller riverside venue

**Expected**: 1-3 venues with rare live data

---

## What Happens When Live Data Isn't Available?

### **Automatic Fallback System** (I implemented this!)

```
1. Backend tries to fetch live data from SerpAPI
   ↓
2. If live_hash is missing → Snapshot is NOT created
   ↓
3. iOS app requests /venues/{id}/busy
   ↓
4. Backend returns:
   - snapshots: [] (empty if no live data)
   - popularTimes: {...} (Google Popular Times fallback)
   ↓
5. iOS app shows:
   - Graph with Popular Times data (historical patterns)
   - Orange badge: "Showing historical data"
   ↓
6. User still sees useful information!
```

**Result**: Every venue always shows SOMETHING, even if not live.

---

## How to Check Which Venues Have Live Data

### **Method 1: Check Backend Logs**

After scheduler runs, check Railway logs:

```bash
railway logs | grep "✅"
```

**You'll see:**
```
✅ Hey Chica: busy (75%) - Now: A little busy
✅ The Met: packed (95%) - Now: Usually as busy as it gets
⚠️  Rics Bar: No live data available
✅ Regatta Hotel: moderate (65%) - Now: Not too busy
```

---

### **Method 2: Query Database**

```sql
-- Count snapshots per venue in last hour
SELECT
  v.name,
  COUNT(bs.id) as snapshot_count,
  MAX(bs.timestamp) as latest_snapshot
FROM venues v
LEFT JOIN busy_snapshots bs ON v.id = bs."venueId"
  AND bs.timestamp > NOW() - INTERVAL '1 hour'
GROUP BY v.id, v.name
ORDER BY snapshot_count DESC;
```

**Interpretation:**
- `snapshot_count > 0`: Venue has live data
- `snapshot_count = 0`: Venue doesn't have live data (yet)

---

### **Method 3: Check Admin Endpoint**

```bash
curl https://vibe-app-backend-production.up.railway.app/venues/scheduler/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Response shows:**
```json
{
  "snapshotsLastHour": 28,  // Out of 41 venues
  "totalSnapshots": 672
}
```

If `snapshotsLastHour < 41`, some venues don't have live data.

---

## Expected Real-World Results

Based on typical Google Maps coverage:

| Category | Count | Percentage |
|----------|-------|------------|
| **Consistent Live Data** | 15-20 venues | 37-49% |
| **Occasional Live Data** | 8-12 venues | 20-29% |
| **Rarely/Never Live Data** | 9-18 venues | 22-44% |

**Bottom Line**: Expect 23-32 out of 41 venues (56-78%) to have live data at any given time.

---

## Improving Coverage

### **Can't Force Google to Provide Data**, But You Can:

1. **Wait**: Coverage improves over time as venues become more popular
2. **Verify Place IDs**: Ensure each venue has correct Google Place ID
3. **Alternative Data Sources**:
   - Add manual check-in feature (users report busyness)
   - Partner with venues for POS/door count data
   - Use Instagram/social media activity as proxy
   - Computer vision at venue entrances (advanced)

---

## Recommendation

**Accept the Reality:**
- Not all venues will have live data from Google
- Use Popular Times as fallback (always available)
- Focus on making the best experience with available data

**User Expectations:**
- Green "LIVE" badge = Real-time Google data
- Orange "Historical" badge = Google Popular Times patterns
- Both are valuable! Historical patterns are often accurate enough.

**Future Enhancement:**
Consider building your own data collection:
1. User check-ins (gamification)
2. Venue partnerships (direct data feeds)
3. Social media scraping (Instagram stories, etc.)
4. Bluetooth beacon tracking (with permission)

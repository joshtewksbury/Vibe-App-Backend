# Instagram Scraper Setup Guide

## Overview

Automated Instagram post scraping for Vibe app using Apify platform. This system scrapes venue Instagram accounts to display their latest posts on the Discovery page.

**Status**: Ready to implement
**Cost**: ~$49-99/month (Apify Starter plan)
**Frequency**: Sync every 6 hours

---

## Step 1: Set Up Apify Account

### Create Account
1. Go to https://apify.com/
2. Sign up for a new account
3. Choose a plan:
   - **Free**: $5 credit (testing only)
   - **Starter**: $49/month → **RECOMMENDED**
     - $49 platform fee
     - Includes ~300-500 compute units
     - Good for 140 venues × 12 posts each
   - **Scale**: $499/month (if you scale beyond 500 venues)

### Get API Token
1. Log into Apify dashboard
2. Go to Settings → Integrations
3. Click "Personal API tokens"
4. Create new token: "Vibe Backend Production"
5. Copy the token (starts with `apify_api_...`)

---

## Step 2: Configure Backend

### Add Environment Variable

```bash
# In Railway dashboard or local .env
APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Install Dependencies

```bash
cd /Users/joshtewksbury/Desktop/FINAL/VibeBackend
npm install apify-client
```

### Run Database Migration

```bash
npx prisma db push
npx prisma generate
```

This will create:
- `venue_instagram_posts` table
- `instagramUsername` field on venues table
- `instagramLastSynced` field on venues table

---

## Step 3: Add Instagram Usernames to Venues

### Option A: Manual SQL Update (Quick Start)

```sql
-- Update venues with their Instagram handles
UPDATE venues SET "instagramUsername" = 'regattahotel' WHERE name = 'Regatta Hotel';
UPDATE venues SET "instagramUsername" = 'felonsbrewing' WHERE name = 'Felons Brewing Co';
UPDATE venues SET "instagramUsername" = 'caxtonhotel' WHERE name = 'Caxton Hotel';
-- ... continue for all 140 venues
```

### Option B: Bulk Import via CSV

Create a CSV file `venues_instagram.csv`:
```csv
venueName,instagramUsername
Regatta Hotel,regattahotel
Felons Brewing Co,felonsbrewing
Caxton Hotel,caxtonhotel
Breakfast Creek Hotel,breakfastcreekhotel
```

Then run:
```typescript
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import csv from 'csv-parser';

const prisma = new PrismaClient();

const results = [];
fs.createReadStream('venues_instagram.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', async () => {
    for (const row of results) {
      await prisma.venue.updateMany({
        where: { name: row.venueName },
        data: { instagramUsername: row.instagramUsername }
      });
    }
    console.log('✅ Instagram usernames imported');
  });
```

### Option C: Admin Panel (Recommended for ongoing)

Use the API endpoint:
```bash
PATCH /instagram/venues/:venueId/username
Body: { "instagramUsername": "regattahotel" }
```

---

## Step 4: Test the Scraper

### Test Single Venue

```bash
# Start your backend
npm run dev

# In another terminal, trigger a test sync
curl -X POST http://localhost:3000/instagram/sync/VENUE_ID_HERE \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Expected output:
```json
{
  "success": true,
  "message": "Synced 25 Instagram posts for Regatta Hotel",
  "venueId": "cmhv9ukl4001umb2911a1v7bb",
  "postsCount": 25
}
```

### Check Apify Dashboard
1. Go to https://console.apify.com/actors/runs
2. You should see a recent run for "instagram-scraper"
3. Check the run details - should show "SUCCEEDED"
4. View the dataset to see scraped posts

### Verify Database
```sql
SELECT COUNT(*) FROM venue_instagram_posts;
-- Should show ~25 posts

SELECT * FROM venue_instagram_posts
ORDER BY "postedAt" DESC
LIMIT 5;
-- Should show latest Instagram posts
```

---

## Step 5: Deploy to Production

### Update Railway Environment

```bash
# In Railway dashboard
railway variables set APIFY_API_TOKEN=apify_api_xxxxxxxx
```

### Deploy Code

```bash
git add .
git commit -m "Add Instagram scraper integration"
git push origin main

# If deploying to Railway
railway up
```

### Run Initial Sync

```bash
# Trigger bulk sync for all venues
curl -X POST https://vibe-app-backend-production.up.railway.app/instagram/sync-all \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

This will:
- Scrape all 140 venues with Instagram usernames
- Process in batches of 20
- Take ~15-20 minutes to complete
- Save ~1,680 posts to database (140 venues × 12 posts avg)

---

## Step 6: Set Up Automated Sync

### Add Cron Job to server.ts

```typescript
import { apifyInstagramScraper } from './services/apifyInstagramScraper';

// Sync Instagram posts every 6 hours
setInterval(async () => {
  console.log('🔄 Starting scheduled Instagram sync...');

  try {
    const summary = await apifyInstagramScraper.syncAllVenues();
    console.log('✅ Scheduled sync complete:', summary);
  } catch (error) {
    console.error('❌ Scheduled sync failed:', error);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours

// Initial sync on startup (wait 2 minutes after boot)
setTimeout(() => {
  console.log('🚀 Running initial Instagram sync...');
  apifyInstagramScraper.syncAllVenues();
}, 2 * 60 * 1000);
```

### Alternative: Use Railway Cron Jobs

If Railway supports cron jobs, create:
```bash
# cron.yaml
jobs:
  - name: instagram-sync
    schedule: "0 */6 * * *"  # Every 6 hours
    command: "npx ts-node scripts/syncInstagram.ts"
```

Script: `scripts/syncInstagram.ts`
```typescript
import { apifyInstagramScraper } from '../src/services/apifyInstagramScraper';

async function main() {
  console.log('🔄 Cron job: Syncing Instagram posts...');
  const summary = await apifyInstagramScraper.syncAllVenues();
  console.log('✅ Sync complete:', summary);
  process.exit(0);
}

main();
```

---

## API Endpoints

### Public Endpoints (No Auth)

#### Get Instagram Posts for Discovery Page
```
GET /instagram/posts
Query params:
  - limit: number (default: 50)
  - offset: number (default: 0)
  - venueId: string (optional - filter by venue)

Response:
{
  "posts": [
    {
      "id": "clxxx",
      "instagramId": "123456789",
      "caption": "Live music tonight! 🎸",
      "mediaType": "IMAGE",
      "mediaUrl": "https://...",
      "permalink": "https://instagram.com/p/...",
      "username": "regattahotel",
      "postedAt": "2025-12-01T10:30:00Z",
      "likesCount": 450,
      "commentsCount": 23,
      "venue": {
        "id": "cmhv9ukl4001umb2911a1v7bb",
        "name": "Regatta Hotel",
        "venueIconUrl": "https://...",
        "location": "543 Coronation Dr, Toowong",
        "category": "Pub"
      }
    }
  ],
  "pagination": {
    "total": 1680,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Get Single Post
```
GET /instagram/posts/:postId
```

### Admin Endpoints (Auth Required)

#### Manual Sync Single Venue
```
POST /instagram/sync/:venueId
Headers: Authorization: Bearer <admin-token>
```

#### Bulk Sync All Venues
```
POST /instagram/sync-all
Headers: Authorization: Bearer <admin-token>
```

#### Get Sync Statistics
```
GET /instagram/stats
Headers: Authorization: Bearer <admin-token>

Response:
{
  "stats": {
    "totalPosts": 1680,
    "venuesWithInstagram": 140,
    "venuesWithPosts": 135,
    "recentPosts": 420,
    "lastSync": {
      "name": "Regatta Hotel",
      "instagramUsername": "regattahotel",
      "instagramLastSynced": "2025-12-02T08:30:00Z"
    }
  }
}
```

#### Update Venue Instagram Username
```
PATCH /instagram/venues/:venueId/username
Headers: Authorization: Bearer <admin-token>
Body: { "instagramUsername": "regattahotel" }
```

#### Delete Post (Moderation)
```
DELETE /instagram/posts/:postId
Headers: Authorization: Bearer <admin-token>
```

---

## Cost Analysis

### Apify Costs (140 Venues)

#### Per Sync Run
```
140 venues × 12 posts = 1,680 results
Cost per run: ~$0.42 (at $0.25 per 1,000 results)
Compute units: ~1.4 CUs
```

#### Monthly (Every 6 hours = 4× daily = 120× monthly)
```
Syncs per month: 120
Cost: 120 × $0.42 = $50.40/month
Compute units: 120 × 1.4 = 168 CUs

Apify Starter plan:
- Platform fee: $49/month
- Included CUs: ~300-500
- Total cost: ~$50-60/month ✅
```

#### Cost Optimization Tips
1. **Reduce frequency**: Sync every 12 hours instead of 6 hours
   - Cost: ~$25/month (saves $25)
   - Trade-off: Posts may be 12 hours old

2. **Reduce posts per venue**: Fetch 6 posts instead of 12
   - Cost: ~$25/month (saves $25)
   - Trade-off: Less content variety

3. **Only sync popular venues**: Sync top 70 venues frequently, rest weekly
   - Cost: ~$30/month (saves $20)
   - Trade-off: Smaller venues have stale content

**Recommended**: Keep current settings for launch, optimize after user feedback

---

## Monitoring & Maintenance

### Daily Checks
- [ ] Check Apify dashboard for failed runs
- [ ] Monitor `/instagram/stats` endpoint
- [ ] Review error logs in Railway

### Weekly Tasks
- [ ] Review new Instagram posts for quality
- [ ] Check for venues with missing usernames
- [ ] Verify scraper still working (Instagram doesn't change)

### Monthly Tasks
- [ ] Review Apify costs and usage
- [ ] Update venue Instagram usernames if changed
- [ ] Remove duplicate or low-quality posts

### Alerts to Set Up
```typescript
// In server.ts - alert on sync failures
apifyInstagramScraper.syncAllVenues()
  .then(summary => {
    if (summary.failed > 10) {
      // Send alert (email, Slack, PagerDuty)
      console.error('⚠️  HIGH FAILURE RATE:', summary);
    }
  });
```

---

## Troubleshooting

### Error: "Apify client not initialized"
**Cause**: Missing APIFY_API_TOKEN environment variable
**Fix**:
```bash
railway variables set APIFY_API_TOKEN=your_token_here
```

### Error: "Venue does not have Instagram username"
**Cause**: Venue's instagramUsername field is null
**Fix**:
```bash
PATCH /instagram/venues/:venueId/username
Body: { "instagramUsername": "venue_handle" }
```

### Scraper Returns 0 Posts
**Causes**:
1. Instagram username is incorrect
2. Account is private
3. Account has no posts
4. Apify rate limited

**Fix**:
1. Verify username on Instagram manually
2. Ensure account is public
3. Check Apify dashboard for error details
4. Wait 1 hour and retry

### High Apify Costs
**Cause**: Scraping too frequently or too many posts
**Fix**:
1. Reduce sync frequency (6h → 12h)
2. Reduce posts per venue (25 → 12)
3. Use smart scheduling (popular venues more frequent)

### Posts Not Showing in App
**Checklist**:
- [ ] Check database: `SELECT COUNT(*) FROM venue_instagram_posts`
- [ ] Verify API works: `GET /instagram/posts`
- [ ] Check iOS app network logs
- [ ] Verify image URLs are accessible

---

## Example Venues with Instagram

Here are some Brisbane venues with confirmed Instagram accounts:

```typescript
const exampleVenues = [
  { name: 'Regatta Hotel', instagram: 'regattahotel' },
  { name: 'Felons Brewing Co', instagram: 'felonsbrewing' },
  { name: 'Caxton Hotel', instagram: 'caxtonhotel' },
  { name: 'Breakfast Creek Hotel', instagram: 'breakfastcreekhotel' },
  { name: 'The Boundary Hotel', instagram: 'theboundaryhotel' },
  { name: 'Story Bridge Hotel', instagram: 'storybridgehotel' },
  { name: 'The Beat Megaclub', instagram: 'thebeatmegaclub' },
  { name: 'Family Nightclub', instagram: 'familybrisbane' },
  { name: 'Prohibition', instagram: 'prohibitionbrisbane' },
  { name: 'Netherworld', instagram: 'netherworldarcade' }
];
```

You can use these to test the scraper before adding all 140 venues.

---

## Next Steps

1. ✅ Sign up for Apify account
2. ✅ Add APIFY_API_TOKEN to Railway
3. ✅ Run database migration
4. ⏳ Add Instagram usernames to venues
5. ⏳ Test scraper with 5-10 venues
6. ⏳ Run full sync for all 140 venues
7. ⏳ Build iOS Discovery page UI
8. ⏳ Set up automated sync schedule
9. ⏳ Monitor costs and performance

---

**Last Updated**: December 2, 2025
**Status**: Ready for implementation
**Estimated Setup Time**: 2-3 hours
**Monthly Cost**: $50-60

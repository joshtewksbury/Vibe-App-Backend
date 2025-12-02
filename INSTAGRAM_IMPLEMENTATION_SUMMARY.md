# Instagram Scraper - Implementation Summary

## ✅ What's Been Created

### Backend Services
- ✅ `src/services/apifyInstagramScraper.ts` - Instagram scraping service using Apify
- ✅ `src/routes/instagram.ts` - API endpoints for Instagram posts
- ✅ Database schema updates (Prisma)
- ✅ Server route registration

### Database Changes
- ✅ `VenueInstagramPost` model - stores scraped Instagram posts
- ✅ `instagramUsername` field on Venue model
- ✅ `instagramLastSynced` field on Venue model

### Scripts & Documentation
- ✅ `scripts/addInstagramUsernames.ts` - Helper script to add Instagram handles
- ✅ `INSTAGRAM_SCRAPER_SETUP.md` - Complete setup guide
- ✅ This summary document

---

## 🚀 How It Works

### 1. Data Flow
```
Apify Instagram Scraper
        ↓
  Scrapes venue accounts
        ↓
  Returns JSON with posts
        ↓
Backend saves to database
        ↓
API exposes posts to iOS app
        ↓
Discovery page displays posts
```

### 2. Scraping Process
- **Frequency**: Every 6 hours (configurable)
- **Posts per venue**: 12 latest posts
- **Batch size**: 20 venues per API call (for efficiency)
- **Total time**: ~15-20 minutes for all 140 venues

### 3. Key Features
- ✅ Automatic scraping (no manual work after setup)
- ✅ Handles images, videos, and carousels
- ✅ Captures engagement metrics (likes, comments, views)
- ✅ Direct links to Instagram posts
- ✅ Venue attribution (shows which venue posted)
- ✅ Admin moderation (can delete posts)

---

## 📋 Next Steps to Deploy

### Step 1: Set Up Apify (5 minutes)
1. Sign up at https://apify.com
2. Choose Starter plan ($49/month)
3. Get API token from Settings → Integrations
4. Add to Railway:
   ```bash
   railway variables set APIFY_API_TOKEN=apify_api_xxxxx
   ```

### Step 2: Run Database Migration (2 minutes)
```bash
cd /Users/joshtewksbury/Desktop/FINAL/VibeBackend
npx prisma db push
npx prisma generate
```

### Step 3: Add Instagram Usernames (30-60 minutes)
Two options:

**Option A: Use the script (recommended)**
```bash
# Edit scripts/addInstagramUsernames.ts to add your venues
# Then run:
npx ts-node scripts/addInstagramUsernames.ts
```

**Option B: Use API for each venue**
```bash
curl -X PATCH https://your-backend.up.railway.app/instagram/venues/VENUE_ID/username \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instagramUsername": "regattahotel"}'
```

### Step 4: Deploy Backend (5 minutes)
```bash
git add .
git commit -m "Add Instagram scraper"
git push origin main
railway up
```

### Step 5: Test Scraper (10 minutes)
```bash
# Sync a single venue
curl -X POST https://your-backend.up.railway.app/instagram/sync/VENUE_ID \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Check if posts were saved
curl https://your-backend.up.railway.app/instagram/posts?limit=10
```

### Step 6: Run Full Sync (20 minutes)
```bash
# Sync all 140 venues
curl -X POST https://your-backend.up.railway.app/instagram/sync-all \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Wait 15-20 minutes, then check stats
curl https://your-backend.up.railway.app/instagram/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Step 7: Enable Automated Sync (5 minutes)
Add to `src/server.ts` (around line 770):
```typescript
import { apifyInstagramScraper } from './services/apifyInstagramScraper';

// Sync Instagram posts every 6 hours
setInterval(async () => {
  console.log('🔄 Starting scheduled Instagram sync...');
  const summary = await apifyInstagramScraper.syncAllVenues();
  console.log('✅ Sync complete:', summary);
}, 6 * 60 * 60 * 1000);
```

---

## 📱 iOS Integration

### API Endpoint for Discovery Page
```swift
GET /instagram/posts?limit=50&offset=0
```

### Response Structure
```json
{
  "posts": [
    {
      "id": "clxxx",
      "caption": "Live music tonight! 🎸",
      "mediaType": "IMAGE",
      "mediaUrl": "https://...",
      "permalink": "https://instagram.com/p/...",
      "postedAt": "2025-12-01T10:30:00Z",
      "likesCount": 450,
      "commentsCount": 23,
      "venue": {
        "id": "cmhv9ukl4001umb2911a1v7bb",
        "name": "Regatta Hotel",
        "venueIconUrl": "https://...",
        "location": "543 Coronation Dr, Toowong"
      }
    }
  ]
}
```

### Example Swift Implementation
```swift
struct InstagramPost: Codable, Identifiable {
    let id: String
    let caption: String?
    let mediaType: String
    let mediaUrl: String
    let permalink: String
    let postedAt: Date
    let likesCount: Int
    let commentsCount: Int
    let venue: VenuePreview
}

class DiscoveryViewModel: ObservableObject {
    @Published var posts: [InstagramPost] = []

    func loadPosts() async {
        let response: PostsResponse = try await HTTPClient.shared.get("/instagram/posts")
        await MainActor.run {
            self.posts = response.posts
        }
    }
}
```

### UI Suggestions
1. **Feed Style**: Instagram-like vertical scroll
2. **Post Card**:
   - Venue header (icon + name)
   - Post image/video
   - Caption (with "Read more" if long)
   - Engagement count
   - "View on Instagram" link
3. **Filter Options**: By venue, by category, by date
4. **Loading States**: Skeleton screens while fetching

---

## 💰 Cost Breakdown

### Monthly Costs
```
Apify Starter Plan:        $49/month (fixed)
Instagram Scraping:        ~$1-5/month (usage-based)
Total:                     ~$50-55/month
```

### Cost Per Sync
```
140 venues × 12 posts = 1,680 results
Cost: ~$0.42 per sync
Syncs per day: 4 (every 6 hours)
Monthly syncs: 120
Monthly cost: $50.40
```

### Scaling Costs
- **At 280 venues**: ~$100/month (need Scale plan)
- **At 500 venues**: ~$150/month
- **At 1,000 venues**: ~$300/month

---

## 🎯 Benefits

### For Users
- ✅ See latest venue promotions and events
- ✅ Discover what's happening at venues
- ✅ View authentic venue content
- ✅ Click through to Instagram for more

### For Venues
- ✅ Free marketing exposure in your app
- ✅ No manual work (automatic scraping)
- ✅ Drive engagement to their Instagram
- ✅ Showcase events and specials

### For Your App
- ✅ Fresh, dynamic content daily
- ✅ No need to manually curate posts
- ✅ Increased user engagement
- ✅ Discovery page becomes valuable feature

---

## ⚠️ Legal & Ethical Considerations

### Instagram TOS
- ⚠️ Scraping violates Instagram's Terms of Service
- ✅ Using Apify minimizes risk (they handle anti-bot measures)
- ✅ Only scraping public accounts
- ✅ Not scraping user data or private content

### Best Practices
1. **Attribute properly**: Always show venue name and link to Instagram
2. **Respect copyright**: Posts belong to venues, give credit
3. **Moderation**: Remove posts if venue requests
4. **Transparency**: Mention in privacy policy

### Alternative (if scraping becomes issue)
If Instagram blocks scraping:
1. Use Instagram Graph API (requires venue opt-in)
2. Manual curation (team member adds posts weekly)
3. RSS feeds from venue websites
4. Direct venue upload portal

---

## 📊 Monitoring

### Daily Checks
```bash
# Check sync status
curl https://your-backend/instagram/stats -H "Authorization: Bearer TOKEN"
```

### What to Monitor
- ✅ Number of posts in database
- ✅ Last sync timestamp
- ✅ Failed venue count
- ✅ Apify usage & costs

### Set Up Alerts
```typescript
// Alert if sync fails for >10 venues
if (summary.failed > 10) {
  // Send email/Slack notification
  sendAlert('Instagram sync failing', summary);
}
```

---

## 🔧 Troubleshooting

### Common Issues

**Issue**: "Apify client not initialized"
**Fix**: Add APIFY_API_TOKEN to environment variables

**Issue**: "Venue does not have Instagram username"
**Fix**: Update venue with Instagram handle

**Issue**: Scraper returns 0 posts
**Possible causes**:
- Instagram username is wrong
- Account is private
- Account has no posts
**Fix**: Verify username manually on Instagram

**Issue**: High costs
**Fix**: Reduce sync frequency or posts per venue

---

## 🎉 Success Metrics

After deployment, track:
- Number of Instagram posts in database
- User engagement with Discovery page
- Click-through rate to Instagram
- Venue feedback on feature
- Monthly Apify costs vs budget

**Target Metrics (Month 1)**:
- ✅ 1,500+ Instagram posts in database
- ✅ 130+ venues with active Instagram sync
- ✅ 70%+ of venues have posts from last 7 days
- ✅ Costs stay under $60/month

---

## 📝 Checklist

### Pre-Launch
- [ ] Apify account created
- [ ] APIFY_API_TOKEN added to Railway
- [ ] Database migration run
- [ ] Instagram usernames added for all 140 venues
- [ ] Test scraper with 5 venues
- [ ] Full sync completed successfully
- [ ] Costs verified in Apify dashboard

### Launch
- [ ] Deploy backend to production
- [ ] Run initial full sync
- [ ] Verify posts in database
- [ ] Test API endpoints
- [ ] Build iOS Discovery page UI
- [ ] Enable automated sync

### Post-Launch
- [ ] Monitor Apify costs daily (first week)
- [ ] Check sync logs for errors
- [ ] Gather user feedback
- [ ] Add missing venue Instagram usernames
- [ ] Remove duplicate/low-quality posts

---

## 🚀 Ready to Launch!

Everything is set up and ready to go. Follow the "Next Steps to Deploy" section above, and you'll have automated Instagram scraping running in ~2 hours.

**Questions?** Check `INSTAGRAM_SCRAPER_SETUP.md` for detailed instructions.

**Support**: If you encounter issues, check:
1. Apify dashboard for scraper errors
2. Railway logs for backend errors
3. Database for missing data

---

**Last Updated**: December 2, 2025
**Status**: ✅ Ready for Production
**Estimated Setup Time**: 2-3 hours
**Monthly Cost**: $50-60

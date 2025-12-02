# Instagram Scraper - Quick Start Guide

## 🚀 Get Running in 30 Minutes

This is the fastest path to get Instagram scraping working. For detailed info, see `INSTAGRAM_SCRAPER_SETUP.md`.

---

## Step 1: Install Dependencies (2 min)

```bash
cd /Users/joshtewksbury/Desktop/FINAL/VibeBackend
npm install
```

---

## Step 2: Set Up Apify (5 min)

1. Go to https://apify.com and sign up
2. Choose **Starter plan** ($49/month)
3. Get your API token:
   - Settings → Integrations → Personal API tokens
   - Create new token → Copy it
4. Add to Railway:
   ```bash
   railway variables set APIFY_API_TOKEN=apify_api_xxxxxxxxxx
   ```

---

## Step 3: Update Database (2 min)

```bash
npx prisma db push
npx prisma generate
```

This creates the `venue_instagram_posts` table.

---

## Step 4: Add Instagram Usernames (10 min)

Edit `scripts/addInstagramUsernames.ts` and add your venues:

```typescript
const venueInstagramMapping = {
  'Regatta Hotel': 'regattahotel',
  'Felons Brewing Co': 'felonsbrewing',
  'Caxton Hotel': 'caxtonhotel',
  // ... add all your venues
};
```

Then run:
```bash
npx ts-node scripts/addInstagramUsernames.ts
```

---

## Step 5: Test the Scraper (5 min)

### Start backend locally:
```bash
npm run dev
```

### In another terminal, test a single venue:
```bash
# Get a venue ID first
curl http://localhost:3000/venues?limit=1

# Sync that venue
curl -X POST http://localhost:3000/instagram/sync/VENUE_ID_HERE \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Check if it worked:
```bash
curl http://localhost:3000/instagram/posts?limit=5
```

You should see Instagram posts!

---

## Step 6: Deploy (5 min)

```bash
git add .
git commit -m "Add Instagram scraper with Apify"
git push origin main
railway up
```

---

## Step 7: Run Full Sync (1 min to start)

```bash
curl -X POST https://vibe-app-backend-production.up.railway.app/instagram/sync-all \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

This runs in the background and takes ~15-20 minutes for all 140 venues.

---

## Step 8: Enable Auto-Sync (Optional)

Add to `src/server.ts` at the bottom, before the final `app.listen()`:

```typescript
import { apifyInstagramScraper } from './services/apifyInstagramScraper';

// Auto-sync every 6 hours
setInterval(async () => {
  console.log('🔄 Auto-sync Instagram posts...');
  await apifyInstagramScraper.syncAllVenues();
}, 6 * 60 * 60 * 1000);
```

Redeploy:
```bash
git add . && git commit -m "Enable Instagram auto-sync" && git push && railway up
```

---

## ✅ Done!

Your Instagram scraper is now running!

### Check Status
```bash
curl https://your-backend.up.railway.app/instagram/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### View Posts
```bash
curl https://your-backend.up.railway.app/instagram/posts?limit=20
```

---

## 📱 Use in iOS App

```swift
// Fetch posts for Discovery page
let response: PostsResponse = try await HTTPClient.shared.get("/instagram/posts")
```

---

## 💰 Cost

- **Apify Starter**: $49/month
- **Usage**: ~$1-5/month
- **Total**: ~$50-55/month

---

## 🆘 Troubleshooting

### "Apify client not initialized"
Add `APIFY_API_TOKEN` to Railway environment variables.

### "Venue does not have Instagram username"
Run step 4 again to add more usernames.

### No posts returned
- Check Apify dashboard: https://console.apify.com
- Verify Instagram username is correct
- Ensure account is public

---

## 📚 Documentation

- **Full setup guide**: `INSTAGRAM_SCRAPER_SETUP.md`
- **Implementation summary**: `INSTAGRAM_IMPLEMENTATION_SUMMARY.md`
- **API docs**: See routes in `src/routes/instagram.ts`

---

## 🎉 Success!

You now have:
- ✅ Automated Instagram scraping
- ✅ Fresh venue content every 6 hours
- ✅ Discovery page feed ready
- ✅ ~1,680 Instagram posts in your database

**Next**: Build the iOS Discovery page UI to display these posts!

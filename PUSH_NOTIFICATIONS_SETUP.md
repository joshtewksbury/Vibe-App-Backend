# Push Notifications Setup Guide

## ✅ Already Completed
- ✅ iOS app requests notification permissions on launch
- ✅ Backend push notification service created
- ✅ Database schema for device tokens created
- ✅ API endpoints for device registration created
- ✅ Push notifications entitlement added to iOS app

---

## 📋 What You Need to Do

### **Step 1: Generate APNs Authentication Key**

1. **Go to Apple Developer Portal:**
   - Visit: https://developer.apple.com/account/resources/authkeys/list
   - Sign in with your Apple Developer account

2. **Create a new Key:**
   - Click the **"+"** button (top right)
   - Name: `Vibe Push Notifications`
   - **Check the box** for "Apple Push Notifications service (APNs)"
   - Click **Continue**, then **Register**

3. **Download the .p8 file:**
   - Click **Download** (⚠️ You can only download this ONCE!)
   - Save it securely: `~/Documents/AuthKey_XXXXXXXXXX.p8`

4. **Save these credentials:**
   ```
   Key ID: ABC123DEFG (shown on download page - 10 characters)
   Team ID: XYZ987TEAM (top right of developer portal - 10 characters)
   ```

---

### **Step 2: Add APNs Credentials to Railway**

1. **Go to Railway Dashboard:**
   - Visit: https://railway.app
   - Open your `VibeBackend` project

2. **Add Environment Variables:**
   - Click on your service
   - Go to **Variables** tab
   - Add these variables:

   ```bash
   APNS_KEY_ID=YOUR_KEY_ID_HERE           # e.g., ABC123DEFG
   APNS_TEAM_ID=YOUR_TEAM_ID_HERE         # e.g., XYZ987TEAM
   APNS_BUNDLE_ID=com.nightguide.VibeApp  # Your app's bundle ID
   APNS_PRODUCTION=false                   # Use 'false' for development, 'true' for production
   ```

3. **Upload the .p8 key file:**

   **Option A: Base64 encode the key (Recommended)**
   ```bash
   # On Mac/Linux:
   base64 -i ~/Documents/AuthKey_XXXXXXXXXX.p8 | pbcopy

   # Then add to Railway:
   APNS_KEY_BASE64=<paste the base64 string>
   ```

   **Option B: Store key content directly**
   ```bash
   # Copy the file content:
   cat ~/Documents/AuthKey_XXXXXXXXXX.p8 | pbcopy

   # Then add to Railway:
   APNS_KEY=<paste the key content>
   ```

4. **Redeploy:**
   - Railway will automatically redeploy when you save the variables

---

### **Step 3: Enable Push Notifications in Xcode**

1. **Open Xcode:**
   - Open `VibeApp.xcodeproj`

2. **Select the VibeApp target:**
   - Click on the project in the left sidebar
   - Select the **VibeApp** target

3. **Enable Push Notifications capability:**
   - Go to **Signing & Capabilities** tab
   - Click **"+ Capability"**
   - Search for and add **"Push Notifications"**

4. **Verify Bundle ID matches:**
   - Make sure your Bundle Identifier is `com.nightguide.VibeApp`
   - This must match the `APNS_BUNDLE_ID` you set in Railway

---

### **Step 4: Test Push Notifications**

**⚠️ Important: Push notifications only work on REAL DEVICES, not simulators!**

1. **Build and run on a physical iPhone:**
   ```bash
   # Connect your iPhone via USB
   # Select your device in Xcode (top toolbar)
   # Click Run (⌘R)
   ```

2. **Grant notification permission:**
   - When the app launches, it will ask for notification permission
   - Tap **"Allow"**

3. **Check device token registration:**
   - Look at Xcode console logs
   - You should see:
   ```
   ✅ AppDelegate: Device token received: a1b2c3d4e5f6...
   ✅ PushNotificationService: Device token registered
   ```

4. **Send a test notification:**

   **Using the backend API:**
   ```bash
   # Get your auth token (from app login)
   # Replace YOUR_AUTH_TOKEN with actual token

   curl -X POST https://vibe-app-backend-production.up.railway.app/notifications/test \
     -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Test Notification",
       "body": "Hello from Vibe! 👋",
       "data": {}
     }'
   ```

5. **Verify notification appears:**
   - Lock your iPhone
   - You should see the notification appear on lock screen
   - Tap it to open the app

---

## 🔍 Troubleshooting

### "No device token received"
**Solution:**
- Make sure you're running on a **real device** (not simulator)
- Check that Push Notifications capability is enabled in Xcode
- Verify your Apple Developer account has proper provisioning

### "Failed to register for remote notifications"
**Solution:**
- Check that your Bundle ID matches in:
  - Xcode project settings
  - Apple Developer Portal
  - Railway `APNS_BUNDLE_ID` variable
- Make sure you have a valid provisioning profile

### "Notification not appearing"
**Solution:**
- Check notification permissions in iOS Settings > Vibe > Notifications
- Verify the device token was registered in database:
  ```bash
  # SSH into Railway and run:
  npx prisma studio
  # Check DeviceToken table
  ```
- Check Railway logs for errors:
  ```bash
  railway logs
  ```

### "Invalid APNs credentials"
**Solution:**
- Verify `APNS_KEY_ID` and `APNS_TEAM_ID` are correct
- Make sure the .p8 file content is properly set in Railway
- Check that the key has APNs enabled in Apple Developer Portal

---

## 📊 Verify Everything Works

1. **Check device token in database:**
   ```sql
   -- Run in Railway Prisma Studio
   SELECT * FROM "DeviceToken" WHERE active = true;
   ```

2. **Check notification logs:**
   ```sql
   SELECT * FROM "NotificationLog" ORDER BY "createdAt" DESC LIMIT 10;
   ```

3. **Test different notification types:**
   - Message notification (when you receive a chat message)
   - Friend request notification
   - Event reminder
   - Venue arrival

---

## 🚀 Production Checklist

When ready to go live:

1. **Switch to production APNs:**
   ```bash
   # In Railway variables:
   APNS_PRODUCTION=true
   ```

2. **Update entitlements:**
   - Change `aps-environment` from `development` to `production`
   - In `VibeApp.entitlements`:
   ```xml
   <key>aps-environment</key>
   <string>production</string>
   ```

3. **Archive and distribute:**
   - In Xcode: Product > Archive
   - Upload to TestFlight or App Store

---

## 📝 Current Status

- ✅ Backend infrastructure ready
- ✅ iOS app configured
- ⏳ Waiting for APNs credentials
- ⏳ Needs testing on real device

**Next Steps:**
1. Generate APNs key in Apple Developer Portal
2. Add credentials to Railway
3. Test on physical iPhone

---

*Last updated: 2025-11-16*

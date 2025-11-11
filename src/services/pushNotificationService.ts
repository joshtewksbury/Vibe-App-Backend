import apn from '@parse/node-apn';
import prisma from '../lib/prisma';

// APNs configuration
// NOTE: For production, you need to:
// 1. Get an APNs authentication key (.p8 file) from Apple Developer Portal
// 2. Store it securely (not in git)
// 3. Set the environment variables below

const APNS_KEY_ID = process.env.APNS_KEY_ID; // Your APNs key ID
const APNS_TEAM_ID = process.env.APNS_TEAM_ID; // Your Apple Team ID
const APNS_KEY_PATH = process.env.APNS_KEY_PATH; // Path to .p8 file
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.nightguide.VibeApp';
const APNS_PRODUCTION = process.env.APNS_PRODUCTION === 'true';

// Initialize APNs provider (will be null if credentials not configured)
let apnProvider: apn.Provider | null = null;

if (APNS_KEY_ID && APNS_TEAM_ID && APNS_KEY_PATH) {
  try {
    apnProvider = new apn.Provider({
      token: {
        key: APNS_KEY_PATH,
        keyId: APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      },
      production: APNS_PRODUCTION,
    });
    console.log(`✅ APNs Provider initialized (${APNS_PRODUCTION ? 'production' : 'development'} mode)`);
  } catch (error) {
    console.error('❌ Failed to initialize APNs provider:', error);
    console.log('⚠️ Push notifications will not be sent');
  }
} else {
  console.log('⚠️ APNs credentials not configured');
  console.log('💡 Set APNS_KEY_ID, APNS_TEAM_ID, and APNS_KEY_PATH environment variables');
  console.log('💡 Push notifications will not be sent until configured');
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  badge?: number;
  sound?: string;
  data?: Record<string, any>;
}

/**
 * Send a push notification to a user
 */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<void> {
  if (!apnProvider) {
    console.log('⚠️ APNs not configured, skipping push notification');
    return;
  }

  try {
    // Get active device tokens for the user
    const deviceTokens = await prisma.deviceToken.findMany({
      where: {
        userId,
        isActive: true,
        platform: 'ios',
      },
    });

    if (deviceTokens.length === 0) {
      console.log(`ℹ️ No active device tokens found for user ${userId}`);
      return;
    }

    console.log(`📲 Sending push notification to ${deviceTokens.length} device(s) for user ${userId}`);

    // Create APNs notification
    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // Expire in 1 hour
    notification.badge = payload.badge;
    notification.sound = payload.sound || 'default';
    notification.alert = {
      title: payload.title,
      body: payload.body,
    };
    notification.topic = APNS_BUNDLE_ID;
    notification.payload = payload.data || {};

    // Send to all device tokens
    const results = await Promise.all(
      deviceTokens.map(async (deviceToken) => {
        try {
          const result = await apnProvider!.send(notification, deviceToken.token);

          // Check for failures
          if (result.failed && result.failed.length > 0) {
            const failure = result.failed[0];
            console.error(`❌ Failed to send to device ${deviceToken.token.substring(0, 10)}...:`, failure.response);

            // If token is invalid, deactivate it
            if (failure.response && (failure.response.reason === 'BadDeviceToken' || failure.response.reason === 'Unregistered')) {
              await prisma.deviceToken.update({
                where: { id: deviceToken.id },
                data: { isActive: false },
              });
              console.log(`🗑️ Deactivated invalid device token`);
            }

            return { success: false, error: failure.response };
          }

          console.log(`✅ Push notification sent successfully to device ${deviceToken.token.substring(0, 10)}...`);
          return { success: true };
        } catch (error) {
          console.error(`❌ Error sending to device ${deviceToken.token.substring(0, 10)}...:`, error);
          return { success: false, error };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    console.log(`📊 Sent ${successCount}/${deviceTokens.length} push notifications successfully`);
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    throw error;
  }
}

/**
 * Send a message notification
 */
export async function sendMessageNotification(
  recipientId: string,
  senderName: string,
  messagePreview: string,
  conversationId: string
): Promise<void> {
  await sendPushNotification(recipientId, {
    title: senderName,
    body: messagePreview,
    badge: 1,
    sound: 'default',
    data: {
      type: 'message',
      conversationId,
      senderId: recipientId,
    },
  });
}

/**
 * Send a friend request notification
 */
export async function sendFriendRequestNotification(
  recipientId: string,
  senderName: string,
  requestId: string
): Promise<void> {
  await sendPushNotification(recipientId, {
    title: 'New Friend Request',
    body: `${senderName} sent you a friend request`,
    badge: 1,
    sound: 'default',
    data: {
      type: 'friend_request',
      requestId,
    },
  });
}

export default {
  sendPushNotification,
  sendMessageNotification,
  sendFriendRequestNotification,
};

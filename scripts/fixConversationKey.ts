import crypto from 'crypto';
import prisma from '../src/lib/prisma';

const conversationId = process.argv[2];

if (!conversationId) {
  console.error('Usage: npx ts-node scripts/fixConversationKey.ts <conversationId>');
  process.exit(1);
}

async function fixConversationKey() {
  try {
    console.log(`\n🔧 Fixing encryption key for conversation: ${conversationId}\n`);

    // Check if conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!conversation) {
      console.log('❌ Conversation not found');
      return;
    }

    console.log('✅ Conversation found:');
    console.log(`   ID: ${conversation.id}`);
    console.log(`   Type: ${conversation.type}`);
    console.log(`   Current encryption key: ${conversation.sharedEncryptionKey ? 'EXISTS' : 'NULL'}\n`);

    console.log('👥 Participants:');
    conversation.participants.forEach((p) => {
      console.log(`   ${p.user.firstName} ${p.user.lastName} (${p.user.email})`);
    });

    // Generate a new 256-bit encryption key
    const key = crypto.randomBytes(32); // 256 bits
    const keyBase64 = key.toString('base64');

    console.log(`\n🔑 Generated new encryption key: ${keyBase64.substring(0, 20)}...`);

    // Update conversation with new encryption key
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { sharedEncryptionKey: keyBase64 }
    });

    console.log('✅ Encryption key updated in database!');
    console.log('\n💡 IMPORTANT: Both users MUST sign out and back in to sync the new key.');
    console.log('💡 Old messages encrypted with different keys will show as [Unable to decrypt].');
    console.log('💡 Consider deleting this conversation and creating a new one instead.\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixConversationKey();

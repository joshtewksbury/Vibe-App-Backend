import prisma from '../src/lib/prisma';

const conversationId = process.argv[2] || 'cmi0yyuxx1bw4p729ekab00m9';

async function checkConversation() {
  try {
    console.log(`\n🔍 Checking conversation: ${conversationId}\n`);

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
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            senderId: true,
            encryptedContent: true,
            isDeleted: true,
            createdAt: true
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
    console.log(`   Created: ${conversation.createdAt}`);
    console.log(`   Updated: ${conversation.updatedAt}\n`);

    console.log('👥 Participants:');
    conversation.participants.forEach((p) => {
      console.log(`   ${p.user.firstName} ${p.user.lastName} (${p.user.email})`);
      console.log(`      - User ID: ${p.user.id}`);
      console.log(`      - Active: ${p.isActive}`);
      console.log(`      - Joined: ${p.joinedAt}`);
      console.log(`      - Last Read: ${p.lastReadAt}\n`);
    });

    console.log(`📨 Messages (${conversation.messages.length} total):`);
    if (conversation.messages.length === 0) {
      console.log('   ⚠️ No messages found in this conversation');
    } else {
      conversation.messages.forEach((msg) => {
        console.log(`   ${msg.id} - ${msg.createdAt}`);
        console.log(`      Sender: ${msg.senderId}`);
        console.log(`      Deleted: ${msg.isDeleted}`);
        console.log(`      Content: ${msg.encryptedContent.substring(0, 30)}...\n`);
      });
    }

    // Check for ALL messages (including deleted)
    const allMessages = await prisma.message.count({
      where: { conversationId }
    });
    const deletedMessages = await prisma.message.count({
      where: { conversationId, isDeleted: true }
    });

    console.log(`\n📊 Message Statistics:`);
    console.log(`   Total messages: ${allMessages}`);
    console.log(`   Active messages: ${allMessages - deletedMessages}`);
    console.log(`   Deleted messages: ${deletedMessages}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkConversation();

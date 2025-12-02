import prisma from '../src/lib/prisma';

const conversationId = process.argv[2];

if (!conversationId) {
  console.error('Usage: npx ts-node scripts/deleteConversation.ts <conversationId>');
  process.exit(1);
}

async function deleteConversation() {
  try {
    console.log(`\n🗑️ Deleting conversation: ${conversationId}\n`);

    // Delete all messages in the conversation
    const deletedMessages = await prisma.message.deleteMany({
      where: { conversationId }
    });
    console.log(`✅ Deleted ${deletedMessages.count} messages`);

    // Delete all participants
    const deletedParticipants = await prisma.conversationParticipant.deleteMany({
      where: { conversationId }
    });
    console.log(`✅ Deleted ${deletedParticipants.count} participants`);

    // Delete the conversation
    await prisma.conversation.delete({
      where: { id: conversationId }
    });
    console.log(`✅ Deleted conversation ${conversationId}`);

    console.log('\n✅ Conversation successfully deleted!');
    console.log('💡 Users should now create a new conversation with proper encryption.');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteConversation();

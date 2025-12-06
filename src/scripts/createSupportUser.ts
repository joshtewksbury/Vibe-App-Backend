import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function createSupportUser() {
  try {
    console.log('🔧 Creating Vibe Support admin user...');

    // Check if support user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'support@vibeapp.com' }
    });

    if (existingUser) {
      console.log('✅ Support user already exists!');
      console.log('📧 Email: support@vibeapp.com');
      console.log('🆔 User ID:', existingUser.id);
      return;
    }

    // Create support user
    const hashedPassword = await bcrypt.hash('VibeSupport2025!', 10);

    const supportUser = await prisma.user.create({
      data: {
        email: 'support@vibeapp.com',
        firstName: 'Vibe',
        lastName: 'Support',
        passwordHash: hashedPassword,
        role: 'ADMIN',
        isEmailVerified: true,
        gender: 'PREFER_NOT_TO_SAY',
        goingOutFrequency: 'OCCASIONALLY',
        musicPreferences: [],
        venuePreferences: [],
        venueIds: []
      }
    });

    console.log('✅ Support user created successfully!');
    console.log('📧 Email: support@vibeapp.com');
    console.log('🔑 Password: VibeSupport2025!');
    console.log('🆔 User ID:', supportUser.id);
    console.log('');
    console.log('⚠️  IMPORTANT: Save this User ID for the iOS app configuration!');
    console.log('You will need to add this to your iOS app as the SUPPORT_USER_ID constant.');
    console.log('');
    console.log('To log in as support:');
    console.log('Email: support@vibeapp.com');
    console.log('Password: VibeSupport2025!');

  } catch (error) {
    console.error('❌ Error creating support user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSupportUser();

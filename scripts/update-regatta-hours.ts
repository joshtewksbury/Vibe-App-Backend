import prisma from '../src/lib/prisma';

async function updateRegattaHours() {
  try {
    console.log('🔄 Updating Regatta Hotel opening hours...');

    const result = await prisma.venue.update({
      where: {
        id: 'cmhv9ukl4001umb2911a1v7bb'
      },
      data: {
        openingHours: {
          monday: '6:30am-1am',
          tuesday: '6:30am-3am',
          wednesday: '6:30am-3am',
          thursday: '6:30am-3am',
          friday: '6:30am-3am',
          saturday: '6:30am-3am',
          sunday: '6:30am-1am'
        }
      },
      select: {
        id: true,
        name: true,
        openingHours: true
      }
    });

    console.log('✅ Successfully updated Regatta Hotel hours:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Error updating Regatta Hotel hours:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateRegattaHours();

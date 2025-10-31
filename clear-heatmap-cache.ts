import prisma from './src/lib/prisma';

async function clearCache() {
  try {
    // Delete all heatmap tile cache entries from database
    const result = await prisma.heatMapTile.deleteMany({});

    console.log(`✅ Cleared ${result.count} heatmap tile cache entries from database`);
    console.log('✅ Heatmap will regenerate with new algorithm on next request');
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

clearCache();

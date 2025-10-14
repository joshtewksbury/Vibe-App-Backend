import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearCache() {
  try {
    // Delete all heatmap cache entries
    const result = await prisma.cache.deleteMany({
      where: {
        key: {
          startsWith: 'heatmap_'
        }
      }
    });
    
    console.log(`✅ Cleared ${result.count} heatmap cache entries`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  }
}

clearCache();

import { PrismaClient as MainPrismaClient } from '@prisma/client';
import { PrismaClient as ImagePrismaClient } from '../../prisma/generated/images-client';
export declare const mainDb: MainPrismaClient<{
    datasources: {
        db: {
            url: string;
        };
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
export declare const imageDb: ImagePrismaClient<{
    datasources: {
        db: {
            url: string;
        };
    };
}, never, import("../../prisma/generated/images-client/runtime/library").DefaultArgs>;
export { MainPrismaClient, ImagePrismaClient };
//# sourceMappingURL=database.d.ts.map
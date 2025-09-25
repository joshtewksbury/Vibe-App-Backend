import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
export declare const auditLogger: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auditLogger.d.ts.map
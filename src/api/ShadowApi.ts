import express, { Express, Request, Response, NextFunction } from 'express';
import { ShadowManager } from '../shadow/ShadowManager';
import {
  ShadowConflictError,
  ShadowNotFoundError,
  ShadowValidationError,
} from '../errors';
import { ShadowUpdateRequest, ShadowRollbackRequest, AuditLogQuery, Operator } from '../types/shadow';

export class ShadowApi {
  private app: Express;
  private shadowManager: ShadowManager;

  constructor(shadowManager: ShadowManager) {
    this.app = express();
    this.shadowManager = shadowManager;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandler();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.url}`);
      next();
    });
  }

  private setupRoutes(): void {
    const router = express.Router();

    router.get('/health', this.healthCheck.bind(this));

    router.get('/things', this.listThings.bind(this));

    router.get('/things/:thingName/shadow', this.getShadow.bind(this));

    router.put('/things/:thingName/shadow', this.updateShadow.bind(this));

    router.delete('/things/:thingName/shadow', this.deleteShadow.bind(this));

    router.get('/things/:thingName/shadow/delta', this.getDelta.bind(this));

    router.get('/things/:thingName/shadow/audit', this.getAuditLog.bind(this));

    router.get('/things/:thingName/shadow/versions', this.getAvailableVersions.bind(this));

    router.get('/things/:thingName/shadow/versions/:version', this.getVersionSnapshot.bind(this));

    router.post('/things/:thingName/shadow/rollback', this.rollbackToVersion.bind(this));

    router.get('/stats', this.getStats.bind(this));

    router.get('/audit/stats', this.getAuditStats.bind(this));

    this.app.use('/api/v1', router);
  }

  private setupErrorHandler(): void {
    this.app.use(
      (err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('[API] Error:', err);

        if (err instanceof ShadowConflictError) {
          return res.status(409).json(err.toJSON());
        }

        if (err instanceof ShadowNotFoundError) {
          return res.status(404).json({
            code: (err as any).code || 'NotFound',
            message: err.message,
          });
        }

        if (err instanceof ShadowValidationError) {
          return res.status(400).json({
            code: (err as any).code || 'ValidationError',
            message: err.message,
          });
        }

        res.status(500).json({
          code: 'InternalError',
          message: err.message || 'An unexpected error occurred',
        });
      }
    );
  }

  private healthCheck(req: Request, res: Response): void {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
    });
  }

  private listThings(req: Request, res: Response): void {
    const things = this.shadowManager.listThings();
    res.json({
      things,
      count: things.length,
    });
  }

  private getShadow(req: Request, res: Response): void {
    const { thingName } = req.params;
    const shadow = this.shadowManager.getShadow(thingName);
    res.json(shadow);
  }

  private async updateShadow(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { thingName } = req.params;
      const { state, clientToken, version, operator } = req.body;

      const request: ShadowUpdateRequest = {
        thingName,
        state: state || {},
        clientToken,
        version,
        operator,
        source: 'api',
      };

      const response = await this.shadowManager.updateShadow(request);
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  private deleteShadow(req: Request, res: Response): void {
    const { thingName } = req.params;
    const deleted = this.shadowManager.deleteShadow(thingName);

    if (!deleted) {
      throw new ShadowNotFoundError(thingName);
    }

    res.status(204).send();
  }

  private getDelta(req: Request, res: Response): void {
    const { thingName } = req.params;
    const shadow = this.shadowManager.getShadow(thingName);

    res.json({
      thingName,
      version: shadow.version,
      state: shadow.delta,
      metadata: shadow.metadata.desired,
      timestamp: shadow.timestamp,
    });
  }

  private getAuditLog(req: Request, res: Response): void {
    const { thingName } = req.params;
    const {
      fromVersion,
      toVersion,
      fromTime,
      toTime,
      operatorId,
      changeSource,
      limit,
      offset,
    } = req.query;

    const query: AuditLogQuery = {
      thingName,
      fromVersion: fromVersion ? parseInt(fromVersion as string) : undefined,
      toVersion: toVersion ? parseInt(toVersion as string) : undefined,
      fromTime: fromTime ? parseInt(fromTime as string) : undefined,
      toTime: toTime ? parseInt(toTime as string) : undefined,
      operatorId: operatorId as string | undefined,
      changeSource: changeSource as any | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    };

    const result = this.shadowManager.getAuditManager().query(query);
    res.json(result);
  }

  private getAvailableVersions(req: Request, res: Response): void {
    const { thingName } = req.params;

    this.shadowManager.getShadow(thingName);

    const versions = this.shadowManager.getAuditManager().getVersions(thingName);
    const earliest = this.shadowManager.getAuditManager().getEarliestVersion(thingName);
    const latest = this.shadowManager.getAuditManager().getLatestVersion(thingName);

    res.json({
      thingName,
      versions,
      count: versions.length,
      earliestVersion: earliest,
      latestVersion: latest,
    });
  }

  private getVersionSnapshot(req: Request, res: Response): void {
    const { thingName, version } = req.params;
    const versionNum = parseInt(version);

    if (isNaN(versionNum)) {
      throw new ShadowValidationError('version must be a number');
    }

    const snapshot = this.shadowManager.getAuditManager().getSnapshotAtVersion(thingName, versionNum);
    if (!snapshot) {
      throw new ShadowNotFoundError(
        `No snapshot found for version ${versionNum} of thing ${thingName}`
      );
    }

    res.json(snapshot);
  }

  private async rollbackToVersion(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { thingName } = req.params;
      const { targetVersion, operator, reason } = req.body;

      if (targetVersion === undefined) {
        throw new ShadowValidationError('targetVersion is required');
      }

      if (typeof targetVersion !== 'number') {
        throw new ShadowValidationError('targetVersion must be a number');
      }

      const request: ShadowRollbackRequest = {
        thingName,
        targetVersion,
        operator,
        reason,
      };

      const response = await this.shadowManager.rollbackToVersion(request);
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  private getStats(req: Request, res: Response): void {
    res.json({
      shadowCount: this.shadowManager.getShadowCount(),
    });
  }

  private getAuditStats(req: Request, res: Response): void {
    const stats = this.shadowManager.getAuditManager().getStats();
    res.json(stats);
  }

  public getApp(): Express {
    return this.app;
  }

  public listen(port: number, host?: string): Promise<void> {
    return new Promise((resolve) => {
      if (host) {
        this.app.listen(port, host, () => {
          console.log(`[API] Server listening on http://${host}:${port}`);
          resolve();
        });
      } else {
        this.app.listen(port, () => {
          console.log(`[API] Server listening on http://localhost:${port}`);
          resolve();
        });
      }
    });
  }
}

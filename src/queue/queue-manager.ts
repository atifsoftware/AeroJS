/**
 * @file queue-manager.ts
 * @description Central Queue broker manager and facade for AeroJS.
 */

import type { QueueDriver, PushOptions } from './drivers/queue-driver.js';
import { MemoryQueueDriver } from './drivers/memory-queue-driver.js';
import { DatabaseQueueDriver } from './drivers/database-queue-driver.js';
import { QueueWorker, type WorkerOptions } from './worker.js';
import { Job } from './job.js';
import { RedisQueueDriver } from './drivers/redis-queue-driver.js';
import { RedisClient } from '../redis/redis-client.js';

export interface QueueConnectionConfig {
  driver: 'memory' | 'database' | 'redis' | string;
  table?: string;
  connection?: string;
  redis?: RedisClient;
  redisOptions?: any;
}

export interface QueueConfig {
  default?: string;
  connections?: Record<string, QueueConnectionConfig>;
}

export class QueueManager {
  private defaultConnection = 'memory';
  private connectionConfigs = new Map<string, QueueConnectionConfig>();
  private instantiatedDrivers = new Map<string, QueueDriver>();
  private jobRegistry = new Map<string, new (...args: any[]) => Job>();

  constructor(config: QueueConfig = {}) {
    this.configure(config);
  }

  public configure(config: QueueConfig): this {
    if (config.default) {
      this.defaultConnection = config.default;
    }
    if (config.connections) {
      for (const [name, cfg] of Object.entries(config.connections)) {
        this.connectionConfigs.set(name, cfg);
      }
    }
    return this;
  }

  public registerJob(name: string, jobClass: new (...args: any[]) => Job): this {
    this.jobRegistry.set(name, jobClass);
    return this;
  }

  public driver(name?: string): QueueDriver {
    const connName = name || this.defaultConnection;

    if (this.instantiatedDrivers.has(connName)) {
      return this.instantiatedDrivers.get(connName)!;
    }

    const cfg = this.connectionConfigs.get(connName) || { driver: connName === 'database' ? 'database' : (connName === 'redis' ? 'redis' : 'memory') };
    let driverInstance: QueueDriver;

    switch (cfg.driver) {
      case 'redis': {
        const client = cfg.redis || new RedisClient(cfg.redisOptions);
        driverInstance = new RedisQueueDriver(client);
        break;
      }
      case 'database':
        driverInstance = new DatabaseQueueDriver({
          table: cfg.table,
          connection: cfg.connection,
        });
        break;
      case 'memory':
      default:
        driverInstance = new MemoryQueueDriver();
        break;
    }

    this.instantiatedDrivers.set(connName, driverInstance);
    return driverInstance;
  }

  /**
   * Dispatches a job onto the background queue.
   */
  public async dispatch(job: Job | any, options: PushOptions = {}): Promise<string | number> {
    const jobName = job.constructor?.name || 'AnonymousJob';
    const payload = JSON.stringify({
      jobName,
      data: { ...job },
      tries: job.tries || 3,
      delay: options.delay || job.delay || 0,
    });

    const driver = this.driver();
    return await driver.push(payload, {
      queue: options.queue,
      delay: options.delay || job.delay,
    });
  }

  /**
   * Executes a job synchronously without queueing.
   */
  public async dispatchSync(job: Job): Promise<any> {
    return await job.handle();
  }

  /**
   * Spawns a QueueWorker instance for the given queue and connection.
   */
  public createWorker(options: WorkerOptions = {}, connectionName?: string): QueueWorker {
    const driver = this.driver(connectionName);
    const worker = new QueueWorker(driver, {
      ...options,
      jobRegistry: {
        ...Object.fromEntries(this.jobRegistry),
        ...(options.jobRegistry || {}),
      },
    });
    return worker;
  }

  public reset(): void {
    this.instantiatedDrivers.clear();
    this.connectionConfigs.clear();
    this.defaultConnection = 'memory';
  }
}

export const Queue = new QueueManager();

/**
 * @file storage-manager.ts
 * @description Central Storage manager and facade for AeroJS.
 * Manages multiple named disks (local, cloud, memory) with driver resolution and configuration.
 */

import type { StorageDriver } from './drivers/storage-driver.js';
import { MemoryStorageDriver } from './drivers/memory-driver.js';
import { LocalStorageDriver, type LocalStorageOptions } from './drivers/local-driver.js';
import { S3StorageDriver, type S3StorageOptions } from './drivers/s3-driver.js';

export interface StorageDiskConfig {
  driver: 'local' | 'memory' | 's3' | string;
  root?: string;
  baseUrl?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  publicUrl?: string;
  [key: string]: any;
}

export interface StorageConfig {
  default?: string;
  disks?: Record<string, StorageDiskConfig>;
}

export class StorageManager {
  private defaultDiskName = 'memory';
  private diskConfigs = new Map<string, StorageDiskConfig>();
  private instantiatedDisks = new Map<string, StorageDriver>();
  private customDrivers = new Map<string, (config: StorageDiskConfig) => StorageDriver>();

  constructor(config: StorageConfig = {}) {
    this.configure(config);
  }

  public configure(config: StorageConfig): this {
    if (config.default) {
      this.defaultDiskName = config.default;
    }
    if (config.disks) {
      for (const [name, diskCfg] of Object.entries(config.disks)) {
        this.diskConfigs.set(name, diskCfg);
      }
    }
    return this;
  }

  /**
   * Registers a custom driver factory function.
   */
  public extend(driverName: string, factory: (config: StorageDiskConfig) => StorageDriver): this {
    this.customDrivers.set(driverName, factory);
    return this;
  }

  /**
   * Gets or instantiates a storage disk by name.
   */
  public disk(name?: string): StorageDriver {
    const diskName = name || this.defaultDiskName;

    if (this.instantiatedDisks.has(diskName)) {
      return this.instantiatedDisks.get(diskName)!;
    }

    const config = this.diskConfigs.get(diskName) || { driver: diskName === 'memory' ? 'memory' : 'local' };
    const driver = this.createDriver(config);
    this.instantiatedDisks.set(diskName, driver);
    return driver;
  }

  private createDriver(config: StorageDiskConfig): StorageDriver {
    if (this.customDrivers.has(config.driver)) {
      return this.customDrivers.get(config.driver)!(config);
    }

    switch (config.driver) {
      case 'memory':
        return new MemoryStorageDriver({ baseUrl: config.baseUrl });

      case 'local':
        return new LocalStorageDriver({
          root: config.root || './storage/app',
          baseUrl: config.baseUrl || '/storage',
        });

      case 's3':
        return new S3StorageDriver({
          bucket: config.bucket || 'default-bucket',
          region: config.region,
          endpoint: config.endpoint,
          publicUrl: config.publicUrl,
        });

      default:
        throw new Error(`Unsupported storage driver: "${config.driver}"`);
    }
  }

  // Facade proxies to the default disk
  public put(path: string, content: Buffer | Uint8Array | string): Promise<string> {
    return this.disk().put(path, content);
  }

  public get(path: string): Promise<Buffer> {
    return this.disk().get(path);
  }

  public getText(path: string, encoding?: BufferEncoding): Promise<string> {
    return this.disk().getText(path, encoding);
  }

  public exists(path: string): Promise<boolean> {
    return this.disk().exists(path);
  }

  public delete(path: string): Promise<boolean> {
    return this.disk().delete(path);
  }

  public size(path: string): Promise<number> {
    return this.disk().size(path);
  }

  public url(path: string): string {
    return this.disk().url(path);
  }

  public temporaryUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    if (this.disk().temporaryUrl) {
      return this.disk().temporaryUrl!(path, expiresInSeconds);
    }
    return Promise.resolve(this.disk().url(path));
  }

  public reset(): void {
    this.instantiatedDisks.clear();
    this.diskConfigs.clear();
    this.defaultDiskName = 'memory';
  }
}

export const Storage = new StorageManager();

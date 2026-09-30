/**
 * @file storage-driver.ts
 * @description StorageDriver interface for local, cloud, and memory storage adapters in AeroJS.
 */

export interface StorageDriver {
  /**
   * Puts file content at the target path.
   * Returns the stored relative or absolute path.
   */
  put(path: string, content: Buffer | Uint8Array | string): Promise<string>;

  /**
   * Reads raw bytes from the target path.
   */
  get(path: string): Promise<Buffer>;

  /**
   * Reads file as UTF-8 string.
   */
  getText(path: string, encoding?: BufferEncoding): Promise<string>;

  /**
   * Checks if file exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Deletes a file.
   */
  delete(path: string): Promise<boolean>;

  /**
   * Returns file size in bytes.
   */
  size(path: string): Promise<number>;

  /**
   * Returns public URL for accessing the file.
   */
  url(path: string): string;

  /**
   * Generates a temporary signed URL.
   */
  temporaryUrl?(path: string, expiresInSeconds: number): Promise<string>;
}

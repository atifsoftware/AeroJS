/**
 * @file queue-driver.ts
 * @description QueueDriver interface for background job broker adapters in AeroJS.
 */

export interface QueuedJobRecord {
  id: string | number;
  queue: string;
  payload: string;
  attempts: number;
  reservedAt: Date | null;
  availableAt: Date;
  createdAt: Date;
}

export interface PushOptions {
  queue?: string;
  delay?: number; // In seconds
}

export interface QueueDriver {
  /**
   * Pushes a job or serialized payload onto the queue.
   */
  push(payload: string, options?: PushOptions): Promise<string | number>;

  /**
   * Pops the next available job for processing.
   */
  pop(queue?: string): Promise<QueuedJobRecord | null>;

  /**
   * Acknowledges and deletes a job after successful completion.
   */
  delete(id: string | number, queue?: string): Promise<boolean>;

  /**
   * Releases a job back to the queue (e.g. after a retryable failure).
   */
  release(id: string | number, delaySeconds?: number, queue?: string): Promise<boolean>;

  /**
   * Returns the count of pending jobs in a queue.
   */
  size(queue?: string): Promise<number>;

  /**
   * Clears all jobs in a queue.
   */
  clear(queue?: string): Promise<void>;
}

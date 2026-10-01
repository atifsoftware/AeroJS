/**
 * @file scheduler.ts
 * @description Cron-based Task Scheduler for AeroJS.
 * Hospital use: Daily bank reconciliation, BMDC license expiry alerts,
 * shift auto-close, monthly doctor settlement, dividend calculation trigger.
 *
 * Zero external dependency — uses Node.js setInterval with cron expression parsing.
 */

// ─── Cron Parser ──────────────────────────────────────────────────────────────

/*
 * Minimal 5-field cron parser.
 * Fields: minute hour day-of-month month day-of-week
 * Supports: * (any), numbers, ranges (1-5), step (*\/5), lists (1,3,5)
 */
function matchesCronField(value: number, field: string): boolean {
  if (field === '*') return true;

  // Step: */5
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }

  // List: 1,3,5
  if (field.includes(',')) {
    return field.split(',').some((part) => matchesCronField(value, part.trim()));
  }

  // Range: 1-5
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start! && value <= end!;
  }

  return value === parseInt(field, 10);
}

function shouldRunNow(cron: string, now: Date = new Date()): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${cron}"`);

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [string, string, string, string, string];

  return (
    matchesCronField(now.getMinutes(), minute) &&
    matchesCronField(now.getHours(), hour) &&
    matchesCronField(now.getDate(), dayOfMonth) &&
    matchesCronField(now.getMonth() + 1, month) &&
    matchesCronField(now.getDay(), dayOfWeek)
  );
}

// ─── Scheduled Task ───────────────────────────────────────────────────────────

export type TaskHandler = () => Promise<void> | void;

export interface TaskDefinition {
  name: string;
  cron: string;
  handler: TaskHandler;
  enabled: boolean;
  description?: string;
  runOnStart?: boolean;     // Run immediately on server boot
  overlap?: boolean;        // Allow overlap if previous run still in progress
}

export interface TaskRunRecord {
  name: string;
  startedAt: Date;
  finishedAt?: Date;
  success: boolean;
  error?: string;
  durationMs?: number;
}

// ─── Scheduler Builder ────────────────────────────────────────────────────────

export class TaskBuilder {
  private _cron = '';
  private _name: string;
  private _description?: string;
  private _runOnStart = false;
  private _overlap = false;
  private manager: Scheduler;

  constructor(name: string, manager: Scheduler) {
    this._name = name;
    this.manager = manager;
  }

  /** Set cron expression. E.g. '0 23 * * *' = every day at 11PM. */
  public cron(expression: string): this {
    this._cron = expression;
    return this;
  }

  /** Human-readable description. */
  public description(desc: string): this {
    this._description = desc;
    return this;
  }

  /** Run this task immediately when the server starts. */
  public runOnStart(): this {
    this._runOnStart = true;
    return this;
  }

  /** Allow the task to overlap if previous run is still in progress. */
  public allowOverlap(): this {
    this._overlap = true;
    return this;
  }

  /** Register the task with a handler function. */
  public run(handler: TaskHandler): Scheduler {
    if (!this._cron) throw new Error(`[AeroJS Scheduler] Task "${this._name}" has no cron expression. Call .cron('...')`);
    this.manager.register({
      name: this._name,
      cron: this._cron,
      handler,
      enabled: true,
      description: this._description,
      runOnStart: this._runOnStart,
      overlap: this._overlap,
    });
    return this.manager;
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export class Scheduler {
  private tasks = new Map<string, TaskDefinition>();
  private runningTasks = new Set<string>();
  private history: TaskRunRecord[] = [];
  private timer?: NodeJS.Timeout;
  private historyLimit = 500;

  /**
   * Define a new scheduled task using builder pattern.
   *
   * @example
   * Scheduler.define('DailyBankReco')
   *   .cron('0 23 * * *')
   *   .description('Daily bank reconciliation after cashiers close')
   *   .run(async () => {
   *     await BankRecoService.runDailyReco();
   *   });
   */
  public define(name: string): TaskBuilder {
    return new TaskBuilder(name, this);
  }

  /**
   * Register a task definition directly.
   */
  public register(task: TaskDefinition): this {
    this.tasks.set(task.name, task);
    return this;
  }

  /**
   * Start the scheduler — checks every minute for tasks to run.
   * Call this in your server.ts after all tasks are defined.
   */
  public start(): this {
    if (this.timer) {
      console.warn('[AeroJS Scheduler] Scheduler is already running');
      return this;
    }

    // Run on-start tasks
    for (const task of this.tasks.values()) {
      if (task.runOnStart && task.enabled) {
        setImmediate(() => this.runTask(task));
      }
    }

    // Schedule minute-by-minute checks
    this.timer = setInterval(() => {
      this.tick(new Date());
    }, 60 * 1000);

    // Align to the next minute boundary
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
      this.tick(new Date());
      this.timer = setInterval(() => this.tick(new Date()), 60 * 1000);
    }, msUntilNextMinute);

    console.info('[AeroJS Scheduler] Started — tick every 60 seconds');
    return this;
  }

  /**
   * Stop the scheduler (e.g., for graceful shutdown).
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      console.info('[AeroJS Scheduler] Stopped');
    }
  }

  private tick(now: Date): void {
    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      if (shouldRunNow(task.cron, now)) {
        if (!task.overlap && this.runningTasks.has(task.name)) {
          console.warn(`[AeroJS Scheduler] Task "${task.name}" is still running from previous tick — skipping`);
          continue;
        }
        this.runTask(task);
      }
    }
  }

  private async runTask(task: TaskDefinition): Promise<void> {
    this.runningTasks.add(task.name);
    const record: TaskRunRecord = {
      name: task.name,
      startedAt: new Date(),
      success: false,
    };

    try {
      await task.handler();
      record.success = true;
    } catch (err: any) {
      record.error = err?.message ?? String(err);
      console.error(`[AeroJS Scheduler] Task "${task.name}" failed:`, err);
    } finally {
      record.finishedAt = new Date();
      record.durationMs = record.finishedAt.getTime() - record.startedAt.getTime();
      this.runningTasks.delete(task.name);

      this.history.push(record);
      if (this.history.length > this.historyLimit) {
        this.history = this.history.slice(-this.historyLimit);
      }
    }
  }

  public getHistory(): TaskRunRecord[] {
    return [...this.history];
  }

  public getTasks(): TaskDefinition[] {
    return Array.from(this.tasks.values());
  }

  public enable(name: string): void {
    const task = this.tasks.get(name);
    if (task) task.enabled = true;
  }

  public disable(name: string): void {
    const task = this.tasks.get(name);
    if (task) task.enabled = false;
  }
}

export const Schedule = new Scheduler();

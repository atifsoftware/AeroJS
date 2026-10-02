/**
 * @file event-bus.ts
 * @description Domain Event Bus for AeroJS.
 * Implements the Reactive Event Bus pattern from Architecture Section 2.
 *
 * Enterprise domain events flow:
 *   PaymentReceived     → PostToGeneralLedgerListener, PrintReceiptListener
 *   UserRegistered      → SendWelcomeEmailListener, AssignDefaultRoleListener
 *   OrderPlaced         → ReserveInventoryListener, NotifyAdminListener
 *   RecordArchived      → PurgeCacheListener, AuditComplianceListener
 */

import type { AuditLogEntry } from '../audit/audit-trail.js';

// ─── Base Event ───────────────────────────────────────────────────────────────

export abstract class DomainEvent {
  public readonly occurredAt: Date = new Date();
  public readonly eventId: string;

  constructor() {
    this.eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Override to return the event name used for listener registration.
   * Default: class name, e.g. "LabResultReadyEvent"
   */
  public eventName(): string {
    return this.constructor.name;
  }
}

// ─── Listener Interface ───────────────────────────────────────────────────────

export interface EventListener<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void> | void;
}

export type EventListenerFn<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;

export type ListenerOrFn<T extends DomainEvent> = EventListener<T> | EventListenerFn<T>;

// ─── Event Bus ────────────────────────────────────────────────────────────────

export class EventBus {
  private listeners = new Map<string, ListenerOrFn<any>[]>();
  private onceListeners = new Map<string, ListenerOrFn<any>[]>();

  /**
   * Register a permanent listener for an event.
   *
   * @example
   * EventBus.on('LabResultReadyEvent', SendLabResultSmsListener);
   * EventBus.on('PaymentReceivedEvent', async (event) => { ... });
   */
  public on<T extends DomainEvent>(
    eventNameOrClass: string | (new (...args: any[]) => T),
    listener: ListenerOrFn<T>
  ): this {
    const name = typeof eventNameOrClass === 'string' ? eventNameOrClass : eventNameOrClass.name;
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name)!.push(listener);
    return this;
  }

  /**
   * Register a one-time listener (removed after first dispatch).
   */
  public once<T extends DomainEvent>(
    eventNameOrClass: string | (new (...args: any[]) => T),
    listener: ListenerOrFn<T>
  ): this {
    const name = typeof eventNameOrClass === 'string' ? eventNameOrClass : eventNameOrClass.name;
    if (!this.onceListeners.has(name)) this.onceListeners.set(name, []);
    this.onceListeners.get(name)!.push(listener);
    return this;
  }

  /**
   * Remove a listener.
   */
  public off<T extends DomainEvent>(
    eventNameOrClass: string | (new (...args: any[]) => T),
    listener: ListenerOrFn<T>
  ): this {
    const name = typeof eventNameOrClass === 'string' ? eventNameOrClass : eventNameOrClass.name;
    const list = this.listeners.get(name);
    if (list) {
      this.listeners.set(name, list.filter((l) => l !== listener));
    }
    return this;
  }

  /**
   * Dispatches an event to all registered listeners.
   * Listeners run in registration order. Errors are caught per-listener.
   *
   * @example
   * await EventBus.emit(new LabResultReadyEvent({ encounterId, testId, isPanic: true }));
   */
  public async emit<T extends DomainEvent>(event: T): Promise<void> {
    const name = event.eventName();
    const allListeners = [
      ...(this.listeners.get(name) ?? []),
    ];

    // Fire-and-forget once listeners
    const onceList = this.onceListeners.get(name) ?? [];
    this.onceListeners.delete(name);
    allListeners.push(...onceList);

    for (const listener of allListeners) {
      try {
        if (typeof listener === 'function') {
          await (listener as EventListenerFn<T>)(event);
        } else {
          await (listener as EventListener<T>).handle(event);
        }
      } catch (err) {
        console.error(`[AeroJS EventBus] Listener for "${name}" threw an error:`, err);
      }
    }
  }

  /**
   * Dispatches an event asynchronously in the background (fire-and-forget).
   * The current request does not wait for listeners to complete.
   *
   * Example: After saving a payment, fire PostToGeneralLedgerEvent in background.
   */
  public emitAsync<T extends DomainEvent>(event: T): void {
    setImmediate(() => {
      this.emit(event).catch((err) => {
        console.error(`[AeroJS EventBus] Async emit error for "${event.eventName()}":`, err);
      });
    });
  }

  /**
   * Remove all listeners for a specific event (useful in tests).
   */
  public removeAllListeners(eventName?: string): this {
    if (eventName) {
      this.listeners.delete(eventName);
      this.onceListeners.delete(eventName);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
    return this;
  }

  /**
   * Returns the count of registered listeners for an event.
   */
  public listenerCount(eventName: string): number {
    return (this.listeners.get(eventName) ?? []).length;
  }
}

// ─── Singleton EventBus ───────────────────────────────────────────────────────

export const Events = new EventBus();

// ─── Canonical Domain Events ───────────────────────────────────────────────────

/** Fired when a user registers or is onboarded. */
export class UserRegisteredEvent extends DomainEvent {
  constructor(public readonly data: {
    userId: string | number;
    email: string;
    role?: string;
    metadata?: Record<string, unknown>;
  }) { super(); }
}

/** Fired when an order or transaction is placed. */
export class OrderPlacedEvent extends DomainEvent {
  constructor(public readonly data: {
    orderId: string | number;
    userId: string | number;
    totalAmount: number;
    currency?: string;
    itemsCount: number;
  }) { super(); }
}

/** Fired when a payment is processed. */
export class PaymentReceivedEvent extends DomainEvent {
  constructor(public readonly data: {
    invoiceId: string | number;
    amount: number;
    payerId: string | number;
    paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'gateway';
    transactionRef?: string;
  }) { super(); }
}

/** Fired when a record or resource is archived. */
export class RecordArchivedEvent extends DomainEvent {
  constructor(public readonly data: {
    resourceId: string | number;
    resourceType: string;
    archivedBy: string | number;
    reason?: string;
  }) { super(); }
}

/** Fired when a resource quantity or stock falls below threshold. */
export class LowStockAlertEvent extends DomainEvent {
  constructor(public readonly data: {
    itemId: string | number;
    itemName: string;
    currentQty: number;
    threshold: number;
  }) { super(); }
}

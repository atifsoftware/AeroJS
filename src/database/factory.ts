/**
 * @file factory.ts
 * @description Model Factories for automated database seeding and testing.
 */

import { Model } from './model.js';

export type FactoryDefinition<T extends Model> = () => Partial<T>;

export class ModelFactory<T extends Model> {
  private ModelClass: new (...args: any[]) => T;
  private definitionFn: FactoryDefinition<T>;
  private states: Map<string, FactoryDefinition<T>> = new Map();
  private activeStates: string[] = [];

  /**
   * Define the factory base blueprint for a given Model.
   */
  public static define<T extends Model>(
    modelClass: new (...args: any[]) => T,
    definition: FactoryDefinition<T>
  ): ModelFactory<T> {
    return new ModelFactory(modelClass, definition);
  }

  private constructor(modelClass: new (...args: any[]) => T, definition: FactoryDefinition<T>) {
    this.ModelClass = modelClass;
    this.definitionFn = definition;
  }

  /**
   * Register a named state variation for the factory.
   */
  public state(name: string, stateFn: FactoryDefinition<T>): this {
    this.states.set(name, stateFn);
    return this;
  }

  /**
   * Apply a registered state variation to the current factory execution.
   */
  public applyState(name: string): this {
    if (!this.states.has(name)) {
      throw new Error(`State '${name}' is not defined for this factory.`);
    }
    this.activeStates.push(name);
    return this;
  }

  private buildAttributes(overrides: Partial<T> = {}): Partial<T> {
    let attributes = this.definitionFn();

    for (const stateName of this.activeStates) {
      const stateFn = this.states.get(stateName);
      if (stateFn) {
        attributes = { ...attributes, ...stateFn() };
      }
    }

    return { ...attributes, ...overrides };
  }

  /**
   * Create an in-memory Model instance without persisting it to the database.
   */
  public make(overrides: Partial<T> = {}): T {
    const attributes = this.buildAttributes(overrides);
    return new this.ModelClass(attributes);
  }

  /**
   * Create and persist a Model instance to the database.
   */
  public async create(overrides: Partial<T> = {}, connectionOrAdapter?: any): Promise<T> {
    const instance = this.make(overrides);
    await instance.save(connectionOrAdapter);
    return instance;
  }

  /**
   * Create and persist multiple Model instances to the database.
   */
  public async createMany(count: number, overrides: Partial<T> = {}, connectionOrAdapter?: any): Promise<T[]> {
    const instances: T[] = [];
    for (let i = 0; i < count; i++) {
      instances.push(await this.create(overrides, connectionOrAdapter));
    }
    return instances;
  }
}

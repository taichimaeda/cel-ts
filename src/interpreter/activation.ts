// CEL Activation
// Activation interface for variable resolution
// Implementation based on cel-go's interpret/activation.go

import {
  DefaultTypeAdapter,
  ErrorValue,
  type TypeAdapter,
  UnknownValue,
  type Value,
} from "./values";

/**
 * Activation provides variable bindings for expression evaluation.
 */
export interface Activation {
  /**
   * Resolve a variable by name.
   * Returns undefined if the variable is not found.
   */
  resolve(name: string): Value | undefined;

  /**
   * Parent activation for hierarchical scoping.
   */
  parent(): Activation | undefined;
}

/**
 * Empty activation that resolves no variables
 */
export class EmptyActivation implements Activation {
  constructor() {}

  resolve(_name: string): Value | undefined {
    return undefined;
  }

  parent(): Activation | undefined {
    return undefined;
  }
}

/**
 * Map-based activation that resolves variables from a Map
 */
export class MapActivation implements Activation {
  private readonly bindings: Map<string, Value>;
  private readonly parentActivation: Activation | undefined;

  constructor(bindings: Map<string, Value>, parent?: Activation) {
    this.bindings = bindings;
    this.parentActivation = parent;
  }

  resolve(name: string): Value | undefined {
    const value = this.bindings.get(name);
    if (value !== undefined) {
      return value;
    }
    return this.parentActivation?.resolve(name);
  }

  parent(): Activation | undefined {
    return this.parentActivation;
  }
}

/**
 * Activation that converts native JavaScript values to CEL values on access
 */
export class LazyActivation implements Activation {
  private readonly bindings: Map<string, unknown>;
  private readonly adapter: TypeAdapter;
  private readonly cache: Map<string, Value>;
  private readonly parentActivation: Activation | undefined;

  constructor(
    bindings: Map<string, unknown> | Record<string, unknown>,
    adapter?: TypeAdapter,
    parent?: Activation
  ) {
    if (bindings instanceof Map) {
      this.bindings = bindings;
    } else {
      this.bindings = new Map(Object.entries(bindings));
    }
    this.adapter = adapter ?? new DefaultTypeAdapter();
    this.cache = new Map();
    this.parentActivation = parent;
  }

  resolve(name: string): Value | undefined {
    // Check cache
    const cached = this.cache.get(name);
    if (cached !== undefined) {
      return cached;
    }

    // Check bindings
    if (this.bindings.has(name)) {
      const nativeValue = this.bindings.get(name);
      const value = this.adapter.nativeToValue(nativeValue);
      this.cache.set(name, value);
      return value;
    }

    // Delegate to parent
    return this.parentActivation?.resolve(name);
  }

  parent(): Activation | undefined {
    return this.parentActivation;
  }
}

/**
 * Hierarchical activation that chains multiple activations
 */
export class HierarchicalActivation implements Activation {
  private readonly child: Activation;
  private readonly parentActivation: Activation;

  constructor(parent: Activation, child: Activation) {
    this.parentActivation = parent;
    this.child = child;
  }

  resolve(name: string): Value | undefined {
    const value = this.child.resolve(name);
    if (value !== undefined) {
      return value;
    }
    return this.parentActivation.resolve(name);
  }

  parent(): Activation | undefined {
    return this.parentActivation;
  }
}

/**
 * Activation with variable scope tracking for comprehensions
 */
export class PartialActivation implements Activation {
  private readonly delegate: Activation;
  private readonly unknowns: Set<string>;

  constructor(delegate: Activation, unknownVariables: string[]) {
    this.delegate = delegate;
    this.unknowns = new Set(unknownVariables);
  }

  resolve(name: string): Value | undefined {
    // Return UnknownValue for unknown variables
    if (this.unknowns.has(name)) {
      return UnknownValue.Instance;
    }
    return this.delegate.resolve(name);
  }

  parent(): Activation | undefined {
    return this.delegate.parent();
  }

  /**
   * Mark a variable as unknown
   */
  markUnknown(name: string): void {
    this.unknowns.add(name);
  }

  /**
   * Check if a variable is marked as unknown
   */
  isUnknown(name: string): boolean {
    return this.unknowns.has(name);
  }
}

/**
 * Mutable activation that allows variable updates during evaluation
 * Used for iteration variables in comprehensions
 */
export class MutableActivation implements Activation {
  private readonly bindings: Map<string, Value>;
  private readonly parentActivation: Activation | undefined;

  constructor(parent?: Activation) {
    this.bindings = new Map();
    this.parentActivation = parent;
  }

  resolve(name: string): Value | undefined {
    const value = this.bindings.get(name);
    if (value !== undefined) {
      return value;
    }
    return this.parentActivation?.resolve(name);
  }

  parent(): Activation | undefined {
    return this.parentActivation;
  }

  /**
   * Set a variable value
   */
  set(name: string, value: Value): void {
    this.bindings.set(name, value);
  }

  /**
   * Delete a variable
   */
  delete(name: string): boolean {
    return this.bindings.delete(name);
  }

  /**
   * Clear all bindings
   */
  clear(): void {
    this.bindings.clear();
  }
}

/**
 * Activation that provides error values for undefined variables
 */
export class StrictActivation implements Activation {
  private readonly delegate: Activation;

  constructor(delegate: Activation) {
    this.delegate = delegate;
  }

  resolve(name: string): Value | undefined {
    const value = this.delegate.resolve(name);
    if (value === undefined) {
      return ErrorValue.create(`undeclared variable: ${name}`);
    }
    return value;
  }

  parent(): Activation | undefined {
    return this.delegate.parent();
  }
}

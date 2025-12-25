// CEL Activation
// Activation interface for variable resolution
// Implementation based on cel-go's interpret/activation.go

import { nativeToValue } from "./utils";
import { ErrorValue, UnknownValue, type Value } from "./values";

export type Activation =
  | EmptyActivation
  | MapActivation
  | LazyActivation
  | HierarchicalActivation
  | PartialActivation
  | MutableActivation
  | StrictActivation;

/**
 * Empty activation that resolves no variables
 */
export class EmptyActivation {
  constructor() { }

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
export class MapActivation {
  constructor(
    private readonly bindings: Map<string, Value>,
    private readonly parentActivation?: Activation
  ) { }

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
export class LazyActivation {
  private readonly bindings: Map<string, unknown>;
  private readonly cache: Map<string, Value>;

  constructor(
    bindings: Map<string, unknown> | Record<string, unknown>,
    private readonly parentActivation?: Activation
  ) {
    if (bindings instanceof Map) {
      this.bindings = bindings;
    } else {
      this.bindings = new Map(Object.entries(bindings));
    }
    this.cache = new Map();
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
      const value = nativeToValue(nativeValue);
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
export class HierarchicalActivation {
  constructor(
    private readonly parentActivation: Activation,
    private readonly child: Activation
  ) { }

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
export class PartialActivation {
  private readonly unknowns: Set<string>;

  constructor(
    private readonly delegate: Activation,
    unknownVariables: string[]
  ) {
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
export class MutableActivation {
  private readonly bindings: Map<string, Value>;

  constructor(private readonly parentActivation?: Activation) {
    this.bindings = new Map();
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
export class StrictActivation {
  constructor(private readonly delegate: Activation) { }

  resolve(name: string): Value | undefined {
    const value = this.delegate.resolve(name);
    if (value === undefined) {
      return ErrorValue.of(`undeclared variable: ${name}`);
    }
    return value;
  }

  parent(): Activation | undefined {
    return this.delegate.parent();
  }
}

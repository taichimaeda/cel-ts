// CEL Function Dispatcher
// Function call dispatcher
// Implementation based on cel-go's interpret/dispatcher.go

import { ErrorValue, type Value, isError } from "./values";

/**
 * Overload represents a single function overload.
 */
export interface Overload {
  /**
   * Unique identifier for this overload.
   */
  id: string;

  /**
   * Whether this is a unary function.
   */
  unary?: UnaryOp | undefined;

  /**
   * Whether this is a binary function.
   */
  binary?: BinaryOp | undefined;

  /**
   * Whether this is a function with variable arguments.
   */
  nary?: FunctionOp | undefined;

  /**
   * Non-strict function evaluation (receives unevaluated args).
   */
  nonStrict?: boolean | undefined;
}

/**
 * Represents a unary dispatcher overload.
 */
export class UnaryDispatcherOverload implements Overload {
  readonly id: string;
  readonly unary: UnaryOp;

  constructor(id: string, op: UnaryOp) {
    this.id = id;
    this.unary = op;
  }
}

/**
 * Represents a binary dispatcher overload.
 */
export class BinaryDispatcherOverload implements Overload {
  readonly id: string;
  readonly binary: BinaryOp;

  constructor(id: string, op: BinaryOp) {
    this.id = id;
    this.binary = op;
  }
}

/**
 * Represents a variadic dispatcher overload.
 */
export class VariadicDispatcherOverload implements Overload {
  readonly id: string;
  readonly nary: FunctionOp;
  readonly nonStrict?: boolean;

  constructor(id: string, op: FunctionOp, options: { nonStrict?: boolean } = {}) {
    this.id = id;
    this.nary = op;
    this.nonStrict = options.nonStrict ?? false;
  }
}

function invokeOverload(overload: Overload, args: Value[]): Value | undefined {
  if (overload.unary && args.length === 1) {
    const [arg] = args;
    if (!arg) {
      return undefined;
    }
    return overload.unary(arg);
  }
  if (overload.binary && args.length === 2) {
    const [left, right] = args;
    if (!(left && right)) {
      return undefined;
    }
    return overload.binary(left, right);
  }
  if (overload.nary) {
    return overload.nary(args);
  }
  return undefined;
}

/**
 * Unary operation type.
 */
export type UnaryOp = (value: Value) => Value;

/**
 * Binary operation type.
 */
export type BinaryOp = (lhs: Value, rhs: Value) => Value;

/**
 * Function operation type (variable arguments).
 */
export type FunctionOp = (values: Value[]) => Value;

/**
 * Dispatcher resolves function calls to their implementations.
 */
export interface Dispatcher {
  /**
   * Add an overload to the dispatcher.
   */
  add(overload: Overload): void;

  /**
   * Find overloads by function name.
   */
  findOverloads(name: string): Overload[];

  /**
   * Find a specific overload by ID.
   */
  findOverload(overloadId: string): Overload | undefined;

  /**
   * Get all registered overload IDs.
   */
  overloadIds(): string[];
}

/**
 * Default dispatcher implementation.
 */
export class DefaultDispatcher implements Dispatcher {
  private readonly overloads: Map<string, Overload> = new Map();
  private readonly nameToOverloads: Map<string, Overload[]> = new Map();

  add(overload: Overload): void {
    this.overloads.set(overload.id, overload);

    // Update the mapping from function name to overloads
    const name = this.extractFunctionName(overload.id);
    const existing = this.nameToOverloads.get(name) ?? [];
    existing.push(overload);
    this.nameToOverloads.set(name, existing);
  }

  findOverloads(name: string): Overload[] {
    return this.nameToOverloads.get(name) ?? [];
  }

  findOverload(overloadId: string): Overload | undefined {
    return this.overloads.get(overloadId);
  }

  overloadIds(): string[] {
    return [...this.overloads.keys()];
  }

  /**
   * Extract base function name from overload ID.
   */
  private extractFunctionName(overloadId: string): string {
    // Overload ID is typically in the format "function_type1_type2"
    const underscoreIndex = overloadId.indexOf("_");
    if (underscoreIndex === -1) {
      return overloadId;
    }
    return overloadId.substring(0, underscoreIndex);
  }
}

/**
 * Function call represents a resolved function call.
 */
export interface FunctionCall {
  /**
   * Execute the function with given arguments.
   */
  invoke(args: Value[]): Value;

  /**
   * The overload ID for this call.
   */
  overloadId(): string;

  /**
   * Whether this is a non-strict function.
   */
  isNonStrict(): boolean;
}

/**
 * Resolved function call implementation.
 */
export class ResolvedCall implements FunctionCall {
  private readonly overload: Overload;

  constructor(overload: Overload) {
    this.overload = overload;
  }

  invoke(args: Value[]): Value {
    const result = invokeOverload(this.overload, args);
    if (result === undefined) {
      return ErrorValue.create(
        `no matching implementation for overload '${this.overload.id}' with ${args.length} arguments`
      );
    }
    return result;
  }

  overloadId(): string {
    return this.overload.id;
  }

  isNonStrict(): boolean {
    return this.overload.nonStrict ?? false;
  }
}

/**
 * Try all overloads until one succeeds.
 */
export class TryAllResolvedCall implements FunctionCall {
  private readonly overloads: Overload[];

  constructor(overloads: Overload[]) {
    this.overloads = overloads;
  }

  invoke(args: Value[]): Value {
    let lastError: Value | undefined;

    for (const overload of this.overloads) {
      const result = invokeOverload(overload, args);
      if (result === undefined) {
        continue;
      }

      // Return result if not an error
      if (!isError(result)) {
        return result;
      }
      lastError = result;
    }

    // If all failed, return the last error
    return (
      lastError ??
      ErrorValue.create(`no matching overload for function with ${args.length} arguments`)
    );
  }

  overloadId(): string {
    return this.overloads[0]?.id ?? "unknown";
  }

  isNonStrict(): boolean {
    return this.overloads.some((o) => o.nonStrict);
  }
}

/**
 * Function resolver for matching arguments to overloads.
 */
export class FunctionResolver {
  private readonly dispatcher: Dispatcher;

  constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
  }

  /**
   * Resolve a function call by name and arguments.
   */
  resolve(name: string, args: Value[]): FunctionCall | undefined {
    const overloads = this.dispatcher.findOverloads(name);
    if (overloads.length === 0) {
      return undefined;
    }

    // Collect all overloads that may match
    const candidates: Overload[] = [];
    for (const overload of overloads) {
      if (this.matches(overload, args)) {
        candidates.push(overload);
      }
    }

    if (candidates.length === 0) {
      return undefined;
    }

    // If there are multiple candidates, return TryAllResolvedCall
    if (candidates.length > 1) {
      return new TryAllResolvedCall(candidates);
    }

    const [firstCandidate] = candidates;
    if (!firstCandidate) {
      return undefined;
    }
    return new ResolvedCall(firstCandidate);
  }

  /**
   * Resolve a function call by specific overload ID.
   */
  resolveOverload(overloadId: string): FunctionCall | undefined {
    const overload = this.dispatcher.findOverload(overloadId);
    if (overload) {
      return new ResolvedCall(overload);
    }
    return undefined;
  }

  /**
   * Check if an overload matches the given arguments.
   */
  private matches(overload: Overload, args: Value[]): boolean {
    // For unary operators
    if (overload.unary) {
      if (args.length !== 1) {
        return false;
      }
      return args[0] !== undefined;
    }

    // For binary operators
    if (overload.binary) {
      if (args.length !== 2) {
        return false;
      }
      return args[0] !== undefined && args[1] !== undefined;
    }

    // For variable argument functions
    if (overload.nary) {
      return true;
    }

    return false;
  }
}

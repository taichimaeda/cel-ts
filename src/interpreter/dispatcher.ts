// CEL Function Dispatcher
// Function call dispatcher
// Implementation based on cel-go's interpret/dispatcher.go

import { ErrorValue, type Value, isErrorValue } from "./values";

/**
 * Dispatcher overload variants for unary, binary, or n-ary functions.
 */
export type Overload = UnaryDispatcherOverload | BinaryDispatcherOverload | NaryDispatcherOverload;

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
 * Represents a unary dispatcher overload.
 */
export class UnaryDispatcherOverload {
  readonly kind = "unary";
  readonly nonStrict?: boolean;

  constructor(
    readonly id: string,
    readonly unary: UnaryOp,
    options: { nonStrict?: boolean } = {}
  ) {
    this.nonStrict = options.nonStrict ?? false;
  }

  invoke(args: Value[]): Value | undefined {
    if (args.length !== 1) {
      return undefined;
    }
    const [arg] = args;
    if (arg === undefined) {
      return undefined;
    }
    return this.unary(arg);
  }
}

/**
 * Represents a binary dispatcher overload.
 */
export class BinaryDispatcherOverload {
  readonly kind = "binary";
  readonly nonStrict?: boolean;

  constructor(
    readonly id: string,
    readonly binary: BinaryOp,
    options: { nonStrict?: boolean } = {}
  ) {
    this.nonStrict = options.nonStrict ?? false;
  }

  invoke(args: Value[]): Value | undefined {
    if (args.length !== 2) {
      return undefined;
    }
    const [left, right] = args;
    if (left === undefined || right === undefined) {
      return undefined;
    }
    return this.binary(left, right);
  }
}

/**
 * Represents a variadic dispatcher overload.
 */
export class NaryDispatcherOverload {
  readonly kind = "nary";
  readonly nonStrict?: boolean;

  constructor(
    readonly id: string,
    readonly nary: FunctionOp,
    options: { nonStrict?: boolean } = {}
  ) {
    this.nonStrict = options.nonStrict ?? false;
  }

  invoke(args: Value[]): Value | undefined {
    return this.nary(args);
  }
}

type ResolvedCall = TryResolvedCall | TryAllResolvedCall;

/**
 * Resolved function call implementation.
 */
class TryResolvedCall {
  constructor(private readonly overload: Overload) {}

  invoke(args: Value[]): Value {
    const result = this.overload.invoke(args);
    if (result === undefined) {
      return ErrorValue.of(
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
class TryAllResolvedCall {
  constructor(private readonly overloads: Overload[]) {}

  invoke(args: Value[]): Value {
    let lastError: Value | undefined;

    for (const overload of this.overloads) {
      const result = overload.invoke(args);
      if (result === undefined) {
        continue;
      }

      // Return result if not an error
      if (!isErrorValue(result)) {
        return result;
      }
      lastError = result;
    }

    // If all failed, return the last error
    return (
      lastError ?? ErrorValue.of(`no matching overload for function with ${args.length} arguments`)
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
 * Function dispatcher implementation.
 */
export class Dispatcher {
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

  findOverloadById(id: string): Overload | undefined {
    return this.overloads.get(id);
  }

  findOverloadsByName(name: string): Overload[] {
    return this.nameToOverloads.get(name) ?? [];
  }

  resolve(name: string, args: Value[]): ResolvedCall | undefined {
    const overloads = this.findOverloadsByName(name);
    if (overloads.length === 0) {
      return undefined;
    }

    const candidates: Overload[] = [];
    for (const overload of overloads) {
      if (this.matches(overload, args)) {
        candidates.push(overload);
      }
    }

    if (candidates.length === 0) {
      return undefined;
    }

    if (candidates.length > 1) {
      return new TryAllResolvedCall(candidates);
    }

    const [firstCandidate] = candidates;
    if (firstCandidate === undefined) {
      return undefined;
    }
    return new TryResolvedCall(firstCandidate);
  }

  resolveOverload(overloadId: string): ResolvedCall | undefined {
    const overload = this.findOverloadById(overloadId);
    if (overload !== undefined) {
      return new TryResolvedCall(overload);
    }
    return undefined;
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

  private matches(overload: Overload, args: Value[]): boolean {
    if (overload instanceof UnaryDispatcherOverload) {
      return args.length === 1 && args[0] !== undefined;
    }
    if (overload instanceof BinaryDispatcherOverload) {
      return args.length === 2 && args[0] !== undefined && args[1] !== undefined;
    }
    return true;
  }
}

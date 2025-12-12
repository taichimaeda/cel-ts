// CEL Declarations
// Variable and function declarations for type checking

import type { Type } from "./types";

/**
 * Represents a variable declaration with a name and type
 */
export class VariableDecl {
  readonly name: string;
  readonly type: Type;

  constructor(name: string, type: Type) {
    this.name = name;
    this.type = type;
  }
}

/**
 * Represents a function overload (one specific signature)
 */
export class OverloadDecl {
  readonly id: string;
  readonly argTypes: readonly Type[];
  readonly resultType: Type;
  readonly typeParams: readonly string[];
  readonly isMemberFunction: boolean;

  constructor(
    id: string,
    argTypes: Type[],
    resultType: Type,
    typeParams: string[] = [],
    isMemberFunction = false
  ) {
    this.id = id;
    this.argTypes = Object.freeze(argTypes);
    this.resultType = resultType;
    this.typeParams = Object.freeze(typeParams);
    this.isMemberFunction = isMemberFunction;
  }

  /**
   * Check if this overload has type parameters (is parametric/generic)
   */
  isParametric(): boolean {
    return this.typeParams.length > 0;
  }

  /**
   * Get the number of arguments (excluding receiver for member functions)
   */
  argCount(): number {
    return this.argTypes.length;
  }
}

/**
 * Represents a function declaration with multiple overloads
 */
export class FunctionDecl {
  readonly name: string;
  private readonly overloadMap: Map<string, OverloadDecl> = new Map();
  private readonly overloadOrder: string[] = [];
  private disabledOverloads: Set<string> = new Set();

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Add an overload to this function
   */
  addOverload(overload: OverloadDecl): this {
    if (!this.overloadMap.has(overload.id)) {
      this.overloadOrder.push(overload.id);
    }
    this.overloadMap.set(overload.id, overload);
    return this;
  }

  /**
   * Get all overloads in declaration order
   */
  overloads(): OverloadDecl[] {
    return this.overloadOrder
      .filter((id) => !this.disabledOverloads.has(id))
      .map((id) => this.overloadMap.get(id))
      .filter((overload): overload is OverloadDecl => overload !== undefined);
  }

  /**
   * Get a specific overload by ID
   */
  getOverload(id: string): OverloadDecl | undefined {
    return this.overloadMap.get(id);
  }

  /**
   * Check if this function has any member-style overloads
   */
  hasMemberOverloads(): boolean {
    return this.overloads().some((o) => o.isMemberFunction);
  }

  /**
   * Disable a specific overload
   */
  disableOverload(id: string): void {
    this.disabledOverloads.add(id);
  }

  /**
   * Merge another function declaration's overloads into this one
   */
  merge(other: FunctionDecl): this {
    for (const overload of other.overloads()) {
      this.addOverload(overload);
    }
    return this;
  }

  /**
   * Create a copy of this function declaration
   */
  copy(): FunctionDecl {
    const fn = new FunctionDecl(this.name);
    for (const overload of this.overloads()) {
      fn.addOverload(overload);
    }
    fn.disabledOverloads = new Set(this.disabledOverloads);
    return fn;
  }
}

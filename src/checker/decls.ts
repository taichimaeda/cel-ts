// CEL Declarations
// Variable and function declarations for type checking

import { StructType, type Type } from "./types";

/**
 * Represents a variable declaration with a name and type
 */
export class VariableDecl {
  constructor(
    readonly name: string,
    readonly type: Type
  ) {}
}

/**
 * Represents a constant declaration with a name, type, and compile-time value.
 * Constants are folded into the AST at compile time.
 */
export class ConstantDecl {
  constructor(
    readonly name: string,
    readonly type: Type,
    readonly value: unknown
  ) {}
}

/**
 * Represents a struct field declaration
 */
export class StructFieldDecl {
  constructor(
    readonly name: string,
    readonly type: Type
  ) {}
}

/**
 * Represents a struct type declaration with named fields
 */
export class StructDecl {
  readonly fields: readonly StructFieldDecl[];
  readonly type: StructType;
  private readonly fieldMap: Map<string, Type>;

  constructor(
    readonly name: string,
    fields: StructFieldDecl[]
  ) {
    this.fields = [...fields];
    this.type = new StructType(name);
    this.fieldMap = new Map(this.fields.map((field) => [field.name, field.type]));
  }

  fieldType(fieldName: string): Type | undefined {
    return this.fieldMap.get(fieldName);
  }

  fieldNames(): string[] {
    return [...this.fieldMap.keys()];
  }
}

/**
 * Represents a function overload (one specific signature)
 */
export class FunctionOverloadDecl {
  readonly argTypes: readonly Type[];
  readonly typeParams: readonly string[];

  constructor(
    readonly id: string,
    argTypes: Type[],
    readonly resultType: Type,
    typeParams: string[] = [],
    readonly isMemberFunction = false
  ) {
    this.argTypes = [...argTypes];
    this.typeParams = [...typeParams];
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
  private readonly overloadMap: Map<string, FunctionOverloadDecl> = new Map();
  private readonly overloadOrder: string[] = [];
  private disabledOverloads: Set<string> = new Set();

  constructor(readonly name: string) {}

  /**
   * Add an overload to this function
   */
  addOverload(overload: FunctionOverloadDecl): this {
    if (!this.overloadMap.has(overload.id)) {
      this.overloadOrder.push(overload.id);
    }
    this.overloadMap.set(overload.id, overload);
    return this;
  }

  /**
   * Get all overloads in declaration order
   */
  overloads(): FunctionOverloadDecl[] {
    return this.overloadOrder
      .filter((id) => !this.disabledOverloads.has(id))
      .map((id) => this.overloadMap.get(id))
      .filter((overload): overload is FunctionOverloadDecl => overload !== undefined);
  }

  /**
   * Get a specific overload by ID
   */
  getOverload(id: string): FunctionOverloadDecl | undefined {
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
    const func = new FunctionDecl(this.name);
    for (const overload of this.overloads()) {
      func.addOverload(overload);
    }
    func.disabledOverloads = new Set(this.disabledOverloads);
    return func;
  }
}

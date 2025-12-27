// CEL Checker Environment
// Manages scopes, declarations, and lookups for type checking

import type { ConstantDecl, FunctionDecl, VariableDecl } from "./decls";
import type { TypeProvider } from "./provider";
import {
  IntType,
  ListType,
  MapType,
  PolymorphicTypeType,
  type Type,
  builtinTypeNameToType,
} from "./types";

/**
 * A single scope level containing declarations
 */
class Scope {
  private readonly variables: Map<string, VariableDecl> = new Map();
  private readonly functions: Map<string, FunctionDecl> = new Map();

  /**
   * Add a variable declaration to this scope
   */
  addVariable(decl: VariableDecl): void {
    this.variables.set(decl.name, decl);
  }

  /**
   * Add a function declaration to this scope
   */
  addFunction(decl: FunctionDecl): void {
    const existing = this.functions.get(decl.name);
    if (existing !== undefined) {
      existing.merge(decl);
    } else {
      this.functions.set(decl.name, decl.copy());
    }
  }

  /**
   * Find a variable in this scope
   */
  findVariable(name: string): VariableDecl | undefined {
    return this.variables.get(name);
  }

  /**
   * Find a function in this scope
   */
  findFunction(name: string): FunctionDecl | undefined {
    return this.functions.get(name);
  }
}

/**
 * Hierarchical scope stack for nested scopes
 */
class Scopes {
  private readonly scope: Scope = new Scope();

  constructor(private readonly parent: Scopes | undefined = undefined) {}

  /**
   * Add a variable declaration to the current scope
   */
  addVariable(decl: VariableDecl): void {
    this.scope.addVariable(decl);
  }

  /**
   * Add a function declaration to the current scope
   */
  addFunction(decl: FunctionDecl): void {
    this.scope.addFunction(decl);
  }

  /**
   * Find a variable by searching from inner to outer scopes
   */
  findVariable(name: string): VariableDecl | undefined {
    const local = this.scope.findVariable(name);
    if (local !== undefined) return local;
    return this.parent?.findVariable(name);
  }

  /**
   * Find a variable only in the current scope (not parent scopes)
   */
  findVariableInScope(name: string): VariableDecl | undefined {
    return this.scope.findVariable(name);
  }

  /**
   * Find a function by searching from inner to outer scopes
   */
  findFunction(name: string): FunctionDecl | undefined {
    const local = this.scope.findFunction(name);
    if (local !== undefined) return local;
    return this.parent?.findFunction(name);
  }

  /**
   * Create a new child scope
   */
  push(): Scopes {
    return new Scopes(this);
  }

  /**
   * Return to the parent scope
   */
  pop(): Scopes | undefined {
    return this.parent;
  }
}

/**
 * Container for namespace resolution
 */
export class Container {
  private readonly aliases: Map<string, string> = new Map();

  constructor(readonly name = "") {}

  /**
   * Add a type alias
   */
  addAlias(alias: string, typeName: string): void {
    this.aliases.set(alias, typeName);
  }

  /**
   * Find a type alias
   */
  findAlias(alias: string): string | undefined {
    return this.aliases.get(alias);
  }

  /**
   * Resolve a name with container qualification
   * Returns candidate names from most specific to least specific
   */
  resolveCandidateNames(name: string): string[] {
    // Check for alias
    const aliased = this.aliases.get(name);
    if (aliased !== undefined) {
      return [aliased];
    }

    // If already qualified (contains dot), return as-is when it already matches the container.
    if (name.includes(".")) {
      if (this.name === "" || name.startsWith(`${this.name}.`)) {
        return [name];
      }
      const candidates: string[] = [];
      const parts = this.name.split(".");
      for (let i = parts.length; i >= 0; i--) {
        const prefix = parts.slice(0, i).join(".");
        const candidate = prefix ? `${prefix}.${name}` : name;
        candidates.push(candidate);
      }
      return candidates;
    }

    // If no container, return as-is
    if (this.name === "") {
      return [name];
    }

    // Generate candidates from container scope
    const candidates: string[] = [];
    const parts = this.name.split(".");

    // Add fully qualified name from each scope level
    for (let i = parts.length; i >= 0; i--) {
      const prefix = parts.slice(0, i).join(".");
      const candidate = prefix ? `${prefix}.${name}` : name;
      candidates.push(candidate);
    }

    return candidates;
  }

  /**
   * Create a nested container
   */
  extend(name: string): Container {
    const fullName = this.name ? `${this.name}.${name}` : name;
    return new Container(fullName);
  }
}

/**
 * Options for configuring checker environment behavior.
 */
interface CheckerEnvOptions {
  /** Coerce enum types to int during type checking. */
  coerceEnumToInt?: boolean;
}

/**
 * Environment for type checking
 * Manages scopes, declarations, and type resolution
 */
export class CheckerEnv {
  private scopes: Scopes = new Scopes();
  private disabledOverloads: Set<string> = new Set();
  private constants: Map<string, ConstantDecl> = new Map();

  constructor(
    readonly container: Container = new Container(),
    readonly provider?: TypeProvider | undefined,
    private readonly options: CheckerEnvOptions = {}
  ) {}

  /**
   * Add variable declarations to the environment
   */
  addVariables(...decls: VariableDecl[]): void {
    for (const decl of decls) {
      this.scopes.addVariable(decl);
    }
  }

  /**
   * Add constant declarations to the environment.
   * Constants are folded at compile time.
   */
  addConstants(...decls: ConstantDecl[]): void {
    for (const decl of decls) {
      this.constants.set(decl.name, decl);
    }
  }

  /**
   * Add function declarations to the environment
   */
  addFunctions(...decls: FunctionDecl[]): void {
    for (const decl of decls) {
      this.scopes.addFunction(decl);
    }
  }

  /**
   * Enable specific overloads by ID
   */
  enableOverloads(...ids: string[]): void {
    for (const id of ids) {
      this.disabledOverloads.delete(id);
    }
  }

  /**
   * Disable specific overloads by ID
   */
  disableOverloads(...ids: string[]): void {
    for (const id of ids) {
      this.disabledOverloads.add(id);
    }
  }

  /**
   * Check if an overload is disabled
   */
  isOverloadDisabled(id: string): boolean {
    return this.disabledOverloads.has(id);
  }

  /**
   * Look up an identifier (variable, type, or enum value)
   */
  lookupIdent(name: string): LookupResult | undefined {
    // Try candidate names with container resolution
    const candidates = this.container.resolveCandidateNames(name);

    for (const candidate of candidates) {
      // Check constant declarations first (constants are folded at compile time)
      const constDecl = this.constants.get(candidate);
      if (constDecl !== undefined) {
        return {
          name: candidate,
          type: this.coerceEnumToInt(constDecl.type),
          kind: "constant",
          value: constDecl.value,
        };
      }

      // Check variable declarations
      const varDecl = this.scopes.findVariable(candidate);
      if (varDecl !== undefined) {
        return {
          name: candidate,
          type: this.coerceEnumToInt(varDecl.type),
          kind: "variable",
        };
      }

      // Check built-in type identifiers
      const builtinType = builtinTypeNameToType(candidate);
      if (builtinType !== undefined) {
        return {
          name: candidate,
          type: new PolymorphicTypeType(this.coerceEnumToInt(builtinType)),
          kind: "type",
        };
      }

      // Check for type names (struct types)
      const structType = this.provider?.findStructType(candidate);
      if (structType !== undefined) {
        return {
          name: candidate,
          type: new PolymorphicTypeType(this.coerceEnumToInt(structType)),
          kind: "type",
        };
      }

      const enumType = this.provider?.findEnumType(candidate);
      if (enumType !== undefined) {
        return {
          name: candidate,
          type: new PolymorphicTypeType(enumType), // Do not coerce enum to int here
          kind: "type",
        };
      }

      // Check for enum values
      const lastDot = candidate.lastIndexOf(".");
      if (lastDot <= 0 || lastDot === candidate.length - 1) {
        continue;
      }
      const enumName = candidate.slice(0, lastDot);
      const valueName = candidate.slice(lastDot + 1);
      const enumTypeByName = this.provider?.findEnumType(enumName);
      const enumValueByName = this.provider?.findEnumValue(enumName, valueName);
      if (enumValueByName !== undefined && enumTypeByName !== undefined) {
        return {
          name: candidate,
          type: this.coerceEnumToInt(enumTypeByName ?? IntType),
          kind: "enum",
          value: enumValueByName,
        };
      }
    }

    return undefined;
  }

  /**
   * Look up a function by name
   */
  lookupFunction(name: string): FunctionDecl | undefined {
    const candidates = this.container.resolveCandidateNames(name);

    for (const candidate of candidates) {
      const func = this.scopes.findFunction(candidate);
      if (func !== undefined) {
        return func;
      }
    }

    return undefined;
  }

  /**
   * Look up a struct type by name with container resolution
   */
  lookupStructType(name: string): Type | undefined {
    const candidates = this.container.resolveCandidateNames(name);
    for (const candidate of candidates) {
      const structType = this.provider?.findStructType(candidate);
      if (structType !== undefined) {
        return this.coerceEnumToInt(structType);
      }
    }
    return undefined;
  }

  /**
   * Look up a struct field type
   */
  lookupFieldType(structType: Type, fieldName: string): Type | undefined {
    if (structType.kind !== "struct") {
      return undefined;
    }
    const fieldType = this.provider?.findStructFieldType(structType.runtimeTypeName, fieldName);
    if (fieldType !== undefined) {
      return this.coerceEnumToInt(fieldType);
    }
    return fieldType;
  }

  /**
   * Enter a new nested scope (for comprehensions, etc.)
   */
  enterScope(): CheckerEnv {
    const env = new CheckerEnv(this.container, this.provider, { ...this.options });
    env.scopes = this.scopes.push();
    return env;
  }

  /**
   * Exit the current scope, returning to the parent
   */
  exitScope(): CheckerEnv {
    const parent = this.scopes.pop();
    if (parent === undefined) {
      return this;
    }
    const env = new CheckerEnv(this.container, this.provider, { ...this.options });
    env.scopes = parent;
    return env;
  }

  private coerceEnumToInt(type: Type): Type {
    if (type === undefined) {
      return type;
    }
    if (!this.options.coerceEnumToInt) {
      return type;
    }

    if (type.kind === "opaque" && this.provider?.findEnumType(type.runtimeTypeName)) {
      return IntType;
    }
    if (type.kind === "list") {
      const elem = type.parameters[0];
      if (elem === undefined) {
        return type;
      }
      const newElem = this.coerceEnumToInt(elem);
      return newElem === elem ? type : new ListType(newElem);
    }
    if (type.kind === "map") {
      const keyType = type.parameters[0];
      const valType = type.parameters[1];
      if (keyType === undefined || valType === undefined) {
        return type;
      }
      const newKey = this.coerceEnumToInt(keyType);
      const newVal = this.coerceEnumToInt(valType);
      return newKey === keyType && newVal === valType ? type : new MapType(newKey, newVal);
    }
    return type;
  }
}

/**
 * Result of looking up an identifier
 */
export type LookupResult =
  | { kind: "variable"; name: string; type: Type }
  | { kind: "constant"; name: string; type: Type; value: unknown }
  | { kind: "type"; name: string; type: Type }
  | { kind: "enum"; name: string; type: Type; value: number };

// CEL Checker Environment
// Manages scopes, declarations, and lookups for type checking

import type { FunctionDecl, VariableDecl } from "./decls";
import { Type } from "./types";

/**
 * A single scope level containing declarations
 */
class Scope {
  private readonly idents: Map<string, VariableDecl> = new Map();
  private readonly functions: Map<string, FunctionDecl> = new Map();

  /**
   * Add a variable declaration to this scope
   */
  addIdent(decl: VariableDecl): void {
    this.idents.set(decl.name, decl);
  }

  /**
   * Add a function declaration to this scope
   */
  addFunction(decl: FunctionDecl): void {
    const existing = this.functions.get(decl.name);
    if (existing) {
      existing.merge(decl);
    } else {
      this.functions.set(decl.name, decl.copy());
    }
  }

  /**
   * Find a variable in this scope
   */
  findIdent(name: string): VariableDecl | undefined {
    return this.idents.get(name);
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
  private readonly parent: Scopes | null;
  private readonly scope: Scope;

  constructor(parent: Scopes | null = null) {
    this.parent = parent;
    this.scope = new Scope();
  }

  /**
   * Add a variable declaration to the current scope
   */
  addIdent(decl: VariableDecl): void {
    this.scope.addIdent(decl);
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
  findIdent(name: string): VariableDecl | undefined {
    const local = this.scope.findIdent(name);
    if (local) return local;
    return this.parent?.findIdent(name);
  }

  /**
   * Find a function by searching from inner to outer scopes
   */
  findFunction(name: string): FunctionDecl | undefined {
    const local = this.scope.findFunction(name);
    if (local) return local;
    return this.parent?.findFunction(name);
  }

  /**
   * Find a variable only in the current scope (not parent scopes)
   */
  findIdentInScope(name: string): VariableDecl | undefined {
    return this.scope.findIdent(name);
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
  pop(): Scopes | null {
    return this.parent;
  }
}

/**
 * Type provider interface for resolving struct field types
 */
export interface TypeProvider {
  /**
   * Find a struct type by name
   */
  findStructType(typeName: string): Type | undefined;

  /**
   * Find a field type within a struct
   */
  findStructFieldType(typeName: string, fieldName: string): Type | undefined;

  /**
   * Get all field names for a struct type
   */
  structFieldNames(typeName: string): string[];
}

/**
 * Default type provider that returns undefined for all lookups
 */
export class DefaultTypeProvider implements TypeProvider {
  findStructType(_typeName: string): Type | undefined {
    return undefined;
  }

  findStructFieldType(_typeName: string, _fieldName: string): Type | undefined {
    return undefined;
  }

  structFieldNames(_typeName: string): string[] {
    return [];
  }
}

/**
 * Container for namespace resolution
 */
export class Container {
  readonly name: string;
  private readonly aliases: Map<string, string> = new Map();

  constructor(name = "") {
    this.name = name;
  }

  /**
   * Add a type alias
   */
  addAlias(alias: string, typeName: string): void {
    this.aliases.set(alias, typeName);
  }

  /**
   * Resolve a name with container qualification
   * Returns candidate names from most specific to least specific
   */
  resolveCandidateNames(name: string): string[] {
    // Check for alias
    const aliased = this.aliases.get(name);
    if (aliased) {
      return [aliased];
    }

    // If already qualified (contains dot), return as-is
    if (name.includes(".")) {
      return [name];
    }

    // If no container, return as-is
    if (!this.name) {
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
 * Environment for type checking
 * Manages scopes, declarations, and type resolution
 */
export class CheckerEnv {
  private readonly container: Container;
  private readonly provider: TypeProvider;
  private scopes: Scopes;
  private readonly disabledOverloads: Set<string> = new Set();

  constructor(
    container: Container = new Container(),
    provider: TypeProvider = new DefaultTypeProvider()
  ) {
    this.container = container;
    this.provider = provider;
    this.scopes = new Scopes();
  }

  /**
   * Add variable declarations to the environment
   */
  addIdents(...decls: VariableDecl[]): void {
    for (const decl of decls) {
      this.scopes.addIdent(decl);
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
      // Check variable declarations
      const varDecl = this.scopes.findIdent(candidate);
      if (varDecl) {
        return {
          name: candidate,
          type: varDecl.type,
          kind: "variable",
        };
      }

      // Check for type names (struct types)
      const structType = this.provider.findStructType(candidate);
      if (structType) {
        return {
          name: candidate,
          type: Type.newTypeTypeWithParam(structType),
          kind: "type",
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
      const fn = this.scopes.findFunction(candidate);
      if (fn) {
        return fn;
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
    return this.provider.findStructFieldType(structType.runtimeTypeName, fieldName);
  }

  /**
   * Enter a new nested scope (for comprehensions, etc.)
   */
  enterScope(): CheckerEnv {
    const env = new CheckerEnv(this.container, this.provider);
    env.scopes = this.scopes.push();
    return env;
  }

  /**
   * Exit the current scope, returning to the parent
   */
  exitScope(): CheckerEnv {
    const parent = this.scopes.pop();
    if (!parent) {
      return this;
    }
    const env = new CheckerEnv(this.container, this.provider);
    env.scopes = parent;
    return env;
  }

  /**
   * Get the container for this environment
   */
  getContainer(): Container {
    return this.container;
  }

  /**
   * Get the type provider for this environment
   */
  getProvider(): TypeProvider {
    return this.provider;
  }
}

/**
 * Result of looking up an identifier
 */
export interface LookupResult {
  name: string;
  type: Type;
  kind: "variable" | "type" | "enum";
}

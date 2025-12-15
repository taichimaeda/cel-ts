// CEL API
// TypeScript-native top-level API
// Based on cel-go's cel/cel.go, cel/env.go, cel/program.go

import { check as checkAST } from "./checker/checker";
import { FunctionDecl, OverloadDecl, VariableDecl } from "./checker/decls";
import { Container as CheckerContainer, CheckerEnv } from "./checker/env";
import type { CheckerError } from "./checker/errors";
import { getStandardFunctions } from "./checker/stdlib";
import { Type } from "./checker/types";
import type { AST as CommonAST, SourceInfo } from "./common/ast";
import {
  type Activation,
  EmptyActivation,
  LazyActivation,
  MapActivation,
} from "./interpreter/activation";
import {
  DefaultDispatcher,
  type Dispatcher,
  type Overload as DispatcherOverload,
} from "./interpreter/dispatcher";
import { registerStandardFunctions } from "./interpreter/functions";
import { Planner } from "./interpreter/planner";
import {
  DefaultTypeAdapter,
  type ErrorValue,
  type TypeAdapter,
  type Value,
  isError,
} from "./interpreter/values";
import { Parser, ParserHelper } from "./parser";

// ============================================================================
// Errors - CEL Error Types
// ============================================================================

/**
 * CELError is thrown when CEL operations fail.
 */
export class CELError extends Error {
  readonly issues: Issues;

  constructor(message: string, issues?: Issues) {
    super(message);
    this.name = "CELError";
    this.issues = issues ?? new Issues([]);
  }
}

/**
 * CompileError is thrown when expression compilation fails.
 */
export class CompileError extends CELError {
  constructor(message: string, issues: Issues) {
    super(message, issues);
    this.name = "CompileError";
  }
}

/**
 * ParseError is thrown when expression parsing fails.
 */
export class ParseError extends CELError {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

// ============================================================================
// Types - CEL Type Definitions
// ============================================================================

/** Bool type */
export const BoolType = Type.Bool;
/** Int type */
export const IntType = Type.Int;
/** Uint type */
export const UintType = Type.Uint;
/** Double type */
export const DoubleType = Type.Double;
/** String type */
export const StringType = Type.String;
/** Bytes type */
export const BytesType = Type.Bytes;
/** Duration type */
export const DurationType = Type.Duration;
/** Timestamp type */
export const TimestampType = Type.Timestamp;
/** Null type */
export const NullType = Type.Null;
/** Dynamic type (any type) */
export const DynType = Type.Dyn;
/** Any type (alias for Dyn) */
export const AnyType = Type.Dyn;

/**
 * TypeBuilder provides a fluent, class-based API for creating CEL types.
 */
export class TypeBuilder {
  /**
   * Create a List type.
   */
  list(elemType: Type): Type {
    return Type.newListType(elemType);
  }

  /**
   * Create a Map type.
   */
  map(keyType: Type, valueType: Type): Type {
    return Type.newMapType(keyType, valueType);
  }

  /**
   * Create an Optional type.
   */
  optional(_type: Type): Type {
    // TODO: Full Optional type implementation needed
    return Type.Dyn;
  }

  /**
   * Create a Type type (type of types).
   */
  type(type: Type): Type {
    return Type.newTypeTypeWithParam(type);
  }

  /**
   * Create an Object type (message type).
   */
  object(_typeName: string): Type {
    // TODO: Full Object type implementation needed
    return Type.newMapType(Type.String, Type.Dyn);
  }
}

/**
 * Singleton TypeBuilder instance for convenience.
 */
export const Types = new TypeBuilder();

// ============================================================================
// Issues - Error/Warning Collection
// ============================================================================

/**
 * Issues represents a collection of errors and warnings from parsing or type-checking.
 */
export class Issues {
  readonly errors: readonly CheckerError[];

  constructor(errors: CheckerError[] = [], _source = "") {
    this.errors = errors;
  }

  /**
   * Returns true if there are any errors.
   */
  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Get the error count.
   */
  get length(): number {
    return this.errors.length;
  }

  /**
   * Format all errors as a string.
   */
  toString(): string {
    return this.errors.map((e) => this.formatError(e)).join("\n");
  }

  private formatError(error: CheckerError): string {
    if (error.location) {
      return `ERROR: ${error.location.line}:${error.location.column}: ${error.message}`;
    }
    return `ERROR: ${error.message}`;
  }
}

// ============================================================================
// Ast - Abstract Syntax Tree
// ============================================================================

/**
 * Ast represents a parsed and optionally type-checked CEL expression.
 */
export class Ast {
  readonly ast: CommonAST;
  readonly source: string;
  private _isChecked: boolean;

  constructor(ast: CommonAST, source: string, isChecked = false) {
    this.ast = ast;
    this.source = source;
    this._isChecked = isChecked;
  }

  /**
   * Returns true if the AST has been type-checked.
   */
  get isChecked(): boolean {
    return this._isChecked;
  }

  /**
   * Returns the output type of the expression (if type-checked).
   */
  get outputType(): Type | undefined {
    if (!this._isChecked) return undefined;
    return this.ast.typeMap.get(this.ast.expr.id);
  }

  /**
   * Mark this AST as checked.
   */
  markChecked(): void {
    this._isChecked = true;
  }
}

// ============================================================================
// Program - Evaluable Program
// ============================================================================

/**
 * Program is an evaluable representation of a CEL expression.
 */
type ProgramInput = Activation | Map<string, Value> | Record<string, unknown>;

export class Program {
  private readonly interpretable: ReturnType<Planner["plan"]>;
  private readonly adapter: TypeAdapter;
  private readonly sourceInfo: SourceInfo;

  constructor(
    interpretable: ReturnType<Planner["plan"]>,
    adapter: TypeAdapter,
    sourceInfo: SourceInfo
  ) {
    this.interpretable = interpretable;
    this.adapter = adapter;
    this.sourceInfo = sourceInfo;
  }

  eval(vars?: ProgramInput): Value {
    let activation: Activation;
    if (!vars) {
      activation = new EmptyActivation();
    } else if (isActivation(vars)) {
      activation = vars;
    } else if (vars instanceof Map) {
      activation = new MapActivation(vars);
    } else {
      activation = new LazyActivation(vars, this.adapter);
    }

    const value = this.interpretable.eval(activation);

    if (isError(value)) {
      const message = formatRuntimeError(value as ErrorValue, this.sourceInfo);
      throw new CELError(message);
    }

    return value;
  }
}

function isActivation(value: unknown): value is Activation {
  return (
    typeof value === "object" &&
    value !== null &&
    "resolve" in (value as Record<string, unknown>) &&
    typeof (value as Activation).resolve === "function"
  );
}

function formatRuntimeError(error: ErrorValue, sourceInfo: SourceInfo): string {
  const exprId = error.getExprId();
  if (exprId === undefined) {
    return error.getMessage();
  }
  const position = sourceInfo.getPosition(exprId);
  if (!position) {
    return error.getMessage();
  }
  const { line, column } = sourceInfo.getLocation(position.start);
  return `${line}:${column}: ${error.getMessage()}`;
}

// ============================================================================
// EnvOption - Environment Configuration Options
// ============================================================================

/**
 * Internal configuration for environment construction.
 */
interface EnvConfig {
  container: string;
  variables: VariableDecl[];
  functions: FunctionDecl[];
  functionOverloads: Map<string, DispatcherOverload[]>;
  adapter: TypeAdapter;
  disableStandardLibrary: boolean;
  disableTypeChecking: boolean;
}

/**
 * Options used to configure an Env instance.
 */
export interface EnvOption {
  apply(config: EnvConfig): void;
}

/**
 * Object-style options for creating an Env instance.
 */
export interface EnvOptions {
  /** Variables to declare in the environment */
  variables?: readonly EnvVariableOption[];
  /** Constants to declare in the environment */
  constants?: readonly EnvConstantOption[];
  /** Functions (with overloads) to register */
  functions?: readonly EnvFunctionOption[];
  /** Container name for identifier resolution */
  container?: string;
  /** Custom type adapter */
  adapter?: TypeAdapter;
  /** Disable standard library registration */
  disableStandardLibrary?: boolean;
  /** Disable type checking */
  disableTypeChecking?: boolean;
  /** Escape hatch for providing custom EnvOption instances */
  extraOptions?: readonly EnvOption[];
}

export interface EnvVariableOption {
  name: string;
  type: Type;
}

/**
 * Helper class for declaring variables within EnvOptions.
 */
export class EnvVariable implements EnvVariableOption {
  constructor(
    public readonly name: string,
    public readonly type: Type
  ) {}
}

export interface EnvConstantOption {
  name: string;
  type: Type;
  value: Value;
}

export interface EnvFunctionOption {
  name: string;
  overloads: readonly FunctionOverload[];
}

/**
 * Helper class for declaring functions within EnvOptions.
 */
export class EnvFunction implements EnvFunctionOption {
  readonly overloads: readonly FunctionOverload[];

  constructor(public readonly name: string, ...overloads: FunctionOverload[]) {
    this.overloads = overloads;
  }
}

/**
 * Declare a variable with a name and type.
 */
export class VariableOption implements EnvOption {
  constructor(
    public readonly name: string,
    public readonly type: Type
  ) { }

  apply(config: EnvConfig): void {
    config.variables.push(new VariableDecl(this.name, this.type));
  }
}

/**
 * Declare a constant with a name, type, and value.
 */
export class ConstantOption implements EnvOption {
  constructor(
    public readonly name: string,
    public readonly type: Type,
    public readonly value: Value
  ) { }

  apply(config: EnvConfig): void {
    // TODO: Proper constant support. For now, treat as variable declaration.
    config.variables.push(new VariableDecl(this.name, this.type));
  }
}

/**
 * Configure container name resolution.
 */
export class ContainerOption implements EnvOption {
  constructor(public readonly name: string) { }

  apply(config: EnvConfig): void {
    config.container = this.name;
  }
}

/**
 * Install a custom type adapter.
 */
export class AdapterOption implements EnvOption {
  constructor(public readonly adapter: TypeAdapter) { }

  apply(config: EnvConfig): void {
    config.adapter = this.adapter;
  }
}

/**
 * Disable shipping standard library functions.
 */
export class DisableStandardLibraryOption implements EnvOption {
  apply(config: EnvConfig): void {
    config.disableStandardLibrary = true;
  }
}

/**
 * Disable type checking.
 */
export class DisableTypeCheckingOption implements EnvOption {
  apply(config: EnvConfig): void {
    config.disableTypeChecking = true;
  }
}

/**
 * Describe a function overload declaration and optional runtime binding.
 */
type FunctionOverloadOptions = {
  typeParams?: readonly string[];
  isMember?: boolean;
  binding?: UnaryBinding | BinaryBinding | FunctionBinding | undefined;
};

export class FunctionOverload {
  readonly typeParams: readonly string[];
  readonly isMember: boolean;
  readonly binding?: UnaryBinding | BinaryBinding | FunctionBinding | undefined;

  constructor(
    public readonly id: string,
    public readonly argTypes: readonly Type[],
    public readonly resultType: Type,
    options: FunctionOverloadOptions = {}
  ) {
    this.typeParams = options.typeParams ? [...options.typeParams] : [];
    this.isMember = options.isMember ?? false;
    this.binding = options.binding;
  }

  /**
   * Convert to a dispatcher overload instance if runtime binding is provided.
   */
  toDispatcherOverload(): DispatcherOverload | undefined {
    if (!this.binding) {
      return undefined;
    }

    const dispatcherOverload: DispatcherOverload = {
      id: this.id,
    };

    switch (this.argTypes.length) {
      case 1:
        dispatcherOverload.unary = (arg: Value) => (this.binding as UnaryBinding)(arg);
        break;
      case 2:
        dispatcherOverload.binary = (lhs: Value, rhs: Value) =>
          (this.binding as BinaryBinding)(lhs, rhs);
        break;
      default:
        dispatcherOverload.nary = (args: Value[]) => (this.binding as FunctionBinding)(args);
        break;
    }
    return dispatcherOverload;
  }
}

/**
 * Global function overload helper class.
 */
export class GlobalFunctionOverload extends FunctionOverload {
  constructor(
    id: string,
    argTypes: Type[],
    resultType: Type,
    binding?: UnaryBinding | BinaryBinding | FunctionBinding,
    options: { typeParams?: readonly string[] } = {}
  ) {
    super(id, argTypes, resultType, {
      ...options,
      isMember: false,
      binding,
    });
  }
}

/**
 * Member function overload helper class.
 */
export class MemberFunctionOverload extends FunctionOverload {
  constructor(
    id: string,
    argTypes: Type[],
    resultType: Type,
    binding?: UnaryBinding | BinaryBinding | FunctionBinding,
    options: { typeParams?: readonly string[] } = {}
  ) {
    super(id, argTypes, resultType, {
      ...options,
      isMember: true,
      binding,
    });
  }
}

/**
 * Function binding types.
 */
export type UnaryBinding = (arg: Value) => Value;
export type BinaryBinding = (lhs: Value, rhs: Value) => Value;
export type FunctionBinding = (args: Value[]) => Value;

/**
 * Declare functions with overloads.
 */
export class FunctionOption implements EnvOption {
  readonly overloads: readonly FunctionOverload[];

  constructor(public readonly name: string, ...overloads: FunctionOverload[]) {
    this.overloads = overloads;
  }

  apply(config: EnvConfig): void {
    const fn = new FunctionDecl(this.name);
    const runtimeOverloads: DispatcherOverload[] = [];

    for (const overload of this.overloads) {
      const decl = new OverloadDecl(
        overload.id,
        [...overload.argTypes],
        overload.resultType,
        [...overload.typeParams],
        overload.isMember
      );
      fn.addOverload(decl);

      const dispatcherOverload = overload.toDispatcherOverload();
      if (dispatcherOverload) {
        runtimeOverloads.push(dispatcherOverload);
      }
    }

    config.functions.push(fn);
    if (runtimeOverloads.length > 0) {
      const existing = config.functionOverloads.get(this.name) ?? [];
      config.functionOverloads.set(this.name, [...existing, ...runtimeOverloads]);
    }
  }
}

// ============================================================================
// Env - CEL Environment
// ============================================================================

/**
 * Env is the CEL environment for parsing, type-checking, and evaluating expressions.
 */
export class Env {
  private config!: EnvConfig;
  private checkerEnv!: CheckerEnv;
  private dispatcher!: Dispatcher;
  private parser!: Parser;

  constructor(options: EnvOptions = {}) {
    const config = Env.createDefaultConfig();
    Env.applyOptions(config, Env.normalizeOptions(options));
    this.initialize(config);
  }

  /**
   * Parse an expression into an Ast.
   * Throws ParseError on failure.
   */
  parse(expression: string): Ast {
    const parseResult = this.parser.parse(expression);
    if (!parseResult.tree) {
      throw new ParseError(parseResult.error ?? "failed to parse expression");
    }

    // Convert ANTLR parse tree to our AST with macro expansion
    const helper = new ParserHelper(expression);
    const ast = helper.parse(parseResult.tree);
    return new Ast(ast, expression);
  }

  /**
   * Parse and type-check an expression.
   * Throws CompileError on failure.
   */
  compile(expression: string): Ast {
    const parseResult = this.parser.parse(expression);
    if (!parseResult.tree) {
      throw new ParseError(parseResult.error ?? "failed to parse expression");
    }

    // Convert ANTLR parse tree to our AST with macro expansion
    const helper = new ParserHelper(expression);
    const ast = helper.parse(parseResult.tree);

    if (this.config.disableTypeChecking) {
      return new Ast(ast, expression);
    }

    const checkResult = checkAST(ast, this.checkerEnv);

    if (checkResult.errors.hasErrors()) {
      const issues = new Issues(checkResult.errors.getErrors().slice(), expression);
      throw new CompileError(issues.toString(), issues);
    }

    return new Ast(ast, expression, true);
  }

  /**
   * Type-check a parsed Ast.
   * Throws CompileError on failure.
   */
  check(celAst: Ast): Ast {
    if (this.config.disableTypeChecking) {
      return celAst;
    }

    const checkResult = checkAST(celAst.ast, this.checkerEnv);

    if (checkResult.errors.hasErrors()) {
      const issues = new Issues(checkResult.errors.getErrors().slice(), celAst.source);
      throw new CompileError(issues.toString(), issues);
    }

    celAst.markChecked();
    return celAst;
  }

  /**
   * Create a Program from an Ast.
   */
  program(celAst: Ast): Program {
    const planner = new Planner({
      dispatcher: this.dispatcher,
      refMap: celAst.isChecked ? celAst.ast.refMap : undefined,
    });

    const interpretable = planner.plan(celAst.ast);
    return new Program(interpretable, this.config.adapter, celAst.ast.sourceInfo);
  }

  /**
   * Extend this environment with additional options.
   */
  extend(options: EnvOptions = {}): Env {
    const newConfig = Env.cloneConfig(this.config);
    Env.applyOptions(newConfig, Env.normalizeOptions(options));
    return Env.fromConfig(newConfig);
  }

  private initialize(config: EnvConfig): void {
    this.config = config;
    this.checkerEnv = new CheckerEnv(new CheckerContainer(config.container));
    this.dispatcher = new DefaultDispatcher();
    this.parser = new Parser();

    if (!config.disableStandardLibrary) {
      for (const fn of getStandardFunctions()) {
        this.checkerEnv.addFunctions(fn);
      }
      registerStandardFunctions(this.dispatcher);
    }

    for (const v of config.variables) {
      this.checkerEnv.addIdents(v);
    }
    for (const fn of config.functions) {
      this.checkerEnv.addFunctions(fn);
    }

    for (const [, overloads] of config.functionOverloads) {
      for (const overload of overloads) {
        this.dispatcher.add(overload);
      }
    }
  }

  private static fromConfig(config: EnvConfig): Env {
    const env = Object.create(Env.prototype) as Env;
    env.initialize(config);
    return env;
  }

  private static createDefaultConfig(): EnvConfig {
    return {
      container: "",
      variables: [],
      functions: [],
      functionOverloads: new Map(),
      adapter: new DefaultTypeAdapter(),
      disableStandardLibrary: false,
      disableTypeChecking: false,
    };
  }

  private static cloneConfig(config: EnvConfig): EnvConfig {
    return {
      container: config.container,
      variables: [...config.variables],
      functions: [...config.functions],
      functionOverloads: new Map(
        [...config.functionOverloads.entries()].map(([name, overloads]) => [name, [...overloads]])
      ),
      adapter: config.adapter,
      disableStandardLibrary: config.disableStandardLibrary,
      disableTypeChecking: config.disableTypeChecking,
    };
  }

  private static applyOptions(config: EnvConfig, options: readonly EnvOption[]): void {
    for (const opt of options) {
      opt.apply(config);
    }
  }

  private static normalizeOptions(options: EnvOptions): EnvOption[] {
    const normalized: EnvOption[] = [];

    for (const variable of options.variables ?? []) {
      normalized.push(new VariableOption(variable.name, variable.type));
    }

    for (const constant of options.constants ?? []) {
      normalized.push(new ConstantOption(constant.name, constant.type, constant.value));
    }

    for (const fn of options.functions ?? []) {
      normalized.push(new FunctionOption(fn.name, ...fn.overloads));
    }

    if (options.container) {
      normalized.push(new ContainerOption(options.container));
    }

    if (options.adapter) {
      normalized.push(new AdapterOption(options.adapter));
    }

    if (options.disableStandardLibrary) {
      normalized.push(new DisableStandardLibraryOption());
    }

    if (options.disableTypeChecking) {
      normalized.push(new DisableTypeCheckingOption());
    }

    if (options.extraOptions) {
      normalized.push(...options.extraOptions);
    }

    return normalized;
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export { Type } from "./checker/types";
export {
  EmptyActivation,
  HierarchicalActivation,
  LazyActivation,
  MapActivation,
  MutableActivation,
  PartialActivation,
  StrictActivation
} from "./interpreter/activation";
export type { Activation } from "./interpreter/activation";
export {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  ErrorValue,
  IntValue,
  ListValue,
  MapValue,
  NullValue,
  StringValue,
  TimestampValue,
  TypeValue,
  UintValue,
  isError
} from "./interpreter/values";
export type { Value } from "./interpreter/values";

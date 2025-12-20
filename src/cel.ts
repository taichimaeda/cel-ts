// CEL API
// TypeScript-native top-level API
// Based on cel-go's cel/cel.go, cel/env.go, cel/program.go

import { getStandardFunctions } from "./checker";
import { Checker } from "./checker/checker";
import { FunctionDecl, OverloadDecl, VariableDecl } from "./checker/decls";
import { Container as CheckerContainer, CheckerEnv } from "./checker/env";
import type { CheckerError } from "./checker/errors";
import {
  AnyType as CheckerAnyType,
  BoolType as CheckerBoolType,
  BytesType as CheckerBytesType,
  DoubleType as CheckerDoubleType,
  DurationType as CheckerDurationType,
  DynType as CheckerDynType,
  IntType as CheckerIntType,
  NullType as CheckerNullType,
  StringType as CheckerStringType,
  TimestampType as CheckerTimestampType,
  TypeType as CheckerTypeType,
  UintType as CheckerUintType,
  ListType,
  MapType,
  Type,
  TypeTypeWithParam,
} from "./checker/types";
import type { AST as CommonAST } from "./common/ast";
import type { SourceInfo } from "./common/source";
import { standardFunctions } from "./interpreter";
import {
  type Activation,
  EmptyActivation,
  LazyActivation,
  MapActivation,
} from "./interpreter/activation";
import {
  DefaultDispatcher,
  type Dispatcher,
  type Overload as DispatcherOverload
} from "./interpreter/dispatcher";
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
export const BoolType = CheckerBoolType;
/** Int type */
export const IntType = CheckerIntType;
/** Uint type */
export const UintType = CheckerUintType;
/** Double type */
export const DoubleType = CheckerDoubleType;
/** String type */
export const StringType = CheckerStringType;
/** Bytes type */
export const BytesType = CheckerBytesType;
/** Duration type */
export const DurationType = CheckerDurationType;
/** Timestamp type */
export const TimestampType = CheckerTimestampType;
/** Null type */
export const NullType = CheckerNullType;
/** Dynamic type (any type) */
export const DynType = CheckerDynType;
/** Any type */
export const AnyType = CheckerAnyType;
/** Type type */
export const TypeType = CheckerTypeType;

/**
 * TypeBuilder provides a fluent, class-based API for creating CEL types.
 */
export class TypeBuilder {
  /**
   * Create a List type.
   */
  list(elemType: Type): Type {
    return new ListType(elemType);
  }

  /**
   * Create a Map type.
   */
  map(keyType: Type, valueType: Type): Type {
    return new MapType(keyType, valueType);
  }

  /**
   * Create an Optional type.
   */
  optional(_type: Type): Type {
    // TODO: Full Optional type implementation needed
    return DynType;
  }

  /**
   * Create a Type type (type of types).
   */
  type(type: Type): Type {
    return new TypeTypeWithParam(type);
  }

  /**
   * Create an Object type (message type).
   */
  object(_typeName: string): Type {
    // TODO: Full Object type implementation needed
    return new MapType(StringType, DynType);
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
  private checked: boolean;

  constructor(
    readonly ast: CommonAST,
    readonly source: string,
    isChecked: boolean = false
  ) {
    this.checked = isChecked;
  }

  /**
   * Returns true if the AST has been type-checked.
   */
  get isChecked(): boolean {
    return this.checked;
  }

  /**
   * Returns the output type of the expression (if type-checked).
   */
  get outputType(): Type | undefined {
    if (!this.checked) return undefined;
    return this.ast.typeMap.get(this.ast.expr.id);
  }

  /**
   * Mark this AST as checked.
   */
  markChecked(): void {
    this.checked = true;
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
// Env configuration helpers
// ============================================================================

/**
 * Options used to configure an Env instance.
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
}

/**
 * Helper class for declaring variables within EnvOptions.
 */
export class EnvVariableOption {
  constructor(
    readonly name: string,
    readonly type: Type
  ) { }

  register(config: EnvConfig): void {
    config.variables.push(new VariableDecl(this.name, this.type));
  }
}

/**
 * Helper class for declaring constants within EnvOptions.
 */
export class EnvConstantOption {
  constructor(
    readonly name: string,
    readonly type: Type,
    readonly value: Value
  ) { }

  register(config: EnvConfig): void {
    // TODO: Proper constant support. For now, treat as variable declaration.
    config.variables.push(new VariableDecl(this.name, this.type));
  }
}

/**
 * Helper class for declaring functions within EnvOptions.
 */
export class EnvFunctionOption {
  readonly overloads: readonly FunctionOverloadOption[];

  constructor(readonly name: string, ...overloads: FunctionOverloadOption[]) {
    this.overloads = overloads;
  }

  register(config: EnvConfig): void {
    const fnDecl = new FunctionDecl(this.name);
    const runtimeOverloads: DispatcherOverload[] = [];

    for (const overload of this.overloads) {
      overload.register(fnDecl, runtimeOverloads);
    }

    config.functions.push(fnDecl);
    if (runtimeOverloads.length > 0) {
      const existing = config.functionOverloads.get(this.name) ?? [];
      config.functionOverloads.set(this.name, [...existing, ...runtimeOverloads]);
    }
  }
}

/**
 * Function binding types.
 */
export type UnaryBinding = (arg: Value) => Value;
export type BinaryBinding = (lhs: Value, rhs: Value) => Value;
export type FunctionBinding = (args: Value[]) => Value;

class FunctionOverloadOption {
  readonly typeParams: readonly string[];
  readonly isMember: boolean;
  readonly binding?: UnaryBinding | BinaryBinding | FunctionBinding | undefined;

  constructor(
    readonly id: string,
    readonly argTypes: readonly Type[],
    readonly resultType: Type,
    options: {
      typeParams?: readonly string[];
      isMember?: boolean;
      binding?: UnaryBinding | BinaryBinding | FunctionBinding | undefined;
    } = {}
  ) {
    this.typeParams = options.typeParams ? [...options.typeParams] : [];
    this.isMember = options.isMember ?? false;
    this.binding = options.binding;
  }

  register(target: FunctionDecl, runtimeOverloads: DispatcherOverload[]): void {
    const declaration = new OverloadDecl(
      this.id,
      [...this.argTypes],
      this.resultType,
      [...this.typeParams],
      this.isMember
    );
    target.addOverload(declaration);

    if (!this.binding) {
      return;
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
    runtimeOverloads.push(dispatcherOverload);
  }
}

/**
 * Global function overload helper class.
 */
class GlobalFunctionOverloadOption extends FunctionOverloadOption {
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
class MemberFunctionOverloadOption extends FunctionOverloadOption {
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

export {
  EnvConstantOption as Constant,
  EnvFunctionOption as Function,
  MemberFunctionOverloadOption as MemberOverload,
  GlobalFunctionOverloadOption as Overload,
  EnvVariableOption as Variable
};
export type { EnvOptions as Options };

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
    const config = new EnvConfig();
    config.apply(options);
    this.initialize(config);
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
    for (const overload of standardFunctions) {
      this.dispatcher.add(overload);
    }
    }

    for (const v of config.variables) {
      this.checkerEnv.addVariables(v);
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

    const checkResult = new Checker(this.checkerEnv, ast.typeMap, ast.refMap).check(ast);

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

    const checkResult = new Checker(this.checkerEnv, celAst.ast.typeMap, celAst.ast.refMap).check(
      celAst.ast
    );

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
   * Create a new Env extending the current configuration.
   */
  extend(options: EnvOptions = {}): Env {
    const newConfig = this.config.clone();
    newConfig.apply(options);

    const env = Object.create(Env.prototype) as Env;
    env.initialize(newConfig);
    return env;
  }
}

/**
 * Internal configuration for environment construction.
 */
class EnvConfig {
  container: string;
  variables: VariableDecl[];
  functions: FunctionDecl[];
  functionOverloads: Map<string, DispatcherOverload[]>;
  adapter: TypeAdapter;
  disableStandardLibrary: boolean;
  disableTypeChecking: boolean;

  constructor() {
    this.container = "";
    this.variables = [];
    this.functions = [];
    this.functionOverloads = new Map();
    this.adapter = new DefaultTypeAdapter();
    this.disableStandardLibrary = false;
    this.disableTypeChecking = false;
  }

  clone(): EnvConfig {
    const clone = new EnvConfig();
    clone.container = this.container;
    clone.variables = [...this.variables];
    clone.functions = [...this.functions];
    clone.functionOverloads = new Map(
      [...this.functionOverloads.entries()].map(([name, overloads]) => [name, [...overloads]])
    );
    clone.adapter = this.adapter;
    clone.disableStandardLibrary = this.disableStandardLibrary;
    clone.disableTypeChecking = this.disableTypeChecking;
    return clone;
  }

  apply(options: EnvOptions = {}): void {
    for (const variable of options.variables ?? []) {
      variable.register(this);
    }

    for (const constant of options.constants ?? []) {
      constant.register(this);
    }

    for (const fnOption of options.functions ?? []) {
      fnOption.register(this);
    }

    if (options.container !== undefined) {
      this.container = options.container;
    }

    if (options.adapter) {
      this.adapter = options.adapter;
    }

    if (options.disableStandardLibrary) {
      this.disableStandardLibrary = true;
    }

    if (options.disableTypeChecking) {
      this.disableTypeChecking = true;
    }
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

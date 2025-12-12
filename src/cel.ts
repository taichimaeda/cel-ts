// CEL API
// TypeScript-native top-level API
// Based on cel-go's cel/cel.go, cel/env.go, cel/program.go

import { type CheckResult, Checker } from "./checker/checker";
import { FunctionDecl, OverloadDecl, VariableDecl } from "./checker/decls";
import { Container as CheckerContainer, CheckerEnv } from "./checker/env";
import type { CheckerError } from "./checker/errors";
import { getStandardFunctions } from "./checker/stdlib";
import { Type } from "./checker/types";
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
import { Parser } from "./parser";
import type { StartContext } from "./parser/gen/CELParser.js";

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

/* biome-ignore lint/style/useNamingConvention: CEL API mirrors cel-go helper names. */
/**
 * Create a List type.
 * @param elemType - Element type
 */
export function ListType(elemType: Type): Type {
  return Type.newListType(elemType);
}

/* biome-ignore lint/style/useNamingConvention: CEL API mirrors cel-go helper names. */
/**
 * Create a Map type.
 * @param keyType - Key type
 * @param valueType - Value type
 */
export function MapType(keyType: Type, valueType: Type): Type {
  return Type.newMapType(keyType, valueType);
}

/* biome-ignore lint/style/useNamingConvention: CEL API mirrors cel-go helper names. */
/**
 * Create an Optional type.
 * @param _type - Wrapped type
 */
export function OptionalType(_type: Type): Type {
  // TODO: Full Optional type implementation needed
  return Type.Dyn;
}

/* biome-ignore lint/style/useNamingConvention: CEL API mirrors cel-go helper names. */
/**
 * Create a Type type (type of types).
 * @param type - Parameter type
 */
export function TypeType(type: Type): Type {
  return Type.newTypeTypeWithParam(type);
}

/* biome-ignore lint/style/useNamingConvention: CEL API mirrors cel-go helper names. */
/**
 * Create an Object type (message type).
 * @param _typeName - Type name
 */
export function ObjectType(_typeName: string): Type {
  // TODO: Full Object type implementation needed
  return Type.newMapType(Type.String, Type.Dyn);
}

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
  readonly tree: StartContext;
  readonly source: string;
  readonly checkResult: CheckResult | undefined;

  constructor(tree: StartContext, source: string, checkResult?: CheckResult) {
    this.tree = tree;
    this.source = source;
    this.checkResult = checkResult;
  }

  /**
   * Returns true if the AST has been type-checked.
   */
  get isChecked(): boolean {
    return this.checkResult !== undefined;
  }

  /**
   * Returns the output type of the expression (if type-checked).
   */
  get outputType(): Type | undefined {
    return this.checkResult?.type;
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

  constructor(interpretable: ReturnType<Planner["plan"]>, adapter: TypeAdapter) {
    this.interpretable = interpretable;
    this.adapter = adapter;
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
      throw new CELError((value as ErrorValue).getMessage());
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
 * Configuration options for building a CEL environment.
 */
export type EnvOption =
  | { kind: "variable"; name: string; type: Type }
  | { kind: "constant"; name: string; type: Type; value: Value }
  | { kind: "function"; name: string; overloads: FunctionOverload[] }
  | { kind: "container"; name: string }
  | { kind: "adapter"; adapter: TypeAdapter }
  | { kind: "disableStdlib" }
  | { kind: "disableTypeChecking" };

function applyEnvOption(config: EnvConfig, opt: EnvOption): void {
  switch (opt.kind) {
    case "variable":
      applyVariableOption(config, opt);
      break;
    case "constant":
      applyConstantOption(config, opt);
      break;
    case "function":
      applyFunctionOption(config, opt);
      break;
    case "container":
      applyContainerOption(config, opt);
      break;
    case "adapter":
      applyAdapterOption(config, opt);
      break;
    case "disableStdlib":
      applyDisableStandardLibraryOption(config);
      break;
    case "disableTypeChecking":
      applyDisableTypeCheckingOption(config);
      break;
    default:
      ((_: never) => _)(opt);
  }
}

type VariableOption = Extract<EnvOption, { kind: "variable" }>;
type ConstantOption = Extract<EnvOption, { kind: "constant" }>;
type ContainerOption = Extract<EnvOption, { kind: "container" }>;
type AdapterOption = Extract<EnvOption, { kind: "adapter" }>;
type FunctionOption = Extract<EnvOption, { kind: "function" }>;

function applyFunctionOption(config: EnvConfig, opt: FunctionOption): void {
  const fn = new FunctionDecl(opt.name);
  const runtimeOverloads: DispatcherOverload[] = [];

  for (const overload of opt.overloads) {
    const decl = new OverloadDecl(
      overload.id,
      overload.argTypes,
      overload.resultType,
      overload.typeParams ?? [],
      overload.isMember ?? false
    );
    fn.addOverload(decl);

    if (overload.binding) {
      const { id, argTypes, binding } = overload;
      const dispatcherOverload: DispatcherOverload = { id };
      switch (argTypes.length) {
        case 1:
          const unary = (arg: Value) => (binding as UnaryBinding)(arg);
          dispatcherOverload.unary = unary;
          break;
        case 2:
          const binary = (lhs: Value, rhs: Value) => (binding as BinaryBinding)(lhs, rhs);
          dispatcherOverload.binary = binary;
          break;
        default:
          const nary = (args: Value[]) => (binding as FunctionBinding)(args);
          dispatcherOverload.nary = nary;
          break;
      }
      runtimeOverloads.push(dispatcherOverload);
    }
  }

  config.functions.push(fn);

  if (runtimeOverloads.length > 0) {
    const existing = config.functionOverloads.get(opt.name) ?? [];
    config.functionOverloads.set(opt.name, [...existing, ...runtimeOverloads]);
  }
}

function applyVariableOption(config: EnvConfig, opt: VariableOption): void {
  config.variables.push(new VariableDecl(opt.name, opt.type));
}

function applyConstantOption(config: EnvConfig, opt: ConstantOption): void {
  config.variables.push(new VariableDecl(opt.name, opt.type));
}

function applyContainerOption(config: EnvConfig, opt: ContainerOption): void {
  config.container = opt.name;
}

function applyAdapterOption(config: EnvConfig, opt: AdapterOption): void {
  config.adapter = opt.adapter;
}

function applyDisableStandardLibraryOption(config: EnvConfig): void {
  config.disableStandardLibrary = true;
}

function applyDisableTypeCheckingOption(config: EnvConfig): void {
  config.disableTypeChecking = true;
}

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Declare a variable with a name and type.
 */
export function Variable(name: string, type: Type): EnvOption {
  return { kind: "variable", name, type };
}

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Declare a constant with a name, type, and value.
 */
export function Constant(name: string, type: Type, value: Value): EnvOption {
  // TODO: Constants are declared as variables, returning constant value at evaluation
  return { kind: "constant", name, type, value };
}

/**
 * Declare a function with overloads.
 */
/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
export function Function(name: string, ...overloads: FunctionOverload[]): EnvOption {
  return { kind: "function", name, overloads };
}

/**
 * Describe a function overload declaration and optional runtime binding.
 */
export interface FunctionOverload {
  id: string;
  argTypes: Type[];
  resultType: Type;
  typeParams?: string[];
  isMember?: boolean;
  binding?: UnaryBinding | BinaryBinding | FunctionBinding;
}

// Function binding types
export type UnaryBinding = (arg: Value) => Value;
export type BinaryBinding = (lhs: Value, rhs: Value) => Value;
export type FunctionBinding = (args: Value[]) => Value;

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Declare a global function overload.
 */
export function GlobalOverload(
  id: string,
  argTypes: Type[],
  resultType: Type,
  binding?: UnaryBinding | BinaryBinding | FunctionBinding
): FunctionOverload {
  const config: FunctionOverload = { id, argTypes, resultType };
  if (binding) {
    config.binding = binding;
  }
  return config;
}

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Declare a member function overload.
 */
export function MemberOverload(
  id: string,
  argTypes: Type[],
  resultType: Type,
  binding?: UnaryBinding | BinaryBinding | FunctionBinding
): FunctionOverload {
  const config: FunctionOverload = { id, argTypes, resultType, isMember: true };
  if (binding) {
    config.binding = binding;
  }
  return config;
}

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Set the container name for type resolution.
 */
export function Container(name: string): EnvOption {
  return { kind: "container", name };
}

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Set a custom type adapter.
 */
export function CustomTypeAdapter(adapter: TypeAdapter): EnvOption {
  return { kind: "adapter", adapter };
}

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Disable the standard library functions.
 */
export function DisableStandardLibrary(): EnvOption {
  return { kind: "disableStdlib" };
}

/* biome-ignore lint/style/useNamingConvention: CEL API matches cel-go builder names. */
/**
 * Disable type checking.
 */
export function DisableTypeChecking(): EnvOption {
  return { kind: "disableTypeChecking" };
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

  constructor(...options: EnvOption[]) {
    const config: EnvConfig = {
      container: "",
      variables: [],
      functions: [],
      functionOverloads: new Map(),
      adapter: new DefaultTypeAdapter(),
      disableStandardLibrary: false,
      disableTypeChecking: false,
    };

    for (const opt of options) {
      applyEnvOption(config, opt);
    }
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
    return new Ast(parseResult.tree, expression);
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

    const tree = parseResult.tree;

    if (this.config.disableTypeChecking) {
      return new Ast(tree, expression);
    }

    const checker = this.createChecker();
    const checkResult = checker.check(tree);

    if (checkResult.errors.hasErrors()) {
      const issues = new Issues(checkResult.errors.getErrors().slice(), expression);
      throw new CompileError(issues.toString(), issues);
    }

    return new Ast(tree, expression, checkResult);
  }

  /**
   * Type-check a parsed Ast.
   * Throws CompileError on failure.
   */
  check(ast: Ast): Ast {
    if (this.config.disableTypeChecking) {
      return ast;
    }

    const checker = this.createChecker();
    const checkResult = checker.check(ast.tree);

    if (checkResult.errors.hasErrors()) {
      const issues = new Issues(checkResult.errors.getErrors().slice(), ast.source);
      throw new CompileError(issues.toString(), issues);
    }

    return new Ast(ast.tree, ast.source, checkResult);
  }

  /**
   * Create a Program from an Ast.
   */
  program(ast: Ast): Program {
    const planner = new Planner({
      dispatcher: this.dispatcher,
      refMap: ast.checkResult?.refMap,
    });

    const interpretable = planner.plan(ast.tree);
    return new Program(interpretable, this.config.adapter);
  }

  /**
   * Extend this environment with additional options.
   */
  extend(...options: EnvOption[]): Env {
    const newConfig: EnvConfig = {
      ...this.config,
      variables: [...this.config.variables],
      functions: [...this.config.functions],
      functionOverloads: new Map(this.config.functionOverloads),
    };

    for (const opt of options) {
      applyEnvOption(newConfig, opt);
    }

    return Env.fromConfig(newConfig);
  }

  private createChecker(): Checker {
    return new Checker(this.checkerEnv);
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
  StrictActivation,
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
  isError,
} from "./interpreter/values";
export type { Value } from "./interpreter/values";

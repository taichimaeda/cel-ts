// CEL API
// TypeScript-native top-level API
// Based on cel-go's cel/cel.go, cel/env.go, cel/program.go

import { StandardLibrary } from "./checker";
import { Checker } from "./checker/checker";
import {
  ConstantDecl,
  FunctionDecl,
  FunctionOverloadDecl,
  StructDecl,
  StructFieldDecl,
  VariableDecl,
} from "./checker/decls";
import { Container as CheckerContainer, CheckerEnv } from "./checker/env";
import { Errors } from "./checker/errors";
import { CompositeTypeProvider, StructTypeProvider, type TypeProvider } from "./checker/provider";
import { DynType, ListType, MapType, OptionalType, StructType, type Type } from "./checker/types";
import type { AST as CommonAST } from "./common/ast";
import type { SourceInfo } from "./common/source";
import { standardFunctions } from "./interpreter";
import { type Activation, ActivationCache, MapActivation } from "./interpreter/activation";
import {
  BinaryDispatcherOverload,
  Dispatcher,
  type Overload as DispatcherOverload,
  NaryDispatcherOverload,
  UnaryDispatcherOverload,
} from "./interpreter/dispatcher";
import type { Interpretable } from "./interpreter/interpretable";
import { formatRuntimeError } from "./interpreter/utils";
import { TypeValue, type Value, isErrorValue } from "./interpreter/values";
import { AllMacros, type Macro, Parser, ParserHelper } from "./parser";
import { Planner } from "./planner";

// ============================================================================
// Errors - CEL Error Types
// ============================================================================

/**
 * CELError is thrown when CEL operations fail.
 */
export class CELError extends Error {
  override name = "CELError";

  constructor(
    message: string,
    readonly issues: Issues = new Issues()
  ) {
    super(message);
  }
}

/**
 * CompileError is thrown when expression compilation fails.
 */
export class CompileError extends CELError {
  override name = "CompileError";
}

/**
 * ParseError is thrown when expression parsing fails.
 */
export class ParseError extends CELError {
  override name = "ParseError";
}

// ============================================================================
// Types - CEL Type Definitions
// ============================================================================

/** Re-export primitive type singletons for convenience */
export {
  AnyType,
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  DynTypeType,
  ErrorType,
  IntType,
  ListType,
  MapType,
  NullType,
  OptionalType,
  StructType,
  StringType,
  TimestampType,
  Type,
  TypeType,
  UintType
} from "./checker/types";

// ============================================================================
// Issues - Error/Warning Collection
// ============================================================================

/**
 * Issues represents a collection of errors and warnings from parsing or type-checking.
 */
export class Issues {
  constructor(
    readonly errors: Errors = new Errors(),
    _source = ""
  ) { }

  /**
   * Returns true if there are any errors.
   */
  get hasErrors(): boolean {
    return this.errors.hasErrors();
  }

  /**
   * Get the error count.
   */
  get length(): number {
    return this.errors.count();
  }

  /**
   * Format all errors as a string.
   */
  toString(): string {
    return this.errors
      .getErrors()
      .map((errorItem) => this.formatError(errorItem))
      .join("\n");
  }

  private formatError(error: ReturnType<Errors["getErrors"]>[number]): string {
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
  constructor(
    readonly root: CommonAST,
    readonly source: string,
    private checked = false
  ) { }

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
    return this.root.typeMap.get(this.root.expr.id);
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

/**
 * Program evaluates a planned expression with runtime bindings.
 */
export class Program {
  constructor(
    private readonly interpretable: Interpretable,
    private readonly sourceInfo: SourceInfo
  ) { }

  private static readonly typeValueBindings = typeValueBindings();
  private static readonly typeActivation = new MapActivation(Program.typeValueBindings);
  private readonly activationCache = new ActivationCache(Program.typeActivation);

  eval(vars?: ProgramInput): Value {
    const activation = this.activationCache.getActivation(vars);

    try {
      const value = this.interpretable.eval(activation);
      if (isErrorValue(value)) {
        const message = formatRuntimeError(value, this.sourceInfo);
        throw new CELError(message);
      }
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CELError(message);
    }
  }
}

function typeValueBindings(): Map<string, Value> {
  return new Map<string, Value>([
    ["bool", TypeValue.BoolType],
    ["int", TypeValue.IntType],
    ["uint", TypeValue.UintType],
    ["double", TypeValue.DoubleType],
    ["string", TypeValue.StringType],
    ["bytes", TypeValue.BytesType],
    ["null_type", TypeValue.NullType],
    ["list", TypeValue.ListType],
    ["map", TypeValue.MapType],
    ["type", TypeValue.TypeType],
    ["optional_type", TypeValue.of(new OptionalType(DynType))],
    ["google.protobuf.Timestamp", TypeValue.TimestampType],
    ["google.protobuf.Duration", TypeValue.DurationType],
  ]);
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
  /** Struct types to declare in the environment */
  structs?: readonly EnvStructOption[];
  /** Additional type provider (e.g., protobuf-backed types) */
  typeProvider?: TypeProvider;
  /** Container name for identifier resolution */
  container?: string;
  /** Disable standard library registration */
  disableStandardLibrary?: boolean;
  /** Disable type checking */
  disableTypeChecking?: boolean;
  /** Additional macros to register for parsing */
  macros?: readonly Macro[];
  /** Treat enum values as ints (legacy semantics) */
  enumValuesAsInt?: boolean;
}

/**
 * Merge multiple EnvOptions into a single combined options object.
 */
export function mergeEnvOptions(...options: EnvOptions[]): EnvOptions {
  const merged: EnvOptions = {};
  for (const option of options) {
    if (option.variables) {
      merged.variables = [...(merged.variables ?? []), ...option.variables];
    }
    if (option.constants) {
      merged.constants = [...(merged.constants ?? []), ...option.constants];
    }
    if (option.functions) {
      merged.functions = [...(merged.functions ?? []), ...option.functions];
    }
    if (option.structs) {
      merged.structs = [...(merged.structs ?? []), ...option.structs];
    }
    if (option.macros) {
      merged.macros = [...(merged.macros ?? []), ...option.macros];
    }
    if (option.typeProvider) {
      merged.typeProvider = option.typeProvider;
    }
    if (option.container !== undefined) {
      merged.container = option.container;
    }
    if (option.disableStandardLibrary) {
      merged.disableStandardLibrary = true;
    }
    if (option.disableTypeChecking) {
      merged.disableTypeChecking = true;
    }
    if (option.enumValuesAsInt !== undefined) {
      merged.enumValuesAsInt = option.enumValuesAsInt;
    }
  }
  return merged;
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
    config.constants.push(new ConstantDecl(this.name, this.type, this.value));
  }
}

/**
 * Helper class for declaring functions within EnvOptions.
 */
export class EnvFunctionOption {
  readonly overloads: readonly FunctionOverloadOption[];

  constructor(
    readonly name: string,
    ...overloads: FunctionOverloadOption[]
  ) {
    this.overloads = overloads;
  }

  register(config: EnvConfig): void {
    const funcDecl = new FunctionDecl(this.name);
    const runtimeOverloads: DispatcherOverload[] = [];

    for (const overload of this.overloads) {
      overload.register(funcDecl, runtimeOverloads);
    }

    config.functions.push(funcDecl);
    if (runtimeOverloads.length > 0) {
      const existing = config.functionOverloads.get(this.name) ?? [];
      config.functionOverloads.set(this.name, [...existing, ...runtimeOverloads]);
    }
  }
}

/**
 * Helper class for declaring struct fields within EnvOptions.
 */
export class EnvStructFieldOption {
  constructor(
    readonly name: string,
    readonly type: Type
  ) { }
}

/**
 * Helper class for declaring struct types within EnvOptions.
 */
export class EnvStructOption {
  readonly fields: readonly EnvStructFieldOption[];

  constructor(
    readonly name: string,
    fields: readonly EnvStructFieldOption[] | Record<string, Type>
  ) {
    if (Array.isArray(fields)) {
      this.fields = fields;
    } else {
      this.fields = Object.entries(fields).map(
        ([fieldName, fieldType]) => new EnvStructFieldOption(fieldName, fieldType)
      );
    }
  }

  register(config: EnvConfig): void {
    const declFields = this.fields.map((field) => new StructFieldDecl(field.name, field.type));
    config.structProvider.addStructs(new StructDecl(this.name, declFields));
  }
}

/** Unary function binding type. */
export type UnaryBinding = (arg: Value) => Value;
/** Binary function binding type. */
export type BinaryBinding = (lhs: Value, rhs: Value) => Value;
/** N-ary function binding type. */
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
    const declaration = new FunctionOverloadDecl(
      this.id,
      [...this.argTypes],
      this.resultType,
      [...this.typeParams],
      this.isMember
    );
    target.addOverload(declaration);

    if (this.binding === undefined) {
      return;
    }

    switch (this.argTypes.length) {
      case 1:
        runtimeOverloads.push(
          new UnaryDispatcherOverload(this.id, (arg: Value) => (this.binding as UnaryBinding)(arg))
        );
        return;
      case 2:
        runtimeOverloads.push(
          new BinaryDispatcherOverload(this.id, (lhs: Value, rhs: Value) =>
            (this.binding as BinaryBinding)(lhs, rhs)
          )
        );
        return;
      default:
        runtimeOverloads.push(
          new NaryDispatcherOverload(this.id, (args: Value[]) =>
            (this.binding as FunctionBinding)(args)
          )
        );
        return;
    }
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
  EnvStructOption as Struct,
  EnvStructFieldOption as StructField,
  EnvVariableOption as Variable
};
/**
 * Alias for EnvOptions to match cel-go naming.
 */
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
    const provider = config.typeProvider
      ? new CompositeTypeProvider([config.structProvider, config.typeProvider])
      : config.structProvider;
    this.checkerEnv = new CheckerEnv(new CheckerContainer(config.container), provider, {
      coerceEnumToInt: config.enumValuesAsInt,
    });
    this.dispatcher = new Dispatcher();
    this.parser = new Parser();

    if (!config.disableStandardLibrary) {
      for (const funcDecl of StandardLibrary.functions()) {
        this.checkerEnv.addFunctions(funcDecl);
      }
      for (const overload of standardFunctions) {
        this.dispatcher.add(overload);
      }
    }

    for (const variableDecl of config.variables) {
      this.checkerEnv.addVariables(variableDecl);
    }
    for (const constantDecl of config.constants) {
      this.checkerEnv.addConstants(constantDecl);
    }
    for (const funcDecl of config.functions) {
      this.checkerEnv.addFunctions(funcDecl);
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
    if (parseResult.tree === undefined) {
      throw new ParseError(parseResult.error ?? "failed to parse expression");
    }

    // Convert ANTLR parse tree to our AST with macro expansion
    const helper = new ParserHelper(expression, { macros: this.config.macros });
    const ast = helper.parse(parseResult.tree);
    return new Ast(ast, expression);
  }

  /**
   * Parse and type-check an expression.
   * Throws CompileError on failure.
   */
  compile(expression: string): Ast {
    const parseResult = this.parser.parse(expression);
    if (parseResult.tree === undefined) {
      throw new ParseError(parseResult.error ?? "failed to parse expression");
    }

    // Convert ANTLR parse tree to our AST with macro expansion
    const helper = new ParserHelper(expression, { macros: this.config.macros });
    const ast = helper.parse(parseResult.tree);

    if (this.config.disableTypeChecking) {
      return new Ast(ast, expression);
    }

    const checkResult = new Checker(this.checkerEnv, ast.typeMap, ast.refMap).check(ast);

    if (checkResult.errors.hasErrors()) {
      const issues = new Issues(checkResult.errors, expression);
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

    const checkResult = new Checker(this.checkerEnv, celAst.root.typeMap, celAst.root.refMap).check(
      celAst.root
    );

    if (checkResult.errors.hasErrors()) {
      const issues = new Issues(checkResult.errors, celAst.source);
      throw new CompileError(issues.toString(), issues);
    }

    celAst.markChecked();
    return celAst;
  }

  /**
   * Create a Program from an Ast.
   */
  program(celAst: Ast): Program {
    const provider = this.config.typeProvider
      ? new CompositeTypeProvider([this.config.structProvider, this.config.typeProvider])
      : this.config.structProvider;
    const planner = new Planner({
      dispatcher: this.dispatcher,
      refMap: celAst.isChecked ? celAst.root.refMap : undefined,
      typeProvider: provider,
      typeMap: celAst.isChecked ? celAst.root.typeMap : undefined,
      container: this.config.container,
      enumValuesAsInt: this.config.enumValuesAsInt,
    });

    const interpretable = planner.plan(celAst.root);
    return new Program(interpretable, celAst.root.sourceInfo);
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
  container = "";
  variables: VariableDecl[] = [];
  constants: ConstantDecl[] = [];
  functions: FunctionDecl[] = [];
  functionOverloads = new Map<string, DispatcherOverload[]>();
  structProvider: StructTypeProvider = new StructTypeProvider();
  typeProvider: TypeProvider | undefined = undefined;
  disableStandardLibrary = false;
  disableTypeChecking = false;
  macros: Macro[] = [...AllMacros];
  enumValuesAsInt = false;

  clone(): EnvConfig {
    const clone = new EnvConfig();
    clone.container = this.container;
    clone.variables = [...this.variables];
    clone.constants = [...this.constants];
    clone.functions = [...this.functions];
    clone.functionOverloads = new Map(
      [...this.functionOverloads.entries()].map(([name, overloads]) => [name, [...overloads]])
    );
    clone.structProvider = new StructTypeProvider(this.structProvider.structDecls());
    clone.typeProvider = this.typeProvider;
    clone.disableStandardLibrary = this.disableStandardLibrary;
    clone.disableTypeChecking = this.disableTypeChecking;
    clone.macros = [...this.macros];
    clone.enumValuesAsInt = this.enumValuesAsInt;
    return clone;
  }

  apply(options: EnvOptions = {}): void {
    for (const variable of options.variables ?? []) {
      variable.register(this);
    }

    for (const constant of options.constants ?? []) {
      constant.register(this);
    }

    for (const funcOption of options.functions ?? []) {
      funcOption.register(this);
    }

    for (const structOption of options.structs ?? []) {
      structOption.register(this);
    }

    if (options.typeProvider) {
      this.typeProvider = options.typeProvider;
    }

    if (options.container !== undefined) {
      this.container = options.container;
    }

    if (options.disableStandardLibrary) {
      this.disableStandardLibrary = true;
    }

    if (options.disableTypeChecking) {
      this.disableTypeChecking = true;
    }

    if (options.macros) {
      this.macros = [...this.macros, ...options.macros];
    }

    if (options.enumValuesAsInt !== undefined) {
      this.enumValuesAsInt = options.enumValuesAsInt;
    }
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export { ProtobufTypeProvider } from "./checker/provider";
export {
  EmptyActivation,
  HierarchicalActivation,
  LazyActivation,
  MapActivation,
  MutableActivation,
  PartialActivation,
  StrictActivation
} from "./interpreter/activation";
/**
 * Activation interface for evaluation bindings.
 */
export type { Activation } from "./interpreter/activation";
export {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  EnumValue,
  ErrorValue,
  IntValue, ListValue,
  MapValue,
  NullValue,
  StringValue,
  TimestampValue, TypeValue,
  UintValue, isErrorValue,
  isUnknownValue, toTypeValue
} from "./interpreter/values";
/**
 * Value union type for CEL runtime values.
 */
export type { Value } from "./interpreter/values";

// CEL Interpreter
// Main interpreter implementation
// Implementation based on cel-go's cel/program.go and interpreter/interpreter.go

import {
  CharStream,
  CommonTokenStream,
  type ErrorListener,
  type Recognizer,
  type Token,
} from "antlr4";
import { type CheckResult, Checker } from "../checker/checker";
import { type FunctionDecl, VariableDecl } from "../checker/decls";
import { CheckerEnv, Container } from "../checker/env";
import { StandardLibrary } from "../checker/stdlib";
import type { SourceInfo } from "../common/source";
import CELLexer from "../parser/gen/CELLexer.js";
import CELParser, { type StartContext } from "../parser/gen/CELParser.js";
import { ParserHelper } from "../parser/helper";
import { type Activation, EmptyActivation, LazyActivation, MapActivation } from "./activations";
import { DefaultDispatcher, type Dispatcher } from "./dispatcher";
import { standardFunctions } from "./functions";
import type { Interpretable } from "./interpretable";
import { Planner } from "./planner";
import { DefaultTypeAdapter, ErrorValue, type TypeAdapter, type Value, ValueUtil } from "./values";

/**
 * Program input types for evaluation.
 */
type ProgramInput = Activation | Map<string, Value> | Record<string, unknown>;

/**
 * Result of evaluating a CEL expression.
 */
export interface EvalResult {
  /** The result value */
  value: Value;
  /** Whether evaluation succeeded */
  success: boolean;
  /** Error message if evaluation failed */
  error?: string | undefined;
}

/**
 * Declaration types for the environment.
 */
export type Declaration = VariableDecl | FunctionDecl;

/**
 * Environment options for creating an interpreter.
 */
export interface EnvOptions {
  /** Variable declarations */
  declarations?: Declaration[];
  /** Custom functions */
  functions?: Dispatcher;
  /** Type adapter for native value conversion */
  adapter?: TypeAdapter;
  /** Disable type checking */
  disableTypeChecking?: boolean;
  /** Container name for type resolution */
  container?: string;
  /** Treat enum values as ints (legacy semantics) */
  enumValuesAsInt?: boolean;
}

/**
 * CEL Environment for compiling and running expressions.
 */
export class Env {
  private readonly checkerEnv: CheckerEnv;
  private readonly dispatcher: Dispatcher;
  private readonly adapter: TypeAdapter;
  private readonly disableTypeChecking: boolean;
  private readonly containerName: string;
  private readonly declarationsList: Declaration[];

  constructor(options: EnvOptions = {}) {
    this.containerName = options.container ?? "";
    this.declarationsList = options.declarations ?? [];
    this.checkerEnv = new CheckerEnv(
      new Container(this.containerName),
      undefined,
      options.enumValuesAsInt ?? false
    );

    // Add standard library functions
    for (const fn of StandardLibrary.functions()) {
      this.checkerEnv.addFunctions(fn);
    }

    // Add user declarations
    for (const decl of this.declarationsList) {
      if ("overloads" in decl) {
        this.checkerEnv.addFunctions(decl as FunctionDecl);
      } else {
        this.checkerEnv.addVariables(decl as VariableDecl);
      }
    }

    this.adapter = options.adapter ?? new DefaultTypeAdapter();
    this.disableTypeChecking = options.disableTypeChecking ?? false;

    // Initialize dispatcher
    this.dispatcher = options.functions ?? new DefaultDispatcher();
    for (const overload of standardFunctions) {
      this.dispatcher.add(overload);
    }
  }

  /**
   * Compile a CEL expression into a Program.
   */
  compile(expression: string): CompileResult {
    // Parse
    const parseResult = this.parse(expression);
    if (parseResult.error) {
      return {
        program: undefined,
        error: parseResult.error,
      };
    }

    const tree = parseResult.tree!;

    // Convert ANTLR parse tree to our AST with macro expansion
    const helper = new ParserHelper(expression);
    const ast = helper.parse(tree);

    // Type check (if enabled)
    let checkResult: CheckResult | undefined;
    if (!this.disableTypeChecking) {
      checkResult = new Checker(this.checkerEnv, ast.typeMap, ast.refMap).check(ast);

      if (checkResult.errors.hasErrors()) {
        return {
          program: undefined,
          error: checkResult.errors.toString(),
        };
      }
    }

    // Generate Interpretable with planner
    const planner = new Planner({
      dispatcher: this.dispatcher,
      refMap: checkResult ? ast.refMap : undefined,
    });

    const interpretable = planner.plan(ast);

    // Create Program
    const program = new Program(
      interpretable,
      checkResult,
      this.adapter,
      ast.sourceInfo
    );

    return {
      program,
      error: undefined,
    };
  }

  /**
   * Parse a CEL expression.
   */
  private parse(expression: string): ParseResult {
    try {
      const chars = new CharStream(expression);
      const lexer = new CELLexer(chars);
      const tokens = new CommonTokenStream(lexer);
      const parser = new CELParser(tokens);

      // Set up error listener
      const errors: string[] = [];
      parser.removeErrorListeners();
      // ANTLR4's ErrorListener interface may require additional methods
      const errorListener = {
        syntaxError: (
          _recognizer: Recognizer<Token>,
          _offendingSymbol: Token | null,
          line: number,
          column: number,
          msg: string,
          _e: unknown
        ) => {
          errors.push(`line ${line}:${column} ${msg}`);
        },
        reportAmbiguity: () => {
          // Ignore ambiguity
        },
        reportAttemptingFullContext: () => {
          // Ignore full context attempts
        },
        reportContextSensitivity: () => {
          // Ignore context sensitivity
        },
      } as ErrorListener<Token>;
      parser.addErrorListener(errorListener);

      const tree = parser.start();

      if (errors.length > 0) {
        return {
          tree: undefined,
          error: errors.join("\n"),
        };
      }

      return {
        tree,
        error: undefined,
      };
    } catch (e) {
      return {
        tree: undefined,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Add declarations to the environment.
   */
  extend(declarations: Declaration[]): Env {
    return new Env({
      declarations: [...this.declarationsList, ...declarations],
      functions: this.dispatcher,
      adapter: this.adapter,
      disableTypeChecking: this.disableTypeChecking,
      container: this.containerName,
    });
  }
}

/**
 * Result of compiling a CEL expression.
 */
export interface CompileResult {
  program: Program | undefined;
  error: string | undefined;
}

/**
 * Result of parsing a CEL expression.
 */
interface ParseResult {
  tree: StartContext | undefined;
  error: string | undefined;
}

/**
 * Program implementation using Interpretable.
 */
export class Program {
  constructor(
    private readonly interpretable: Interpretable,
    private readonly checkResultValue: CheckResult | undefined,
    private readonly adapter: TypeAdapter,
    private readonly sourceInfo: SourceInfo
  ) { }

  eval(vars?: ProgramInput): EvalResult {
    // Prepare activation
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

    // Evaluate
    try {
      const value = this.interpretable.eval(activation);

      if (ValueUtil.isError(value)) {
        const formatted = formatRuntimeError(value as ErrorValue, this.sourceInfo);
        return {
          value,
          success: false,
          error: formatted,
        };
      }

      return {
        value,
        success: true,
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return {
        value: ErrorValue.create(errorMessage),
        success: false,
        error: errorMessage,
      };
    }
  }

  checkResult(): CheckResult | undefined {
    return this.checkResultValue;
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

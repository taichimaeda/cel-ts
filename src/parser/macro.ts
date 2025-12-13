// CEL Macros
// Parse-time expansion of macro calls to comprehension expressions
// Ported from cel-go/parser/macro.go

import {
  AccumulatorName,
  type Expr,
  ExprKind,
  type IdentExpr,
  type SelectExpr,
} from "../common/ast";
import type { ParserHelper } from "./helper";

// Re-export AccumulatorName
export { AccumulatorName } from "../common/ast";

/**
 * Error during macro expansion.
 */
export class MacroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MacroError";
  }
}

/**
 * Macro expander function type.
 * Takes a helper, optional target (for receiver-style macros), and arguments.
 * Returns the expanded expression or null if expansion should not occur.
 * Throws MacroError if the macro matches but arguments are invalid.
 */
export type MacroExpander = (
  parser: ParserHelper,
  target: Expr | null,
  args: Expr[]
) => Expr | null;

/**
 * Macro interface for describing function signature and expansion.
 */
export interface Macro {
  /** Function name to match */
  function(): string;
  /** Expected argument count (0 for vararg) */
  argCount(): number;
  /** Whether this is a receiver-style macro */
  isReceiverStyle(): boolean;
  /** Generate the macro key for lookup */
  macroKey(): string;
  /** Get the expander function */
  expander(): MacroExpander;
}

/**
 * Concrete macro implementation.
 */
class BaseMacro implements Macro {
  private readonly _function: string;
  private readonly _argCount: number;
  private readonly _receiverStyle: boolean;
  private readonly _varArgStyle: boolean;
  private readonly _expander: MacroExpander;

  constructor(
    fn: string,
    argCount: number,
    expander: MacroExpander,
    receiverStyle = false,
    varArgStyle = false
  ) {
    this._function = fn;
    this._argCount = argCount;
    this._expander = expander;
    this._receiverStyle = receiverStyle;
    this._varArgStyle = varArgStyle;
  }

  function(): string {
    return this._function;
  }

  argCount(): number {
    return this._argCount;
  }

  isReceiverStyle(): boolean {
    return this._receiverStyle;
  }

  macroKey(): string {
    if (this._varArgStyle) {
      return makeVarArgMacroKey(this._function, this._receiverStyle);
    }
    return makeMacroKey(this._function, this._argCount, this._receiverStyle);
  }

  expander(): MacroExpander {
    return this._expander;
  }
}

/**
 * Create a macro key from function name, arg count, and receiver style.
 */
export function makeMacroKey(name: string, args: number, receiverStyle: boolean): string {
  return `${name}:${args}:${receiverStyle}`;
}

/**
 * Create a vararg macro key.
 */
export function makeVarArgMacroKey(name: string, receiverStyle: boolean): string {
  return `${name}:*:${receiverStyle}`;
}

/**
 * Macro variants for convenience.
 */
export class GlobalMacro extends BaseMacro {
  constructor(fn: string, argCount: number, expander: MacroExpander) {
    super(fn, argCount, expander, false, false);
  }
}

export class ReceiverMacro extends BaseMacro {
  constructor(fn: string, argCount: number, expander: MacroExpander) {
    super(fn, argCount, expander, true, false);
  }
}

export class GlobalVarArgMacro extends BaseMacro {
  constructor(fn: string, expander: MacroExpander) {
    super(fn, 0, expander, false, true);
  }
}

export class ReceiverVarArgMacro extends BaseMacro {
  constructor(fn: string, expander: MacroExpander) {
    super(fn, 0, expander, true, true);
  }
}

// Operator constants for macro expansions
const Operators = {
  // Logical operators
  LogicalAnd: "_&&_",
  LogicalOr: "_||_",
  LogicalNot: "!_",
  NotStrictlyFalse: "@not_strictly_false",

  // Comparison operators
  Equals: "_==_",

  // Arithmetic operators
  Add: "_+_",

  // Ternary operator
  Conditional: "_?_:_",
};

/**
 * Quantifier kinds for all/exists/exists_one.
 */
enum QuantifierKind {
  All = 0,
  Exists = 1,
  ExistsOne = 2,
}

/**
 * Extract identifier name from an expression.
 */
function extractIdent(e: Expr): string | null {
  if (e.kind === ExprKind.Ident) {
    return (e as IdentExpr).name;
  }
  return null;
}

/**
 * Create a quantifier comprehension (all, exists, exists_one).
 */
function makeQuantifier(
  kind: QuantifierKind,
  parser: ParserHelper,
  target: Expr | null,
  args: Expr[]
): Expr | null {
  const v = extractIdent(args[0]!);
  if (!v) {
    throw parser.createError("argument must be a simple name");
  }

  const accu = parser.accuIdentName();
  if (v === accu || v === AccumulatorName) {
    throw parser.createError("iteration variable overwrites accumulator variable");
  }

  let init: Expr;
  let condition: Expr;
  let step: Expr;
  let result: Expr;

  switch (kind) {
    case QuantifierKind.All:
      // all: starts true, short-circuits on false
      init = parser.createLiteral(true);
      condition = parser.createCall(Operators.NotStrictlyFalse, parser.createAccuIdent());
      step = parser.createCall(Operators.LogicalAnd, parser.createAccuIdent(), args[1]!);
      result = parser.createAccuIdent();
      break;

    case QuantifierKind.Exists:
      // exists: starts false, short-circuits on true
      init = parser.createLiteral(false);
      condition = parser.createCall(
        Operators.NotStrictlyFalse,
        parser.createCall(Operators.LogicalNot, parser.createAccuIdent())
      );
      step = parser.createCall(Operators.LogicalOr, parser.createAccuIdent(), args[1]!);
      result = parser.createAccuIdent();
      break;

    case QuantifierKind.ExistsOne:
      // exists_one: count matches, result is count == 1
      init = parser.createLiteral(0n);
      condition = parser.createLiteral(true);
      step = parser.createCall(
        Operators.Conditional,
        args[1]!,
        parser.createCall(Operators.Add, parser.createAccuIdent(), parser.createLiteral(1n)),
        parser.createAccuIdent()
      );
      result = parser.createCall(
        Operators.Equals,
        parser.createAccuIdent(),
        parser.createLiteral(1n)
      );
      break;
  }

  return parser.createComprehension(target!, v, accu, init, condition, step, result);
}

/**
 * makeAll expands `target.all(var, predicate)` into a comprehension.
 */
export function makeAll(parser: ParserHelper, target: Expr | null, args: Expr[]): Expr | null {
  return makeQuantifier(QuantifierKind.All, parser, target, args);
}

/**
 * makeExists expands `target.exists(var, predicate)` into a comprehension.
 */
export function makeExists(parser: ParserHelper, target: Expr | null, args: Expr[]): Expr | null {
  return makeQuantifier(QuantifierKind.Exists, parser, target, args);
}

/**
 * makeExistsOne expands `target.exists_one(var, predicate)` into a comprehension.
 */
export function makeExistsOne(
  parser: ParserHelper,
  target: Expr | null,
  args: Expr[]
): Expr | null {
  return makeQuantifier(QuantifierKind.ExistsOne, parser, target, args);
}

/**
 * makeMap expands `target.map(var, transform)` or `target.map(var, predicate, transform)`.
 */
export function makeMap(parser: ParserHelper, target: Expr | null, args: Expr[]): Expr | null {
  const v = extractIdent(args[0]!);
  if (!v) {
    throw parser.createError("argument is not an identifier");
  }

  const accu = parser.accuIdentName();
  if (v === accu || v === AccumulatorName) {
    throw parser.createError("iteration variable overwrites accumulator variable");
  }

  let fn: Expr;
  let filter: Expr | null;

  if (args.length === 3) {
    // map(var, predicate, transform)
    filter = args[1]!;
    fn = args[2]!;
  } else {
    // map(var, transform)
    filter = null;
    fn = args[1]!;
  }

  const init = parser.createList();
  const condition = parser.createLiteral(true);
  let step = parser.createCall(Operators.Add, parser.createAccuIdent(), parser.createList(fn));

  if (filter) {
    step = parser.createCall(Operators.Conditional, filter, step, parser.createAccuIdent());
  }

  return parser.createComprehension(
    target!,
    v,
    accu,
    init,
    condition,
    step,
    parser.createAccuIdent()
  );
}

/**
 * makeFilter expands `target.filter(var, predicate)`.
 */
export function makeFilter(parser: ParserHelper, target: Expr | null, args: Expr[]): Expr | null {
  const v = extractIdent(args[0]!);
  if (!v) {
    throw parser.createError("argument is not an identifier");
  }

  const accu = parser.accuIdentName();
  if (v === accu || v === AccumulatorName) {
    throw parser.createError("iteration variable overwrites accumulator variable");
  }

  const filter = args[1]!;
  const init = parser.createList();
  const condition = parser.createLiteral(true);

  // When filter is true, add the iteration variable to the result
  let step = parser.createCall(
    Operators.Add,
    parser.createAccuIdent(),
    parser.createList(parser.createIdent(v))
  );
  step = parser.createCall(Operators.Conditional, filter, step, parser.createAccuIdent());

  return parser.createComprehension(
    target!,
    v,
    accu,
    init,
    condition,
    step,
    parser.createAccuIdent()
  );
}

/**
 * makeHas expands `has(obj.field)` into a presence test.
 */
export function makeHas(parser: ParserHelper, _target: Expr | null, args: Expr[]): Expr | null {
  const arg = args[0]!;
  if (arg.kind === ExprKind.Select) {
    const select = arg as SelectExpr;
    return parser.createPresenceTest(select.operand, select.field);
  }
  throw parser.createError("invalid argument to has() macro");
}

// Standard macros
export const HasMacro = new GlobalMacro("has", 1, makeHas);
export const AllMacro = new ReceiverMacro("all", 2, makeAll);
export const ExistsMacro = new ReceiverMacro("exists", 2, makeExists);
export const ExistsOneMacro = new ReceiverMacro("exists_one", 2, makeExistsOne);
export const ExistsOneMacroNew = new ReceiverMacro("existsOne", 2, makeExistsOne);
export const MapMacro = new ReceiverMacro("map", 2, makeMap);
export const MapFilterMacro = new ReceiverMacro("map", 3, makeMap);
export const FilterMacro = new ReceiverMacro("filter", 2, makeFilter);

/**
 * All standard macros.
 */
export const AllMacros: Macro[] = [
  HasMacro,
  AllMacro,
  ExistsMacro,
  ExistsOneMacro,
  ExistsOneMacroNew,
  MapMacro,
  MapFilterMacro,
  FilterMacro,
];

/**
 * No macros (empty list).
 */
export const NoMacros: Macro[] = [];

/**
 * Macro registry for looking up macros by key.
 */
export class MacroRegistry {
  private readonly macros: Map<string, Macro> = new Map();

  constructor(macros: Macro[] = AllMacros) {
    for (const m of macros) {
      this.macros.set(m.macroKey(), m);
    }
  }

  /**
   * Find a macro by function name, arg count, and receiver style.
   */
  findMacro(name: string, argCount: number, receiverStyle: boolean): Macro | undefined {
    // Try exact match first
    const key = makeMacroKey(name, argCount, receiverStyle);
    let macro = this.macros.get(key);
    if (macro) {
      return macro;
    }

    // Try vararg match
    const varArgKey = makeVarArgMacroKey(name, receiverStyle);
    macro = this.macros.get(varArgKey);
    return macro;
  }

  /**
   * Add a macro to the registry.
   */
  addMacro(macro: Macro): void {
    this.macros.set(macro.macroKey(), macro);
  }

  /**
   * Check if any macros are registered.
   */
  hasMacros(): boolean {
    return this.macros.size > 0;
  }
}

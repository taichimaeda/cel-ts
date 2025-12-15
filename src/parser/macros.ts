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
import { Operators } from "./operators";

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
 * Takes a parser helper (for constructing AST expressions),
 * optional target (for receiver-style macros), and arguments.
 * Returns the expanded expression or null if expansion should not occur.
 * Throws MacroError if the macro matches but arguments are invalid.
 */
export type MacroExpander = (
  helper: ParserHelper,
  target: Expr | null,
  args: Expr[]
) => Expr | null;

/**
 * Macro interface for describing function signature and expansion.
 */
export interface Macro {
  /** Function name to match */
  readonly name: string;
  /** Expected argument count (0 for vararg) */
  readonly argCount: number;
  /** Whether this is a receiver-style macro */
  readonly receiverStyle: boolean;
  /** Whether this macro accepts a variable number of arguments */
  readonly varArgStyle: boolean;
  /** Generate the macro key for lookup */
  macroKey(): string;
  /** Get the expander function */
  readonly expander: MacroExpander;
}

/**
 * Concrete macro implementation.
 */
class BaseMacro implements Macro {
  constructor(
    readonly name: string,
    readonly argCount: number,
    readonly expander: MacroExpander,
    readonly receiverStyle = false,
    readonly varArgStyle = false
  ) {
  }

  macroKey(): string {
    if (this.varArgStyle) {
      return makeVarArgMacroKey(this.name, this.receiverStyle);
    }
    return makeMacroKey(this.name, this.argCount, this.receiverStyle);
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
 * makeAll expands `target.all(var, predicate)` into a comprehension.
 */
export const makeAll: MacroExpander = (helper, target, args) => {
  const variable = extractIdent(args[0]!);
  if (!variable) {
    throw new MacroError("argument must be a simple name");
  }

  const accu = AccumulatorName;
  if (variable === accu) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  // accu = true
  const init = helper.createLiteral(true);
  // continue while accu truthy
  const condition = helper.createCall(Operators.NotStrictlyFalse, helper.createAccuIdent());
  // accu = accu && predicate
  const step = helper.createCall(Operators.LogicalAnd, helper.createAccuIdent(), args[1]!);
  // final result is accumulator
  const result = helper.createAccuIdent();

  return helper.createComprehension(target!, variable, accu, init, condition, step, result);
};

/**
 * makeExists expands `target.exists(var, predicate)` into a comprehension.
 */
export const makeExists: MacroExpander = (helper, target, args) => {
  const variable = extractIdent(args[0]!);
  if (!variable) {
    throw new MacroError("argument must be a simple name");
  }

  const accu = AccumulatorName;
  if (variable === accu) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  // accu = false
  const init = helper.createLiteral(false);
  // stop once accu becomes true
  const condition = helper.createCall(
    Operators.NotStrictlyFalse,
    helper.createCall(Operators.LogicalNot, helper.createAccuIdent())
  );
  // accu = accu || predicate
  const step = helper.createCall(Operators.LogicalOr, helper.createAccuIdent(), args[1]!);
  // final result is accumulator
  const result = helper.createAccuIdent();

  return helper.createComprehension(target!, variable, accu, init, condition, step, result);
};

/**
 * makeExistsOne expands `target.exists_one(var, predicate)` into a comprehension.
 */
export const makeExistsOne: MacroExpander = (helper, target, args) => {
  const variable = extractIdent(args[0]!);
  if (!variable) {
    throw new MacroError("argument must be a simple name");
  }

  const accu = AccumulatorName;
  if (variable === accu) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  // accu = 0 (match count)
  const init = helper.createLiteral(0n);
  // always iterate
  const condition = helper.createLiteral(true);
  const step = helper.createCall(
    Operators.Conditional,
    args[1]!,
    helper.createCall(Operators.Add, helper.createAccuIdent(), helper.createLiteral(1n)),
    helper.createAccuIdent()
  );
  // increment count when predicate true
  // res == 1
  const result = helper.createCall(
    Operators.Equals,
    helper.createAccuIdent(),
    helper.createLiteral(1n)
  );

  return helper.createComprehension(target!, variable, accu, init, condition, step, result);
};

/**
 * makeMap expands `target.map(var, transform)` or `target.map(var, predicate, transform)`.
 */
export const makeMap: MacroExpander = (
  helper,
  target,
  args
) => {
  const variable = extractIdent(args[0]!);
  if (!variable) {
    throw new MacroError("argument is not an identifier");
  }

  const accu = AccumulatorName;
  if (variable === accu) {
    throw new MacroError("iteration variable overwrites accumulator variable");
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

  // accu = []
  const init = helper.createList();
  // iterate entire input
  const condition = helper.createLiteral(true);
  let step = helper.createCall(Operators.Add, helper.createAccuIdent(), helper.createList(fn));

  if (filter) {
    step = helper.createCall(Operators.Conditional, filter, step, helper.createAccuIdent());
  }

  return helper.createComprehension(
    target!,
    variable,
    accu,
    init,
    condition,
    step,
    helper.createAccuIdent()
  );
};

/**
 * makeFilter expands `target.filter(var, predicate)`.
 */
export const makeFilter: MacroExpander = (
  helper,
  target,
  args
) => {
  const variable = extractIdent(args[0]!);
  if (!variable) {
    throw new MacroError("argument is not an identifier");
  }

  const accu = AccumulatorName;
  if (variable === accu) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  const filter = args[1]!;
  // accu = []
  const init = helper.createList();
  // iterate entire input
  const condition = helper.createLiteral(true);

  // When filter is true, add the iteration variable to the result
  let step = helper.createCall(
    Operators.Add,
    helper.createAccuIdent(),
    helper.createList(helper.createIdent(variable))
  );
  step = helper.createCall(Operators.Conditional, filter, step, helper.createAccuIdent());

  return helper.createComprehension(
    target!,
    variable,
    accu,
    init,
    condition,
    step,
    helper.createAccuIdent()
  );
};

/**
 * makeHas expands `has(obj.field)` into a presence test.
 */
export const makeHas: MacroExpander = (
  helper,
  _target,
  args
) => {
  const arg = args[0]!;
  if (arg.kind === ExprKind.Select) {
    const select = arg as SelectExpr;
    return helper.createPresenceTest(select.operand, select.field);
  }
  throw new MacroError("invalid argument to has() macro");
};

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

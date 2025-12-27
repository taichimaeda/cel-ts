// CEL Macros
// Parse-time expansion of macro calls to comprehension expressions
// Ported from cel-go/parser/macro.go

import { Operators } from "../common";
import { AccumulatorName, type Expr, IdentExpr, SelectExpr } from "../common/ast";
import type { ParserHelper } from "./helper";

// Re-export AccumulatorName
export { AccumulatorName } from "../common/ast";

/**
 * Error during macro expansion.
 */
export class MacroError extends Error {
  override name = "MacroError";
}

/**
 * Macro expander function type.
 * Takes a parser helper (for constructing AST expressions),
 * optional target (for receiver-style macros), and arguments.
 * Returns the expanded expression or undefined if expansion should not occur.
 * Throws MacroError if the macro matches but arguments are invalid.
 */
export type MacroExpander = (
  helper: ParserHelper,
  target: Expr | undefined,
  args: Expr[]
) => Expr | undefined;

/**
 * Union type for all macro variants.
 */
export type Macro = GlobalMacro | ReceiverMacro | GlobalVarArgMacro | ReceiverVarArgMacro;

/**
 * Macro call style discriminator.
 */
export type MacroKind = "global" | "receiver" | "global_vararg" | "receiver_vararg";

/**
 * Concrete macro implementation.
 */
class BaseMacro {
  constructor(
    readonly name: string,
    readonly argCount: number,
    readonly expander: MacroExpander,
    readonly receiverStyle = false,
    readonly varArgStyle = false
  ) { }

  macroKey(): string {
    if (this.varArgStyle) {
      return macroKeyForVarArg(this.name, this.receiverStyle);
    }
    return macroKeyForArity(this.name, this.argCount, this.receiverStyle);
  }
}

/**
 * Macro key builder for lookup.
 */
function macroKeyForArity(name: string, args: number, receiverStyle: boolean): string {
  return `${name}:${args}:${receiverStyle}`;
}

function macroKeyForVarArg(name: string, receiverStyle: boolean): string {
  return `${name}:*:${receiverStyle}`;
}

/**
 * Global-style macro with fixed argument count.
 */
export class GlobalMacro extends BaseMacro {
  readonly kind: MacroKind = "global";

  constructor(funcName: string, argCount: number, expander: MacroExpander) {
    super(funcName, argCount, expander, false, false);
  }
}

/**
 * Receiver-style macro with fixed argument count.
 */
export class ReceiverMacro extends BaseMacro {
  readonly kind: MacroKind = "receiver";

  constructor(funcName: string, argCount: number, expander: MacroExpander) {
    super(funcName, argCount, expander, true, false);
  }
}

/**
 * Global-style macro with variable argument count.
 */
export class GlobalVarArgMacro extends BaseMacro {
  readonly kind: MacroKind = "global_vararg";

  constructor(funcName: string, expander: MacroExpander) {
    super(funcName, 0, expander, false, true);
  }
}

/**
 * Receiver-style macro with variable argument count.
 */
export class ReceiverVarArgMacro extends BaseMacro {
  readonly kind: MacroKind = "receiver_vararg";

  constructor(funcName: string, expander: MacroExpander) {
    super(funcName, 0, expander, true, true);
  }
}

/**
 * Extract identifier name from an expression.
 */
function extractIdent(expr: Expr): string | undefined {
  if (expr instanceof IdentExpr) {
    return expr.name;
  }
  return undefined;
}

/**
 * makeAll expands `target.all(var, predicate)` into a comprehension.
 */
export const makeAll: MacroExpander = (helper, target, args) => {
  const variable = extractIdent(args[0]!);
  if (variable === undefined) {
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
  if (variable === undefined) {
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
  if (variable === undefined) {
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
    helper.createCall(
      Operators.Add,
      helper.createAccuIdent(),
      helper.createLiteral(1n)
    ),
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
export const makeMap: MacroExpander = (helper, target, args) => {
  const variable = extractIdent(args[0]!);
  if (variable === undefined) {
    throw new MacroError("argument is not an identifier");
  }

  const accu = AccumulatorName;
  if (variable === accu) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  let func: Expr;
  let filter: Expr | undefined;

  if (args.length === 3) {
    // map(var, predicate, transform)
    func = args[2]!;
    filter = args[1]!;
  } else {
    // map(var, transform)
    func = args[1]!;
    filter = undefined;
  }

  // accu = []
  const init = helper.createList();
  // iterate entire input
  const condition = helper.createLiteral(true);
  let step = helper.createCall(Operators.Add, helper.createAccuIdent(), helper.createList(func));

  if (filter !== undefined) {
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
export const makeFilter: MacroExpander = (helper, target, args) => {
  const variable = extractIdent(args[0]!);
  if (variable === undefined) {
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
export const makeHas: MacroExpander = (helper, _target, args) => {
  const arg = args[0]!;
  if (arg instanceof SelectExpr) {
    const select = arg;
    return helper.createPresenceTest(select.operand, select.field);
  }
  throw new MacroError("invalid argument to has() macro");
};

/**
 * Standard CEL macros.
 */
export const Macros = {
  Has: new GlobalMacro("has", 1, makeHas),
  All: new ReceiverMacro("all", 2, makeAll),
  Exists: new ReceiverMacro("exists", 2, makeExists),
  ExistsOne: new ReceiverMacro("exists_one", 2, makeExistsOne),
  ExistsOneNew: new ReceiverMacro("existsOne", 2, makeExistsOne),
  Map: new ReceiverMacro("map", 2, makeMap),
  MapFilter: new ReceiverMacro("map", 3, makeMap),
  Filter: new ReceiverMacro("filter", 2, makeFilter),
} as const;

/**
 * All standard macros as an array.
 */
export const AllMacros: Macro[] = [
  Macros.Has,
  Macros.All,
  Macros.Exists,
  Macros.ExistsOne,
  Macros.ExistsOneNew,
  Macros.Map,
  Macros.MapFilter,
  Macros.Filter,
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
    for (const macro of macros) {
      this.macros.set(macro.macroKey(), macro);
    }
  }

  /**
   * Find a macro by function name, arg count, and receiver style.
   */
  findMacro(name: string, argCount: number, receiverStyle: boolean): Macro | undefined {
    // Try exact match first
    const key = macroKeyForArity(name, argCount, receiverStyle);
    let macro = this.macros.get(key);
    if (macro !== undefined) {
      return macro;
    }

    // Try vararg match
    const varArgKey = macroKeyForVarArg(name, receiverStyle);
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

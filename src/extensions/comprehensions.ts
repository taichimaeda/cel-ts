import { Function, Overload, type EnvOptions } from "../cel";
import { MapType, TypeParamType } from "../checker/types";
import { AccumulatorName, IdentExpr, Operators, type Expr } from "../common/ast";
import {
  ErrorValue,
  MapValue,
  type MapEntry,
  type Value,
} from "../interpreter/values";
import { MacroError, ReceiverMacro, type Macro, type MacroExpander } from "../parser";
import type { Extension } from "./extensions";

export class TwoVarComprehensionsExtension implements Extension {
  envOptions(): EnvOptions {
    const macros: Macro[] = [
      new ReceiverMacro("all", 3, quantifierAll),
      new ReceiverMacro("exists", 3, quantifierExists),
      new ReceiverMacro("existsOne", 3, quantifierExistsOne),
      new ReceiverMacro("exists_one", 3, quantifierExistsOne),
      new ReceiverMacro("transformList", 3, transformList),
      new ReceiverMacro("transformList", 4, transformList),
      new ReceiverMacro("transformMap", 3, transformMap),
      new ReceiverMacro("transformMap", 4, transformMap),
      new ReceiverMacro("transformMapEntry", 3, transformMapEntry),
      new ReceiverMacro("transformMapEntry", 4, transformMapEntry),
    ];

    const kType = new TypeParamType("K");
    const vType = new TypeParamType("V");
    const mapKV = new MapType(kType, vType);

    const functions = [
      new Function(
        "cel.@mapInsert",
        new Overload("@mapInsert_map_key_value", [mapKV, kType, vType], mapKV, (args: Value[]) =>
          mapInsertKeyValue(args)
        ),
        new Overload("@mapInsert_map_map", [mapKV, mapKV], mapKV, (lhs: Value, rhs: Value) =>
          mapInsertMap(lhs, rhs)
        )
      ),
    ];

    return { macros, functions };
  }
}

const quantifierAll: MacroExpander = (helper, target, args) => {
  const iterVar1 = extractIdent(args[0]);
  const iterVar2 = extractIdent(args[1]);
  if (!iterVar1 || !iterVar2) {
    throw new MacroError("argument must be a simple name");
  }
  if (iterVar1 === AccumulatorName || iterVar2 === AccumulatorName) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  const init = helper.createLiteral(true);
  const condition = helper.createCall(Operators.NotStrictlyFalse, helper.createAccuIdent());
  const step = helper.createCall(Operators.LogicalAnd, helper.createAccuIdent(), args[2]!);
  const result = helper.createAccuIdent();

  return helper.createComprehension(
    target!,
    iterVar1,
    AccumulatorName,
    init,
    condition,
    step,
    result,
    iterVar2
  );
};

const quantifierExists: MacroExpander = (helper, target, args) => {
  const iterVar1 = extractIdent(args[0]);
  const iterVar2 = extractIdent(args[1]);
  if (!iterVar1 || !iterVar2) {
    throw new MacroError("argument must be a simple name");
  }
  if (iterVar1 === AccumulatorName || iterVar2 === AccumulatorName) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  const init = helper.createLiteral(false);
  const condition = helper.createCall(
    Operators.NotStrictlyFalse,
    helper.createCall(Operators.LogicalNot, helper.createAccuIdent())
  );
  const step = helper.createCall(Operators.LogicalOr, helper.createAccuIdent(), args[2]!);
  const result = helper.createAccuIdent();

  return helper.createComprehension(
    target!,
    iterVar1,
    AccumulatorName,
    init,
    condition,
    step,
    result,
    iterVar2
  );
};

const quantifierExistsOne: MacroExpander = (helper, target, args) => {
  const iterVar1 = extractIdent(args[0]);
  const iterVar2 = extractIdent(args[1]);
  if (!iterVar1 || !iterVar2) {
    throw new MacroError("argument must be a simple name");
  }
  if (iterVar1 === AccumulatorName || iterVar2 === AccumulatorName) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  const init = helper.createLiteral(0n);
  const condition = helper.createLiteral(true);
  const step = helper.createCall(
    Operators.Conditional,
    args[2]!,
    helper.createCall(Operators.Add, helper.createAccuIdent(), helper.createLiteral(1n)),
    helper.createAccuIdent()
  );
  const result = helper.createCall(
    Operators.Equals,
    helper.createAccuIdent(),
    helper.createLiteral(1n)
  );

  return helper.createComprehension(
    target!,
    iterVar1,
    AccumulatorName,
    init,
    condition,
    step,
    result,
    iterVar2
  );
};

const transformList: MacroExpander = (helper, target, args) => {
  const iterVar1 = extractIdent(args[0]);
  const iterVar2 = extractIdent(args[1]);
  if (!iterVar1 || !iterVar2) {
    throw new MacroError("argument must be a simple name");
  }
  if (iterVar1 === AccumulatorName || iterVar2 === AccumulatorName) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  const filter = args.length === 4 ? args[2]! : null;
  const transform = args.length === 4 ? args[3]! : args[2]!;

  const init = helper.createList();
  const condition = helper.createLiteral(true);
  let step = helper.createCall(
    Operators.Add,
    helper.createAccuIdent(),
    helper.createList(transform)
  );
  if (filter) {
    step = helper.createCall(Operators.Conditional, filter, step, helper.createAccuIdent());
  }
  const result = helper.createAccuIdent();

  return helper.createComprehension(
    target!,
    iterVar1,
    AccumulatorName,
    init,
    condition,
    step,
    result,
    iterVar2
  );
};

const transformMap: MacroExpander = (helper, target, args) => {
  const iterVar1 = extractIdent(args[0]);
  const iterVar2 = extractIdent(args[1]);
  if (!iterVar1 || !iterVar2) {
    throw new MacroError("argument must be a simple name");
  }
  if (iterVar1 === AccumulatorName || iterVar2 === AccumulatorName) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  const filter = args.length === 4 ? args[2]! : null;
  const transform = args.length === 4 ? args[3]! : args[2]!;

  const init = helper.createMap();
  const condition = helper.createLiteral(true);
  let step = helper.createCall(
    "cel.@mapInsert",
    helper.createAccuIdent(),
    helper.createIdent(iterVar1),
    transform
  );
  if (filter) {
    step = helper.createCall(Operators.Conditional, filter, step, helper.createAccuIdent());
  }
  const result = helper.createAccuIdent();

  return helper.createComprehension(
    target!,
    iterVar1,
    AccumulatorName,
    init,
    condition,
    step,
    result,
    iterVar2
  );
};

const transformMapEntry: MacroExpander = (helper, target, args) => {
  const iterVar1 = extractIdent(args[0]);
  const iterVar2 = extractIdent(args[1]);
  if (!iterVar1 || !iterVar2) {
    throw new MacroError("argument must be a simple name");
  }
  if (iterVar1 === AccumulatorName || iterVar2 === AccumulatorName) {
    throw new MacroError("iteration variable overwrites accumulator variable");
  }

  const filter = args.length === 4 ? args[2]! : null;
  const transform = args.length === 4 ? args[3]! : args[2]!;

  const init = helper.createMap();
  const condition = helper.createLiteral(true);
  let step = helper.createCall("cel.@mapInsert", helper.createAccuIdent(), transform);
  if (filter) {
    step = helper.createCall(Operators.Conditional, filter, step, helper.createAccuIdent());
  }
  const result = helper.createAccuIdent();

  return helper.createComprehension(
    target!,
    iterVar1,
    AccumulatorName,
    init,
    condition,
    step,
    result,
    iterVar2
  );
};

function extractIdent(expr: Expr | undefined): string | undefined {
  if (expr instanceof IdentExpr) {
    return expr.name;
  }
  return undefined;
}

function mapInsertKeyValue(args: Value[]): Value {
  const map = args[0];
  const key = args[1];
  const value = args[2];
  if (!(map instanceof MapValue)) {
    return ErrorValue.typeMismatch("map", map!);
  }
  if (!key || !value) {
    return ErrorValue.create("cel.@mapInsert expects map, key, value");
  }
  if (map.contains(key).value()) {
    return ErrorValue.create("duplicate map key");
  }
  const entries: MapEntry[] = [...map.value(), { key, value }];
  return MapValue.of(entries);
}

function mapInsertMap(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof MapValue) || !(rhs instanceof MapValue)) {
    return ErrorValue.create("cel.@mapInsert expects map arguments");
  }
  const entries: MapEntry[] = [...lhs.value()];
  for (const entry of rhs.value()) {
    if (lhs.contains(entry.key).value()) {
      return ErrorValue.create("duplicate map key");
    }
    entries.push(entry);
  }
  return MapValue.of(entries);
}

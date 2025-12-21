import { BoolType, type EnvOptions, Function, Overload } from "../cel";
import { ListType, TypeParamType } from "../checker/types";
import { BoolValue, ErrorValue, ListValue, type Value } from "../interpreter/values";
import { ReceiverVarArgMacro } from "../parser";
import type { Extension } from "./extensions";
import { macroTargetMatchesNamespace } from "./macros";

export class SetsExtension implements Extension {
  envOptions(): EnvOptions {
    const listType = new ListType(new TypeParamType("T"));
    return {
      macros: [
        new ReceiverVarArgMacro("contains", (helper, target, args) => {
          if (!macroTargetMatchesNamespace("sets", target)) {
            return null;
          }
          return helper.createCall("sets.contains", ...args);
        }),
        new ReceiverVarArgMacro("equivalent", (helper, target, args) => {
          if (!macroTargetMatchesNamespace("sets", target)) {
            return null;
          }
          return helper.createCall("sets.equivalent", ...args);
        }),
        new ReceiverVarArgMacro("intersects", (helper, target, args) => {
          if (!macroTargetMatchesNamespace("sets", target)) {
            return null;
          }
          return helper.createCall("sets.intersects", ...args);
        }),
      ],
      functions: [
        new Function(
          "sets.contains",
          new Overload("list_sets_contains_list", [listType, listType], BoolType, setsContains)
        ),
        new Function(
          "sets.equivalent",
          new Overload("list_sets_equivalent_list", [listType, listType], BoolType, setsEquivalent)
        ),
        new Function(
          "sets.intersects",
          new Overload("list_sets_intersects_list", [listType, listType], BoolType, setsIntersects)
        ),
      ],
    };
  }
}

function setsContains(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof ListValue) || !(rhs instanceof ListValue)) {
    return ErrorValue.create("sets.contains expects list arguments");
  }
  for (const elem of rhs.value()) {
    const contains = listContains(lhs, elem);
    if (contains instanceof ErrorValue) {
      return contains;
    }
    if (!contains) {
      return BoolValue.False;
    }
  }
  return BoolValue.True;
}

function setsEquivalent(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof ListValue) || !(rhs instanceof ListValue)) {
    return ErrorValue.create("sets.equivalent expects list arguments");
  }
  const leftContains = setsContains(lhs, rhs);
  if (leftContains instanceof ErrorValue) {
    return leftContains;
  }
  const rightContains = setsContains(rhs, lhs);
  if (rightContains instanceof ErrorValue) {
    return rightContains;
  }
  const leftBool = leftContains instanceof BoolValue ? leftContains.value() : false;
  const rightBool = rightContains instanceof BoolValue ? rightContains.value() : false;
  return BoolValue.of(leftBool && rightBool);
}

function setsIntersects(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof ListValue) || !(rhs instanceof ListValue)) {
    return ErrorValue.create("sets.intersects expects list arguments");
  }
  for (const elem of rhs.value()) {
    const contains = listContains(lhs, elem);
    if (contains instanceof ErrorValue) {
      return contains;
    }
    if (contains) {
      return BoolValue.True;
    }
  }
  return BoolValue.False;
}

function listContains(list: ListValue, value: Value): boolean | ErrorValue {
  for (const elem of list.value()) {
    const eq = elem.equal(value);
    if (eq instanceof ErrorValue) {
      return eq;
    }
    if (eq.value()) {
      return true;
    }
  }
  return false;
}

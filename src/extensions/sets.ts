import { BoolType, Function as CelFunction, type EnvOptions, Overload } from "../api";
import { ListType, TypeParamType } from "../checker/types";
import {
  BoolValue,
  ErrorValue,
  type ListValue,
  type Value,
  isBoolValue,
  isErrorValue,
  isListValue,
} from "../interpreter/values";
import { ReceiverVarArgMacro } from "../parser";
import type { Extension } from "./extensions";
import { macroTargetMatchesNamespace } from "./utils";

/**
 * Sets extension.
 * Provides sets.contains(), sets.equivalent(), and sets.intersects() for list-based set operations.
 */
export class SetsExtension implements Extension {
  envOptions(): EnvOptions {
    const listType = new ListType(new TypeParamType("T"));
    return {
      macros: [
        new ReceiverVarArgMacro("contains", (helper, target, args) => {
          if (!macroTargetMatchesNamespace("sets", target)) {
            return undefined;
          }
          return helper.createCall("sets.contains", ...args);
        }),
        new ReceiverVarArgMacro("equivalent", (helper, target, args) => {
          if (!macroTargetMatchesNamespace("sets", target)) {
            return undefined;
          }
          return helper.createCall("sets.equivalent", ...args);
        }),
        new ReceiverVarArgMacro("intersects", (helper, target, args) => {
          if (!macroTargetMatchesNamespace("sets", target)) {
            return undefined;
          }
          return helper.createCall("sets.intersects", ...args);
        }),
      ],
      functions: [
        new CelFunction(
          "sets.contains",
          new Overload("list_sets_contains_list", [listType, listType], BoolType, setsContains)
        ),
        new CelFunction(
          "sets.equivalent",
          new Overload("list_sets_equivalent_list", [listType, listType], BoolType, setsEquivalent)
        ),
        new CelFunction(
          "sets.intersects",
          new Overload("list_sets_intersects_list", [listType, listType], BoolType, setsIntersects)
        ),
      ],
    };
  }
}

function setsContains(lhs: Value, rhs: Value): Value {
  if (!(isListValue(lhs) && isListValue(rhs))) {
    return ErrorValue.of("sets.contains expects list arguments");
  }
  for (const elem of rhs.value()) {
    const contains = listContains(lhs, elem);
    if (typeof contains !== "boolean") {
      return contains;
    }
    if (!contains) {
      return BoolValue.False;
    }
  }
  return BoolValue.True;
}

function setsEquivalent(lhs: Value, rhs: Value): Value {
  if (!(isListValue(lhs) && isListValue(rhs))) {
    return ErrorValue.of("sets.equivalent expects list arguments");
  }
  const leftContains = setsContains(lhs, rhs);
  if (isErrorValue(leftContains)) {
    return leftContains;
  }
  const rightContains = setsContains(rhs, lhs);
  if (isErrorValue(rightContains)) {
    return rightContains;
  }
  const leftBool = isBoolValue(leftContains) ? leftContains.value() : false;
  const rightBool = isBoolValue(rightContains) ? rightContains.value() : false;
  return BoolValue.of(leftBool && rightBool);
}

function setsIntersects(lhs: Value, rhs: Value): Value {
  if (!(isListValue(lhs) && isListValue(rhs))) {
    return ErrorValue.of("sets.intersects expects list arguments");
  }
  for (const elem of rhs.value()) {
    const contains = listContains(lhs, elem);
    if (typeof contains !== "boolean") {
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
    if (isErrorValue(eq)) {
      return eq;
    }
    if (isBoolValue(eq) && eq.value()) {
      return true;
    }
  }
  return false;
}

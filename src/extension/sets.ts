import { BoolType, Function, Overload, type EnvOptions } from "../cel";
import { ListType, TypeParamType } from "../checker/type";
import { BoolValue, ErrorValue, ListValue, type Value } from "../interpreter/value";

type SetsConfig = { version: number };
export type SetsOption = (config: SetsConfig) => void;

export function SetsVersion(version: number): SetsOption {
  return (config) => {
    config.version = version;
  };
}

export function Sets(...options: SetsOption[]): EnvOptions {
  const config: SetsConfig = { version: Number.MAX_SAFE_INTEGER };
  for (const option of options) {
    option(config);
  }

  const listType = new ListType(new TypeParamType("T"));
  return {
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

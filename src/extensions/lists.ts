import { DynType, type EnvOptions, Function, IntType, MemberOverload, Overload } from "../cel";
import { ListType, type Type, TypeParamType } from "../checker/types";
import { CallExpr, ComprehensionExpr, IdentExpr, ListExpr, SelectExpr } from "../common/ast";
import {
  DoubleValue,
  ErrorValue,
  IntValue,
  ListValue,
  UintValue,
  type Value,
} from "../interpreter/values";
import { type Macro, MacroError, ReceiverMacro } from "../parser";
import { makeMap } from "../parser/macros";
import type { Extension } from "./extensions";
import { compareValues, isComparableValue } from "./utils";

export type ListsOptions = { version?: number };

export class ListsExtension implements Extension {
  private readonly version: number;

  constructor(options: ListsOptions = {}) {
    this.version = options.version ?? Number.MAX_SAFE_INTEGER;
  }

  envOptions(): EnvOptions {
    const elementParam = new TypeParamType("T");
    const keyParam = new TypeParamType("K");
    const listOfT: Type = new ListType(elementParam);
    const listOfK: Type = new ListType(keyParam);

    const functions = [
      new Function(
        "slice",
        new MemberOverload("list_slice", [listOfT, IntType, IntType], listOfT, (args: Value[]) =>
          sliceList(args)
        )
      ),
      new Function(
        "flatten",
        new MemberOverload(
          "list_flatten",
          [new ListType(DynType)],
          new ListType(DynType),
          (arg: Value) => flattenList(arg, 1)
        ),
        new MemberOverload(
          "list_flatten_int",
          [new ListType(DynType), IntType],
          new ListType(DynType),
          (args: Value[]) => {
            const list = args[0];
            const depth = args[1];
            if (!(depth instanceof IntValue)) {
              return ErrorValue.typeMismatch("int", depth!);
            }
            return flattenList(list!, Number(depth.value()));
          }
        )
      ),
      new Function(
        "reverse",
        new MemberOverload("list_reverse", [listOfT], listOfT, (arg: Value) => reverseList(arg))
      ),
      new Function(
        "distinct",
        new MemberOverload("list_distinct", [listOfT], listOfT, (arg: Value) => distinctList(arg))
      ),
      new Function(
        "sort",
        new MemberOverload("list_sort", [listOfT], listOfT, (arg: Value) => sortList(arg))
      ),
      new Function(
        "@sortByAssociatedKeys",
        new MemberOverload(
          "list_sortByAssociatedKeys",
          [listOfT, listOfK],
          listOfT,
          (args: Value[]) => sortByAssociatedKeys(args)
        )
      ),
      new Function(
        "lists.range",
        new Overload("lists_range_int", [IntType], new ListType(IntType), (arg: Value) =>
          rangeList(arg)
        )
      ),
    ];

    const macros: Macro[] = [];
    if (this.version >= 2) {
      macros.push(
        new ReceiverMacro("sortBy", 2, (helper, target, args) => {
          if (!target) {
            return null;
          }
          if (
            !(
              target instanceof ListExpr ||
              target instanceof SelectExpr ||
              target instanceof IdentExpr ||
              target instanceof ComprehensionExpr ||
              target instanceof CallExpr
            )
          ) {
            throw new MacroError(
              "sortBy can only be applied to a list, identifier, comprehension, call or select expression"
            );
          }

          const varName = "@__sortBy_input__";
          const varIdent = helper.createIdent(varName);
          const mapExpr = makeMap(helper, helper.createIdent(varName), args);
          if (!mapExpr) {
            throw new MacroError("sortBy failed to build key list expression");
          }
          const callExpr = helper.createMemberCall(
            "@sortByAssociatedKeys",
            helper.createIdent(varName),
            mapExpr
          );

          return helper.createComprehension(
            helper.createList(),
            "#unused",
            varName,
            target!,
            helper.createLiteral(false),
            varIdent,
            callExpr
          );
        })
      );
    }

    return { functions, macros };
  }
}

function sliceList(args: Value[]): Value {
  const list = args[0];
  const start = args[1];
  const end = args[2];
  if (!(list instanceof ListValue)) {
    return ErrorValue.typeMismatch("list", list!);
  }
  if (!(start instanceof IntValue) || !(end instanceof IntValue)) {
    return ErrorValue.create(`slice requires int start and end indexes`);
  }
  const startNum = toSafeNumber(start);
  const endNum = toSafeNumber(end);
  if (startNum instanceof ErrorValue) {
    return startNum;
  }
  if (endNum instanceof ErrorValue) {
    return endNum;
  }
  if (startNum < 0 || endNum < 0) {
    return ErrorValue.create(
      `cannot slice(${startNum}, ${endNum}), negative indexes not supported`
    );
  }
  if (startNum > endNum) {
    return ErrorValue.create(
      `cannot slice(${startNum}, ${endNum}), start index must be less than or equal to end index`
    );
  }
  const elements = list.value();
  if (endNum > elements.length) {
    return ErrorValue.create(
      `cannot slice(${startNum}, ${endNum}), list is length ${elements.length}`
    );
  }
  return ListValue.of(elements.slice(startNum, endNum));
}

function flattenList(value: Value, depth: number): Value {
  if (!(value instanceof ListValue)) {
    return ErrorValue.typeMismatch("list", value);
  }
  if (depth < 0) {
    return ErrorValue.create("level must be non-negative");
  }
  const flattened = flattenRecursive(value.value(), depth);
  if (flattened instanceof ErrorValue) {
    return flattened;
  }
  return ListValue.of(flattened);
}

function flattenRecursive(values: readonly Value[], depth: number): Value[] | ErrorValue {
  const out: Value[] = [];
  for (const val of values) {
    if (depth > 0 && val instanceof ListValue) {
      const nested = flattenRecursive(val.value(), depth - 1);
      if (nested instanceof ErrorValue) {
        return nested;
      }
      out.push(...nested);
    } else {
      out.push(val);
    }
  }
  return out;
}

function reverseList(value: Value): Value {
  if (!(value instanceof ListValue)) {
    return ErrorValue.typeMismatch("list", value);
  }
  const reversed = [...value.value()].reverse();
  return ListValue.of(reversed);
}

function distinctList(value: Value): Value {
  if (!(value instanceof ListValue)) {
    return ErrorValue.typeMismatch("list", value);
  }
  const unique: Value[] = [];
  for (const elem of value.value()) {
    let seen = false;
    for (const existing of unique) {
      const eq = existing.equal(elem);
      if (eq instanceof ErrorValue) {
        return eq;
      }
      if (eq.value()) {
        seen = true;
        break;
      }
    }
    if (!seen) {
      unique.push(elem);
    }
  }
  return ListValue.of(unique);
}

function sortList(value: Value): Value {
  if (!(value instanceof ListValue)) {
    return ErrorValue.typeMismatch("list", value);
  }
  const elements = [...value.value()];
  if (elements.length <= 1) {
    return value;
  }
  const comparator = buildComparator(elements);
  if (comparator instanceof ErrorValue) {
    return comparator;
  }
  elements.sort(comparator);
  return ListValue.of(elements);
}

function sortByAssociatedKeys(args: Value[]): Value {
  const list = args[0];
  const keys = args[1];
  if (!(list instanceof ListValue) || !(keys instanceof ListValue)) {
    return ErrorValue.create("@sortByAssociatedKeys expects list arguments");
  }
  const elements = list.value();
  const keyList = keys.value();
  if (elements.length !== keyList.length) {
    return ErrorValue.create(
      `@sortByAssociatedKeys() expected a list of the same size as the associated keys list, but got ${elements.length} and ${keyList.length} elements respectively`
    );
  }
  if (elements.length <= 1) {
    return list;
  }
  const comparator = buildComparator(keyList);
  if (comparator instanceof ErrorValue) {
    return comparator;
  }

  const indices = keyList.map((_value, index) => index);
  indices.sort((left, right) => comparator(keyList[left]!, keyList[right]!));
  const sorted = indices.map((idx) => elements[idx]!);
  return ListValue.of(sorted);
}

function rangeList(value: Value): Value {
  if (!(value instanceof IntValue)) {
    return ErrorValue.typeMismatch("int", value);
  }
  const count = toSafeNumber(value);
  if (count instanceof ErrorValue) {
    return count;
  }
  if (count < 0) {
    return ErrorValue.create("lists.range() requires a non-negative argument");
  }
  const out: Value[] = [];
  for (let i = 0; i < count; i++) {
    out.push(IntValue.of(i));
  }
  return ListValue.of(out);
}

function buildComparator(values: readonly Value[]): ((a: Value, b: Value) => number) | ErrorValue {
  if (values.length === 0) {
    return (_a, _b) => 0;
  }
  const first = values[0]!;
  if (!isComparableValue(first)) {
    return ErrorValue.create("list elements are not comparable");
  }
  const allowMixedNumeric = isNumericValue(first);
  for (const value of values) {
    if (!isComparableValue(value)) {
      return ErrorValue.create("list elements are not comparable");
    }
    if (allowMixedNumeric) {
      if (!isNumericValue(value)) {
        return ErrorValue.create("list elements must be of a comparable numeric type");
      }
    } else if (value.constructor !== first.constructor) {
      return ErrorValue.create("list elements must be the same comparable type");
    }
  }
  return (left, right) => {
    const cmp = compareValues(left, right);
    if (cmp instanceof ErrorValue) {
      return 0;
    }
    return cmp;
  };
}

function isNumericValue(value: Value): boolean {
  return value instanceof IntValue || value instanceof UintValue || value instanceof DoubleValue;
}

function toSafeNumber(value: IntValue): number | ErrorValue {
  const asNumber = Number(value.value());
  if (!Number.isSafeInteger(asNumber)) {
    return ErrorValue.create("integer value out of range");
  }
  return asNumber;
}

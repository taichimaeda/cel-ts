import { type EnvOptions, Function, MemberOverload, Overload, PrimitiveTypes } from "../cel";
import { ListType, MapType, OptionalType, TypeParamType } from "../checker/types";
import { Operators } from "../common/ast";
import {
  BoolValue,
  ErrorValue,
  isBoolValue,
  isBytesValue,
  isDoubleValue,
  isDurationValue,
  isIntValue,
  isListValue,
  isMapValue,
  isOptionalValue,
  isStringValue,
  isStructValue,
  isTimestampValue,
  isUintValue,
  NullValue,
  OptionalValue,
  type Value,
} from "../interpreter/values";
import { type Macro, MacroError, ReceiverMacro } from "../parser";
import type { Extension } from "./extensions";
import { extractIdentName } from "./utils";

const unusedIterVar = "#unused";

/**
 * Optional types extension.
 * Provides optional.of(), optional.none(), hasValue(), value(), or(), orValue(), optMap(), optFlatMap().
 */
export class OptionalTypesExtension implements Extension {
  envOptions(): EnvOptions {
    const typeParamV = new TypeParamType("V");
    const typeParamK = new TypeParamType("K");
    const optionalTypeV = new OptionalType(typeParamV);
    const listTypeV = new ListType(typeParamV);
    const mapTypeKV = new MapType(typeParamK, typeParamV);

    const macros: Macro[] = [
      new ReceiverMacro("optMap", 2, (helper, target, args) => {
        const varName = extractIdentName(args[0]);
        if (varName === undefined) {
          throw new MacroError("optMap() variable name must be a simple identifier");
        }
        const mapExpr = args[1]!;
        return helper.createCall(
          Operators.Conditional,
          helper.createMemberCall("hasValue", target!),
          helper.createCall(
            "optional.of",
            helper.createComprehension(
              helper.createList(),
              unusedIterVar,
              varName,
              helper.createMemberCall("value", target!),
              helper.createLiteral(false),
              helper.createIdent(varName),
              mapExpr
            )
          ),
          helper.createCall("optional.none")
        );
      }),
      new ReceiverMacro("optFlatMap", 2, (helper, target, args) => {
        const varName = extractIdentName(args[0]);
        if (varName === undefined) {
          throw new MacroError("optFlatMap() variable name must be a simple identifier");
        }
        const mapExpr = args[1]!;
        return helper.createCall(
          Operators.Conditional,
          helper.createMemberCall("hasValue", target!),
          helper.createComprehension(
            helper.createList(),
            unusedIterVar,
            varName,
            helper.createMemberCall("value", target!),
            helper.createLiteral(false),
            helper.createIdent(varName),
            mapExpr
          ),
          helper.createCall("optional.none")
        );
      }),
    ];

    const functions: Function[] = [
      new Function(
        "optional.of",
        new Overload(
          "optional_of",
          [typeParamV],
          optionalTypeV,
          (arg: Value) => OptionalValue.of(arg),
          { typeParams: ["V"] }
        )
      ),
      new Function(
        "optional.ofNonZeroValue",
        new Overload(
          "optional_ofNonZeroValue",
          [typeParamV],
          optionalTypeV,
          (arg: Value) => (isZeroValue(arg) ? OptionalValue.none() : OptionalValue.of(arg)),
          { typeParams: ["V"] }
        )
      ),
      new Function(
        "optional.none",
        new Overload("optional_none", [], optionalTypeV, () => OptionalValue.none(), {
          typeParams: ["V"],
        })
      ),
      new Function(
        "hasValue",
        new MemberOverload(
          "optional_hasValue",
          [optionalTypeV],
          PrimitiveTypes.Bool,
          (arg: Value) => {
            if (!isOptionalValue(arg)) {
              return ErrorValue.typeMismatch("optional", arg);
            }
            return BoolValue.of(arg.hasValue());
          },
          { typeParams: ["V"] }
        )
      ),
      new Function(
        "value",
        new MemberOverload(
          "optional_value",
          [optionalTypeV],
          typeParamV,
          (arg: Value) => {
            if (!isOptionalValue(arg)) {
              return ErrorValue.typeMismatch("optional", arg);
            }
            if (!arg.hasValue()) {
              return ErrorValue.of("optional has no value");
            }
            return arg.value() ?? NullValue.Instance;
          },
          { typeParams: ["V"] }
        )
      ),
      new Function(
        "or",
        new MemberOverload(
          "optional_or_optional",
          [optionalTypeV, optionalTypeV],
          optionalTypeV,
          (lhs: Value, rhs: Value) => {
            if (!isOptionalValue(lhs) || !isOptionalValue(rhs)) {
              return ErrorValue.of("optional.or expects optional arguments");
            }
            return lhs.hasValue() ? lhs : rhs;
          },
          { typeParams: ["V"] }
        )
      ),
      new Function(
        "orValue",
        new MemberOverload(
          "optional_orValue_value",
          [optionalTypeV, typeParamV],
          typeParamV,
          (lhs: Value, rhs: Value) => {
            if (!isOptionalValue(lhs)) {
              return ErrorValue.of("optional.orValue expects optional receiver");
            }
            return lhs.hasValue() ? (lhs.value() ?? NullValue.Instance) : rhs;
          },
          { typeParams: ["V"] }
        )
      ),
      new Function(
        Operators.OptIndex,
        new Overload("list_optindex_optional_int", [listTypeV, PrimitiveTypes.Int], optionalTypeV, undefined, {
          typeParams: ["V"],
        }),
        new Overload(
          "optional_list_optindex_optional_int",
          [new OptionalType(listTypeV), PrimitiveTypes.Int],
          optionalTypeV,
          undefined,
          { typeParams: ["V"] }
        ),
        new Overload(
          "map_optindex_optional_value",
          [mapTypeKV, typeParamK],
          optionalTypeV,
          undefined,
          { typeParams: ["K", "V"] }
        ),
        new Overload(
          "optional_map_optindex_optional_value",
          [new OptionalType(mapTypeKV), typeParamK],
          optionalTypeV,
          undefined,
          { typeParams: ["K", "V"] }
        )
      ),
      new Function(
        Operators.Index,
        new Overload(
          "optional_list_index_int",
          [new OptionalType(listTypeV), PrimitiveTypes.Int],
          optionalTypeV,
          undefined,
          { typeParams: ["V"] }
        ),
        new Overload(
          "optional_map_index_value",
          [new OptionalType(mapTypeKV), typeParamK],
          optionalTypeV,
          undefined,
          { typeParams: ["K", "V"] }
        )
      ),
    ];

    return { macros, functions };
  }
}

function isZeroValue(value: Value): boolean {
  switch (value.kind) {
    case "null":
      return true;
    case "bool":
      return isBoolValue(value) && !value.value();
    case "int":
      return isIntValue(value) && value.value() === 0n;
    case "uint":
      return isUintValue(value) && value.value() === 0n;
    case "double":
      return isDoubleValue(value) && value.value() === 0;
    case "string":
      return isStringValue(value) && value.value() === "";
    case "bytes":
      return isBytesValue(value) && value.value().length === 0;
    case "list":
      return isListValue(value) && value.value().length === 0;
    case "map":
      return isMapValue(value) && value.value().length === 0;
    case "duration":
      return isDurationValue(value) && value.value() === 0n;
    case "timestamp":
      return isTimestampValue(value) && value.value() === 0n;
    case "optional":
      return isOptionalValue(value) && !value.hasValue();
    case "struct":
      return isStructValue(value) && Object.keys(value.value()).length === 0;
    default:
      return false;
  }
}

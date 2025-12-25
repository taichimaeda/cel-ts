import {
  BoolType,
  DoubleType,
  DynType,
  type EnvOptions,
  Function,
  IntType,
  Overload,
  UintType,
} from "../cel";
import { ListType } from "../checker/types";
import {
  BoolValue,
  DoubleValue,
  ErrorValue,
  INT64_MIN,
  IntValue,
  ListValue,
  UintValue,
  type Value,
} from "../interpreter/values";
import { type Macro, MacroError, ReceiverVarArgMacro } from "../parser";
import type { Extension } from "./extensions";
import { macroTargetMatchesNamespace } from "./macros";
import { compareValues } from "./utils";

export type MathOptions = { version?: number };

const mathNamespace = "math";
const minFunc = "math.@min";
const maxFunc = "math.@max";

export class MathExtension implements Extension {
  private readonly version: number;

  constructor(options: MathOptions = {}) {
    this.version = options.version ?? Number.MAX_SAFE_INTEGER;
  }

  envOptions(): EnvOptions {
    const macros: Macro[] = [
      new ReceiverVarArgMacro("least", (helper, target, args) => {
        if (!macroTargetMatchesNamespace(mathNamespace, target)) {
          return undefined;
        }
        if (args.length === 0) {
          throw new MacroError("math.least() requires at least one argument");
        }
        if (args.length === 1) {
          return helper.createCall(minFunc, args[0]!);
        }
        if (args.length === 2) {
          return helper.createCall(minFunc, args[0]!, args[1]!);
        }
        return helper.createCall(minFunc, helper.createList(...args));
      }),
      new ReceiverVarArgMacro("greatest", (helper, target, args) => {
        if (!macroTargetMatchesNamespace(mathNamespace, target)) {
          return undefined;
        }
        if (args.length === 0) {
          throw new MacroError("math.greatest() requires at least one argument");
        }
        if (args.length === 1) {
          return helper.createCall(maxFunc, args[0]!);
        }
        if (args.length === 2) {
          return helper.createCall(maxFunc, args[0]!, args[1]!);
        }
        return helper.createCall(maxFunc, helper.createList(...args));
      }),
    ];

    const functions = [
      new Function(
        minFunc,
        new Overload("math_@min_double", [DoubleType], DoubleType, (arg: Value) => arg),
        new Overload("math_@min_int", [IntType], IntType, (arg: Value) => arg),
        new Overload("math_@min_uint", [UintType], UintType, (arg: Value) => arg),
        new Overload("math_@min_double_double", [DoubleType, DoubleType], DoubleType, minPair),
        new Overload("math_@min_int_int", [IntType, IntType], IntType, minPair),
        new Overload("math_@min_uint_uint", [UintType, UintType], UintType, minPair),
        new Overload("math_@min_int_uint", [IntType, UintType], DynType, minPair),
        new Overload("math_@min_int_double", [IntType, DoubleType], DynType, minPair),
        new Overload("math_@min_double_int", [DoubleType, IntType], DynType, minPair),
        new Overload("math_@min_double_uint", [DoubleType, UintType], DynType, minPair),
        new Overload("math_@min_uint_int", [UintType, IntType], DynType, minPair),
        new Overload("math_@min_uint_double", [UintType, DoubleType], DynType, minPair),
        new Overload("math_@min_list_double", [new ListType(DoubleType)], DoubleType, minList),
        new Overload("math_@min_list_int", [new ListType(IntType)], IntType, minList),
        new Overload("math_@min_list_uint", [new ListType(UintType)], UintType, minList)
      ),
      new Function(
        maxFunc,
        new Overload("math_@max_double", [DoubleType], DoubleType, (arg: Value) => arg),
        new Overload("math_@max_int", [IntType], IntType, (arg: Value) => arg),
        new Overload("math_@max_uint", [UintType], UintType, (arg: Value) => arg),
        new Overload("math_@max_double_double", [DoubleType, DoubleType], DoubleType, maxPair),
        new Overload("math_@max_int_int", [IntType, IntType], IntType, maxPair),
        new Overload("math_@max_uint_uint", [UintType, UintType], UintType, maxPair),
        new Overload("math_@max_int_uint", [IntType, UintType], DynType, maxPair),
        new Overload("math_@max_int_double", [IntType, DoubleType], DynType, maxPair),
        new Overload("math_@max_double_int", [DoubleType, IntType], DynType, maxPair),
        new Overload("math_@max_double_uint", [DoubleType, UintType], DynType, maxPair),
        new Overload("math_@max_uint_int", [UintType, IntType], DynType, maxPair),
        new Overload("math_@max_uint_double", [UintType, DoubleType], DynType, maxPair),
        new Overload("math_@max_list_double", [new ListType(DoubleType)], DoubleType, maxList),
        new Overload("math_@max_list_int", [new ListType(IntType)], IntType, maxList),
        new Overload("math_@max_list_uint", [new ListType(UintType)], UintType, maxList)
      ),
    ];

    if (this.version >= 1) {
      functions.push(
        new Function(
          "math.ceil",
          new Overload("math_ceil_double", [DoubleType], DoubleType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return DoubleValue.of(globalThis.Math.ceil(arg.value()));
          })
        ),
        new Function(
          "math.floor",
          new Overload("math_floor_double", [DoubleType], DoubleType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return DoubleValue.of(globalThis.Math.floor(arg.value()));
          })
        ),
        new Function(
          "math.round",
          new Overload("math_round_double", [DoubleType], DoubleType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return DoubleValue.of(roundHalfAwayFromZero(arg.value()));
          })
        ),
        new Function(
          "math.trunc",
          new Overload("math_trunc_double", [DoubleType], DoubleType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return DoubleValue.of(globalThis.Math.trunc(arg.value()));
          })
        ),
        new Function(
          "math.isInf",
          new Overload("math_isInf_double", [DoubleType], BoolType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return BoolValue.of(
              arg.value() === Number.POSITIVE_INFINITY || arg.value() === Number.NEGATIVE_INFINITY
            );
          })
        ),
        new Function(
          "math.isNaN",
          new Overload("math_isNaN_double", [DoubleType], BoolType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return BoolValue.of(Number.isNaN(arg.value()));
          })
        ),
        new Function(
          "math.isFinite",
          new Overload("math_isFinite_double", [DoubleType], BoolType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return BoolValue.of(Number.isFinite(arg.value()));
          })
        ),
        new Function(
          "math.abs",
          new Overload("math_abs_double", [DoubleType], DoubleType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return DoubleValue.of(globalThis.Math.abs(arg.value()));
          }),
          new Overload("math_abs_int", [IntType], IntType, (arg: Value) => {
            if (!(arg instanceof IntValue)) return ErrorValue.typeMismatch("int", arg);
            const value = arg.value();
            if (value === INT64_MIN) {
              return ErrorValue.create("int overflow");
            }
            return IntValue.of(value < 0n ? -value : value);
          }),
          new Overload("math_abs_uint", [UintType], UintType, (arg: Value) => {
            if (!(arg instanceof UintValue)) return ErrorValue.typeMismatch("uint", arg);
            return arg;
          })
        ),
        new Function(
          "math.sign",
          new Overload("math_sign_double", [DoubleType], DoubleType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            const value = arg.value();
            if (Number.isNaN(value)) return DoubleValue.of(Number.NaN);
            return DoubleValue.of(globalThis.Math.sign(value));
          }),
          new Overload("math_sign_int", [IntType], IntType, (arg: Value) => {
            if (!(arg instanceof IntValue)) return ErrorValue.typeMismatch("int", arg);
            const value = arg.value();
            return IntValue.of(value === 0n ? 0n : value > 0n ? 1n : -1n);
          }),
          new Overload("math_sign_uint", [UintType], IntType, (arg: Value) => {
            if (!(arg instanceof UintValue)) return ErrorValue.typeMismatch("uint", arg);
            return IntValue.of(arg.value() === 0n ? 0n : 1n);
          })
        ),
        new Function(
          "math.sqrt",
          new Overload("math_sqrt_double", [DoubleType], DoubleType, (arg: Value) => {
            if (!(arg instanceof DoubleValue)) return ErrorValue.typeMismatch("double", arg);
            return DoubleValue.of(globalThis.Math.sqrt(arg.value()));
          }),
          new Overload("math_sqrt_int", [IntType], DoubleType, (arg: Value) => {
            if (!(arg instanceof IntValue)) return ErrorValue.typeMismatch("int", arg);
            return DoubleValue.of(globalThis.Math.sqrt(Number(arg.value())));
          }),
          new Overload("math_sqrt_uint", [UintType], DoubleType, (arg: Value) => {
            if (!(arg instanceof UintValue)) return ErrorValue.typeMismatch("uint", arg);
            return DoubleValue.of(globalThis.Math.sqrt(Number(arg.value())));
          })
        ),
        new Function(
          "math.bitAnd",
          new Overload("math_bitAnd_int_int", [IntType, IntType], IntType, bitAndInt),
          new Overload("math_bitAnd_uint_uint", [UintType, UintType], UintType, bitAndUint)
        ),
        new Function(
          "math.bitOr",
          new Overload("math_bitOr_int_int", [IntType, IntType], IntType, bitOrInt),
          new Overload("math_bitOr_uint_uint", [UintType, UintType], UintType, bitOrUint)
        ),
        new Function(
          "math.bitXor",
          new Overload("math_bitXor_int_int", [IntType, IntType], IntType, bitXorInt),
          new Overload("math_bitXor_uint_uint", [UintType, UintType], UintType, bitXorUint)
        ),
        new Function(
          "math.bitNot",
          new Overload("math_bitNot_int_int", [IntType], IntType, bitNotInt),
          new Overload("math_bitNot_uint_uint", [UintType], UintType, bitNotUint)
        ),
        new Function(
          "math.bitShiftLeft",
          new Overload("math_bitShiftLeft_int_int", [IntType, IntType], IntType, bitShiftLeftInt),
          new Overload(
            "math_bitShiftLeft_uint_int",
            [UintType, IntType],
            UintType,
            bitShiftLeftUint
          )
        ),
        new Function(
          "math.bitShiftRight",
          new Overload("math_bitShiftRight_int_int", [IntType, IntType], IntType, bitShiftRightInt),
          new Overload(
            "math_bitShiftRight_uint_int",
            [UintType, IntType],
            UintType,
            bitShiftRightUint
          )
        )
      );
    }

    return { functions, macros };
  }
}

function minPair(lhs: Value, rhs: Value): Value {
  return selectMinMax(lhs, rhs, true);
}

function maxPair(lhs: Value, rhs: Value): Value {
  return selectMinMax(lhs, rhs, false);
}

function roundHalfAwayFromZero(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return value;
  }
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function selectMinMax(left: Value, right: Value, pickMin: boolean): Value {
  const cmp = compareValues(left, right);
  if (cmp instanceof ErrorValue) {
    return cmp;
  }
  const pickRight = pickMin ? cmp > 0 : cmp < 0;
  return pickRight ? right : left;
}

function minList(arg: Value): Value {
  return selectMinMaxList(arg, true);
}

function maxList(arg: Value): Value {
  return selectMinMaxList(arg, false);
}

function selectMinMaxList(arg: Value, pickMin: boolean): Value {
  if (!(arg instanceof ListValue)) {
    return ErrorValue.typeMismatch("list", arg);
  }
  const values = arg.value();
  if (values.length === 0) {
    return ErrorValue.create(`math.@${pickMin ? "min" : "max"}(list) argument must not be empty`);
  }
  let result = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const cmp = compareValues(result, values[i]!);
    if (cmp instanceof ErrorValue) {
      return cmp;
    }
    const pickRight = pickMin ? cmp > 0 : cmp < 0;
    if (pickRight) {
      result = values[i]!;
    }
  }
  return result;
}

function bitAndInt(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof IntValue) || !(rhs instanceof IntValue)) {
    return ErrorValue.create("math.bitAnd expects int arguments");
  }
  return IntValue.of(BigInt.asIntN(64, lhs.value() & rhs.value()));
}

function bitAndUint(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof UintValue) || !(rhs instanceof UintValue)) {
    return ErrorValue.create("math.bitAnd expects uint arguments");
  }
  return UintValue.of(BigInt.asUintN(64, lhs.value() & rhs.value()));
}

function bitOrInt(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof IntValue) || !(rhs instanceof IntValue)) {
    return ErrorValue.create("math.bitOr expects int arguments");
  }
  return IntValue.of(BigInt.asIntN(64, lhs.value() | rhs.value()));
}

function bitOrUint(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof UintValue) || !(rhs instanceof UintValue)) {
    return ErrorValue.create("math.bitOr expects uint arguments");
  }
  return UintValue.of(BigInt.asUintN(64, lhs.value() | rhs.value()));
}

function bitXorInt(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof IntValue) || !(rhs instanceof IntValue)) {
    return ErrorValue.create("math.bitXor expects int arguments");
  }
  return IntValue.of(BigInt.asIntN(64, lhs.value() ^ rhs.value()));
}

function bitXorUint(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof UintValue) || !(rhs instanceof UintValue)) {
    return ErrorValue.create("math.bitXor expects uint arguments");
  }
  return UintValue.of(BigInt.asUintN(64, lhs.value() ^ rhs.value()));
}

function bitNotInt(arg: Value): Value {
  if (!(arg instanceof IntValue)) {
    return ErrorValue.create("math.bitNot expects int argument");
  }
  return IntValue.of(BigInt.asIntN(64, ~arg.value()));
}

function bitNotUint(arg: Value): Value {
  if (!(arg instanceof UintValue)) {
    return ErrorValue.create("math.bitNot expects uint argument");
  }
  return UintValue.of(BigInt.asUintN(64, ~arg.value()));
}

function bitShiftLeftInt(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof IntValue) || !(rhs instanceof IntValue)) {
    return ErrorValue.create("math.bitShiftLeft expects int arguments");
  }
  const shift = Number(rhs.value());
  if (shift < 0) {
    return ErrorValue.create(`math.bitShiftLeft() negative offset: ${shift}`);
  }
  if (shift >= 64) {
    return IntValue.of(0n);
  }
  return IntValue.of(BigInt.asIntN(64, lhs.value() << BigInt(shift)));
}

function bitShiftLeftUint(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof UintValue) || !(rhs instanceof IntValue)) {
    return ErrorValue.create("math.bitShiftLeft expects uint, int arguments");
  }
  const shift = Number(rhs.value());
  if (shift < 0) {
    return ErrorValue.create(`math.bitShiftLeft() negative offset: ${shift}`);
  }
  if (shift >= 64) {
    return UintValue.of(0n);
  }
  return UintValue.of(BigInt.asUintN(64, lhs.value() << BigInt(shift)));
}

function bitShiftRightInt(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof IntValue) || !(rhs instanceof IntValue)) {
    return ErrorValue.create("math.bitShiftRight expects int arguments");
  }
  const shift = Number(rhs.value());
  if (shift < 0) {
    return ErrorValue.create(`math.bitShiftRight() negative offset: ${shift}`);
  }
  if (shift >= 64) {
    return IntValue.of(0n);
  }
  const unsigned = BigInt.asUintN(64, lhs.value());
  const shifted = unsigned >> BigInt(shift);
  return IntValue.of(BigInt.asIntN(64, shifted));
}

function bitShiftRightUint(lhs: Value, rhs: Value): Value {
  if (!(lhs instanceof UintValue) || !(rhs instanceof IntValue)) {
    return ErrorValue.create("math.bitShiftRight expects uint, int arguments");
  }
  const shift = Number(rhs.value());
  if (shift < 0) {
    return ErrorValue.create(`math.bitShiftRight() negative offset: ${shift}`);
  }
  if (shift >= 64) {
    return UintValue.of(0n);
  }
  return UintValue.of(lhs.value() >> BigInt(shift));
}

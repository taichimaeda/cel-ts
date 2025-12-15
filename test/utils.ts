import {
  BoolType,
  BytesType,
  DoubleType,
  DynType,
  IntType,
  ListType,
  MapType,
  NullType,
  StringType,
  TimestampType,
  Type,
  VariableDecl,
} from "../src/checker";
import { Env, type EvalResult } from "../src/interpreter";
import { ErrorValue } from "../src/interpreter/values";

function inferType(value: unknown): Type {
  if (value === null) {
    return NullType;
  }
  switch (typeof value) {
    case "boolean":
      return BoolType;
    case "number":
      return Number.isInteger(value) ? IntType : DoubleType;
    case "bigint":
      return IntType;
    case "string":
      return StringType;
    case "object":
      if (Array.isArray(value)) {
        if (value.length > 0) {
          return new ListType(inferType(value[0]));
        }
        return new ListType(DynType);
      }
      if (value instanceof Uint8Array) {
        return BytesType;
      }
      if (value instanceof Date) {
        return TimestampType;
      }
      return new MapType(StringType, DynType);
    default:
      return DynType;
  }
}

function inferDeclarations(vars: Record<string, unknown>): VariableDecl[] {
  return Object.entries(vars).map(([name, value]) => new VariableDecl(name, inferType(value)));
}

export function evaluate(
  expression: string,
  vars?: Record<string, unknown>,
): EvalResult {
  const declarations = vars ? inferDeclarations(vars) : [];
  const env = new Env({ declarations });
  
  const result = env.compile(expression);
  if (result.error || !result.program) {
    return {
      value: ErrorValue.create(result.error ?? "compilation failed"),
      success: false,
      error: result.error,
    };
  }

  return result.program.eval(vars);
}

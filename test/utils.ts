import { VariableDecl } from "../src/checker/decls";
import { Type } from "../src/checker/types";
import {
  Env,
  type EvalResult
} from "../src/interpreter";
import { ErrorValue } from "../src/interpreter/values";

function inferType(value: unknown): Type {
  if (value === null) {
    return Type.Null;
  }
  switch (typeof value) {
    case "boolean":
      return Type.Bool;
    case "number":
      return Number.isInteger(value) ? Type.Int : Type.Double;
    case "bigint":
      return Type.Int;
    case "string":
      return Type.String;
    case "object":
      if (Array.isArray(value)) {
        if (value.length > 0) {
          return Type.newListType(inferType(value[0]));
        }
        return Type.newListType(Type.Dyn);
      }
      if (value instanceof Uint8Array) {
        return Type.Bytes;
      }
      if (value instanceof Date) {
        return Type.Timestamp;
      }
      return Type.newMapType(Type.String, Type.Dyn);
    default:
      return Type.Dyn;
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

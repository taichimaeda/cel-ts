import type { EnvOptions } from "../cel";
import { type Expr, IdentExpr, SelectExpr } from "../common/ast";
import { type Macro, MacroError, ReceiverMacro } from "../parser";
import type { Extension } from "./extensions";
import { macroTargetMatchesNamespace } from "./macros";

const protoNamespace = "proto";

export class ProtosExtension implements Extension {
  envOptions(): EnvOptions {
    const macros: Macro[] = [
      new ReceiverMacro("getExt", 2, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(protoNamespace, target)) {
          return undefined;
        }
        const extensionField = getExtensionField(args[1]);
        if (extensionField === undefined) {
          throw new MacroError("invalid extension field");
        }
        return helper.createSelect(args[0]!, extensionField);
      }),
      new ReceiverMacro("hasExt", 2, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(protoNamespace, target)) {
          return undefined;
        }
        const extensionField = getExtensionField(args[1]);
        if (extensionField === undefined) {
          throw new MacroError("invalid extension field");
        }
        return helper.createPresenceTest(args[0]!, extensionField);
      }),
    ];

    return { macros };
  }
}

function getExtensionField(expr: Expr | undefined): string | undefined {
  if (expr === undefined) return undefined;
  return validateIdentifier(expr);
}

function validateIdentifier(expr: Expr): string | undefined {
  if (expr instanceof IdentExpr) {
    return expr.name;
  }
  if (expr instanceof SelectExpr) {
    if (expr.testOnly) {
      return undefined;
    }
    const operand = validateIdentifier(expr.operand);
    if (operand === undefined) {
      return undefined;
    }
    return `${operand}.${expr.field}`;
  }
  return undefined;
}

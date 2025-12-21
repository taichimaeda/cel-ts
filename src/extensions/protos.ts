import type { EnvOptions } from "../cel";
import { IdentExpr, SelectExpr, type Expr } from "../common/ast";
import { MacroError, ReceiverMacro, type Macro } from "../parser";
import type { Extension } from "./extensions";
import { macroTargetMatchesNamespace } from "./macros";

const protoNamespace = "proto";

export class ProtosExtension implements Extension {
  envOptions(): EnvOptions {
    const macros: Macro[] = [
      new ReceiverMacro("getExt", 2, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(protoNamespace, target)) {
          return null;
        }
        const extensionField = getExtensionField(args[1]);
        if (!extensionField) {
          throw new MacroError("invalid extension field");
        }
        return helper.createSelect(args[0]!, extensionField);
      }),
      new ReceiverMacro("hasExt", 2, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(protoNamespace, target)) {
          return null;
        }
        const extensionField = getExtensionField(args[1]);
        if (!extensionField) {
          throw new MacroError("invalid extension field");
        }
        return helper.createPresenceTest(args[0]!, extensionField);
      }),
    ];

    return { macros };
  }
}

function getExtensionField(expr: Expr | undefined): string | undefined {
  if (!expr) return undefined;
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
    if (!operand) {
      return undefined;
    }
    return `${operand}.${expr.field}`;
  }
  return undefined;
}

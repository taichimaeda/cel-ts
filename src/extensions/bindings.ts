import { Function, type EnvOptions, Overload, Variable } from "../cel";
import { DynType, ListType, TypeParamType } from "../checker/types";
import { type Expr, ListExpr, LiteralExpr } from "../common/ast";
import { type Macro, MacroError, ReceiverMacro } from "../parser";
import type { Extension } from "./extensions";
import { extractIdentName, macroTargetMatchesNamespace } from "./macros";

const celNamespace = "cel";
const bindMacro = "bind";
const blockMacro = "block";
const indexMacro = "index";
const iterVarMacro = "iterVar";
const accuVarMacro = "accuVar";
const unusedIterVar = "#unused";
const blockFunction = "cel.@block";
const maxBlockIndices = 30;

export class BindingsExtension implements Extension {
  envOptions(): EnvOptions {
    const macros: Macro[] = [
      new ReceiverMacro(bindMacro, 3, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(celNamespace, target)) {
          return undefined;
        }
        const varName = extractIdentName(args[0]);
        if (varName === undefined) {
          throw new MacroError("cel.bind() variable names must be simple identifiers");
        }
        const init = args[1]!;
        const result = args[2]!;

        return helper.createComprehension(
          helper.createList(),
          unusedIterVar,
          varName,
          init,
          helper.createLiteral(false),
          helper.createIdent(varName),
          result
        );
      }),
      new ReceiverMacro(blockMacro, 2, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(celNamespace, target)) {
          return undefined;
        }
        const bindings = args[0];
        if (!(bindings instanceof ListExpr)) {
          throw new MacroError("cel.block requires the first arg to be a list literal");
        }
        return helper.createCall(blockFunction, bindings, args[1]!);
      }),
      new ReceiverMacro(indexMacro, 1, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(celNamespace, target)) {
          return undefined;
        }
        const index = extractNonNegativeInt(args[0]);
        if (index === undefined) {
          throw new MacroError("cel.index requires a single non-negative int constant arg");
        }
        return helper.createIdent(`@index${index}`);
      }),
      new ReceiverMacro(iterVarMacro, 2, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(celNamespace, target)) {
          return undefined;
        }
        const depth = extractNonNegativeInt(args[0]);
        const unique = extractNonNegativeInt(args[1]);
        if (depth === undefined || unique === undefined) {
          throw new MacroError("cel.iterVar requires two non-negative int constant args");
        }
        return helper.createIdent(`@it:${depth}:${unique}`);
      }),
      new ReceiverMacro(accuVarMacro, 2, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(celNamespace, target)) {
          return undefined;
        }
        const depth = extractNonNegativeInt(args[0]);
        const unique = extractNonNegativeInt(args[1]);
        if (depth === undefined || unique === undefined) {
          throw new MacroError("cel.accuVar requires two non-negative int constant args");
        }
        return helper.createIdent(`@ac:${depth}:${unique}`);
      }),
    ];

    const typeParam = new TypeParamType("T");
    const functions: Function[] = [
      new Function(blockFunction, new Overload("cel_block_list", [new ListType(DynType), typeParam], typeParam)),
    ];

    const variables: Variable[] = [];
    for (let i = 0; i < maxBlockIndices; i += 1) {
      variables.push(new Variable(`@index${i}`, DynType));
    }

    return { macros, functions, variables };
  }
}

function extractNonNegativeInt(expr: Expr | undefined): number | undefined {
  if (!(expr instanceof LiteralExpr)) {
    return undefined;
  }
  if (expr.value.kind === "int") {
    if (expr.value.value < 0n) {
      return undefined;
    }
    return Number(expr.value.value);
  }
  if (expr.value.kind === "uint") {
    return Number(expr.value.value);
  }
  return undefined;
}

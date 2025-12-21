import type { EnvOptions, Function } from "../cel";
import { type Macro, MacroError, ReceiverMacro } from "../parser";
import type { Extension } from "./extensions";
import { extractIdentName, macroTargetMatchesNamespace } from "./macros";

const celNamespace = "cel";
const bindMacro = "bind";
const unusedIterVar = "#unused";

export class BindingsExtension implements Extension {
  envOptions(): EnvOptions {
    const macros: Macro[] = [
      new ReceiverMacro(bindMacro, 3, (helper, target, args) => {
        if (!macroTargetMatchesNamespace(celNamespace, target)) {
          return null;
        }
        const varName = extractIdentName(args[0]);
        if (!varName) {
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
    ];

    const functions: Function[] = [];

    return { macros, functions };
  }
}

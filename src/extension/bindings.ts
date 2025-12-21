import {
  Function,
  Overload,
  type EnvOptions,
  DynType,
} from "../cel";
import { ListType, TypeParamType } from "../checker/type";
import type { Value } from "../interpreter/value";
import { ReceiverMacro, type Macro, MacroError } from "../parser";
import { macroTargetMatchesNamespace, extractIdentName } from "./macro";

const celNamespace = "cel";
const bindMacro = "bind";
const blockFunc = "cel.@block";
const unusedIterVar = "#unused";

type BindingsConfig = { version: number };
export type BindingsOption = (config: BindingsConfig) => void;

export function BindingsVersion(version: number): BindingsOption {
  return (config) => {
    config.version = version;
  };
}

export function Bindings(...options: BindingsOption[]): EnvOptions {
  const config: BindingsConfig = { version: Number.MAX_SAFE_INTEGER };
  for (const option of options) {
    option(config);
  }

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
  if (config.version >= 1) {
    const typeParam = new TypeParamType("T");
    functions.push(
      new Function(
        blockFunc,
        new Overload(
          "cel_block_list",
          [new ListType(DynType), typeParam],
          typeParam,
          (_lhs, rhs) => rhs as Value
        )
      )
    );
  }

  return { macros, functions };
}

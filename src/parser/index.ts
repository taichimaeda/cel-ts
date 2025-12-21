// Parser module
// Handles CEL expression parsing

export * from "./gen/index";
export { Parser } from "./parser";
export type { ParseResult } from "./parser";

// Parser helper (ANTLR to AST conversion with macro expansion)
export { ParserHelper } from "./helper";
export type { ParserHelperOptions } from "./helper";

// Macros
export {
  AccumulatorName, AllMacro, AllMacros, ExistsMacro,
  ExistsOneMacro,
  ExistsOneMacroNew, FilterMacro,
  // Macro classes
  GlobalMacro, GlobalVarArgMacro,
  // Standard macros
  HasMacro, MacroError,
  MacroRegistry, MapFilterMacro, MapMacro, NoMacros, ReceiverMacro, ReceiverVarArgMacro,
  // Macro types
  type Macro,
  type MacroExpander
} from "./macros";


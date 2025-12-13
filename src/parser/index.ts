// Parser module
// Handles CEL expression parsing

export * from "./gen/index";
export { Parser } from "./parser";
export type { ParseResult } from "./parser";

// Parser helper (ANTLR to AST conversion with macro expansion)
export { ParserHelper, parseToAST, Operators } from "./helper";
export type { ParserHelperOptions } from "./helper";

// Macros
export {
  // Macro types
  type Macro,
  type MacroExpander,
  MacroError,
  MacroRegistry,
  AccumulatorName,
  // Macro classes
  GlobalMacro,
  ReceiverMacro,
  GlobalVarArgMacro,
  ReceiverVarArgMacro,
  // Standard macros
  HasMacro,
  AllMacro,
  ExistsMacro,
  ExistsOneMacro,
  ExistsOneMacroNew,
  MapMacro,
  MapFilterMacro,
  FilterMacro,
  AllMacros,
  NoMacros,
} from "./macro";

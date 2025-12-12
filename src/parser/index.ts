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
  AccumulatorName,
  AllMacros,
  // Macro classes
  GlobalMacro,
  GlobalVarArgMacro,
  MacroError,
  MacroRegistry,
  NoMacros,
  ReceiverMacro,
  ReceiverVarArgMacro,
  // Standard macros grouped object
  Macros as StandardMacros,
  // Macro types
  type Macro,
  type MacroExpander,
} from "./macros";

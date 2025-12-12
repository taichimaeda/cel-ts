import { CharStream, CommonTokenStream } from "antlr4";
import type { ErrorListener, Recognizer, Token } from "antlr4";
import CELLexer from "./gen/CELLexer.js";
import CELParser, { type StartContext } from "./gen/CELParser.js";

export interface ParseResult {
  tree?: StartContext;
  error?: string;
}

/**
 * Parser encapsulates CEL parsing using the generated ANTLR parser.
 */
export class Parser {
  parse(expression: string): ParseResult {
    try {
      const chars = new CharStream(expression);
      const lexer = new CELLexer(chars);
      const tokens = new CommonTokenStream(lexer);
      const parser = new CELParser(tokens);

      const errors: string[] = [];
      parser.removeErrorListeners();
      const errorListener = {
        syntaxError: (
          _recognizer: Recognizer<Token>,
          _offendingSymbol: Token | null,
          line: number,
          column: number,
          msg: string,
          _e: unknown
        ) => {
          errors.push(`line ${line}:${column} ${msg}`);
        },
        reportAmbiguity: () => {},
        reportAttemptingFullContext: () => {},
        reportContextSensitivity: () => {},
      } as ErrorListener<Token>;
      parser.addErrorListener(errorListener);

      const tree = parser.start();

      if (errors.length > 0) {
        return { error: errors.join("\n") };
      }

      return { tree };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
}

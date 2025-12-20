/**
 * cel-ts: Common Expression Language (CEL) implementation in TypeScript
 *
 * CEL is an expression language developed by Google, used for configuration
 * files and policy definitions. This library is implemented in TypeScript
 * based on the cel-go design.
 *
 * @packageDocumentation
 * @module cel-ts
 *
 * @example
 * ```typescript
 * import { Env, Variable, IntType } from "cel-ts";
 *
 * // Create an environment
 * const env = new Env({
 *   variables: [new Variable("x", IntType)],
 * });
 *
 * // Compile an expression
 * const ast = env.compile("x + 1");
 *
 * // Create and run a program
 * const program = env.program(ast);
 * const result = program.eval({ x: 10n });
 * console.log(result.value()); // 11n
 * ```
 */

// Version information
export { VERSION } from "./version";

// CEL API (cel-go compatible) - Recommended API
export * from "./cel";

// Low-level modules (internal implementation details)
// Note: These conflict with cel.ts names, import individually if needed
// export * from "./parser";
// export * from "./checker";
// export * from "./interpreter";

// Parser re-export (no conflicts)
export * from "./parser";

// Formatter (experimental utility)
export * from "./formatter";

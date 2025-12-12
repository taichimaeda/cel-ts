import { type EnvOptions, mergeEnvOptions } from "../cel";

/**
 * Extension interface for CEL environment plugins.
 * Implementations provide additional functions, macros, and type declarations.
 */
export interface Extension {
  /** Returns environment options to merge into the CEL environment. */
  envOptions(): EnvOptions;
}

/**
 * Apply multiple extensions to a base environment options object.
 */
export function applyExtensions(base: EnvOptions, ...extensions: Extension[]): EnvOptions {
  return mergeEnvOptions(base, ...extensions.map((extension) => extension.envOptions()));
}

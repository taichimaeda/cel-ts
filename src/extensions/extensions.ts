import type { EnvOptions } from "../cel";

export interface Extension {
  envOptions(): EnvOptions;
}

export function mergeEnvOptions(...options: EnvOptions[]): EnvOptions {
  const merged: EnvOptions = {};
  for (const option of options) {
    if (option.variables) {
      merged.variables = [...(merged.variables ?? []), ...option.variables];
    }
    if (option.constants) {
      merged.constants = [...(merged.constants ?? []), ...option.constants];
    }
    if (option.functions) {
      merged.functions = [...(merged.functions ?? []), ...option.functions];
    }
    if (option.structs) {
      merged.structs = [...(merged.structs ?? []), ...option.structs];
    }
    if (option.macros) {
      merged.macros = [...(merged.macros ?? []), ...option.macros];
    }
    if (option.typeProvider) {
      merged.typeProvider = option.typeProvider;
    }
    if (option.container !== undefined) {
      merged.container = option.container;
    }
    if (option.adapter) {
      merged.adapter = option.adapter;
    }
    if (option.disableStandardLibrary) {
      merged.disableStandardLibrary = true;
    }
    if (option.disableTypeChecking) {
      merged.disableTypeChecking = true;
    }
    if (option.enumValuesAsInt !== undefined) {
      merged.enumValuesAsInt = option.enumValuesAsInt;
    }
  }
  return merged;
}

export function applyExtensions(base: EnvOptions, ...extensions: Extension[]): EnvOptions {
  return mergeEnvOptions(base, ...extensions.map((extension) => extension.envOptions()));
}

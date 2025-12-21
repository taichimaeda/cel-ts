import type { EnvOptions } from "../cel";

export * from "./bindings";
export * from "./comprehensions";
export * from "./encoders";
export * from "./lists";
export * from "./math";
export * from "./protos";
export * from "./regex";
export * from "./sets";
export * from "./strings";

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
  }
  return merged;
}

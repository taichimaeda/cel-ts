import { type EnvOptions, mergeEnvOptions } from "../cel";

export interface Extension {
  envOptions(): EnvOptions;
}

export function applyExtensions(base: EnvOptions, ...extensions: Extension[]): EnvOptions {
  return mergeEnvOptions(base, ...extensions.map((extension) => extension.envOptions()));
}

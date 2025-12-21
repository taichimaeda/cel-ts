import { DynType, ListType, MapType, Type } from "../checker/type";

/**
 * Lightweight runtime-only type markers for interpreter values that
 * don't correspond to declared CEL types.
 */
export class RuntimeType {
  constructor(private readonly name: string) { }

  toString(): string {
    return this.name;
  }
}

export const UnknownType = new RuntimeType("unknown");
export const OptionalType = new RuntimeType("optional");

/**
 * Shared generic type aliases used by interpreter values.
 */
export const GenericListType = new ListType(DynType);
export const GenericMapType = new MapType(DynType, DynType);

/**
 * Type representation for CEL runtime values (either a declared type or
 * a runtime-only marker).
 */
export type ValueType = Type | RuntimeType;

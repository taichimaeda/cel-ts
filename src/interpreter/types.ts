import { ListType, MapType, PrimitiveTypes, type Type } from "../checker/types";

/**
 * Lightweight runtime-only type markers for interpreter values that
 * don't correspond to declared CEL types.
 */
export class RuntimeType {
  constructor(private readonly name: string) {}

  toString(): string {
    return this.name;
  }
}

export const UnknownType = new RuntimeType("unknown");
export const OptionalType = new RuntimeType("optional");

/**
 * Shared generic type aliases used by interpreter values.
 */
export const GenericListType = new ListType(PrimitiveTypes.Dyn);
export const GenericMapType = new MapType(PrimitiveTypes.Dyn, PrimitiveTypes.Dyn);

/**
 * Type representation for CEL runtime values (either a declared type or
 * a runtime-only marker).
 */
export type ValueType = Type | RuntimeType;

import { DynType, ListType, MapType, type Type as StaticType } from "../checker/types";

/**
 * Lightweight runtime-only type markers for interpreter values that
 * don't correspond to declared CEL types.
 */
export class DynamicType {
  constructor(private readonly name: string) {}

  toString(): string {
    return this.name;
  }
}

/** Runtime marker for unknown values. */
export const UnknownType = new DynamicType("unknown");
/** Runtime marker for optional values. */
export const OptionalType = new DynamicType("optional");

/**
 * Shared generic type aliases used by interpreter values.
 */
export const GenericListType = new ListType(DynType);
/** Generic map type with dynamic key and value. */
export const GenericMapType = new MapType(DynType, DynType);

/**
 * Type representation for CEL runtime values (either a declared type or
 * a runtime-only marker).
 */
export type RuntimeType = StaticType | DynamicType;

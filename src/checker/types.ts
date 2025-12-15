// CEL Type System
// TypeScript-native implementation of CEL types

import { TypeMapping } from "./mapping";

/**
 * Type kinds representing all CEL type categories
 */
export enum TypeKind {
  // Primitive types
  Bool = "bool",
  Int = "int",
  Uint = "uint",
  Double = "double",
  String = "string",
  Bytes = "bytes",
  Null = "null_type",

  // Temporal types
  Duration = "duration",
  Timestamp = "timestamp",

  // Complex types
  List = "list",
  Map = "map",
  Struct = "struct",
  Opaque = "opaque",

  // Special types
  Dyn = "dyn",
  Error = "error",
  Type = "type",
  TypeParam = "type_param",
  Any = "any",
}

/**
 * Represents a CEL type with optional type parameters
 */
export class Type {
  readonly kind: TypeKind;
  readonly parameters: readonly Type[];
  readonly runtimeTypeName: string;

  protected constructor(kind: TypeKind, runtimeTypeName: string, parameters: Type[] = []) {
    this.kind = kind;
    this.runtimeTypeName = runtimeTypeName;
    this.parameters = Object.freeze(parameters);
  }

  /**
   * Check if types are exactly equal (including type parameter names)
   */
  isExactType(other: Type): boolean {
    if (this.kind !== other.kind) return false;
    if (this.runtimeTypeName !== other.runtimeTypeName) return false;
    if (this.parameters.length !== other.parameters.length) return false;
    return this.parameters.every((p, i) => {
      const otherParam = other.parameters[i];
      return otherParam ? p.isExactType(otherParam) : false;
    });
  }

  /**
   * Check if types are equivalent (ignoring type parameter names)
   */
  isEquivalentType(other: Type): boolean {
    if (this.kind !== other.kind) return false;
    if (this.parameters.length !== other.parameters.length) return false;

    // For type parameters, just check that both are type params
    if (this.kind === TypeKind.TypeParam && other.kind === TypeKind.TypeParam) {
      return true;
    }

    // For other kinds, names must match
    if (this.kind !== TypeKind.TypeParam && this.runtimeTypeName !== other.runtimeTypeName) {
      return false;
    }

    return this.parameters.every((p, i) => {
      const otherParam = other.parameters[i];
      return otherParam ? p.isEquivalentType(otherParam) : false;
    });
  }

  /**
   * Check if this type is a primitive type
   */
  isPrimitive(): boolean {
    switch (this.kind) {
      case TypeKind.Bool:
      case TypeKind.Int:
      case TypeKind.Uint:
      case TypeKind.Double:
      case TypeKind.String:
      case TypeKind.Bytes:
        return true;
      default:
        return false;
    }
  }

  /**
   * Unique key representation for type maps.
   */
  typeKey(): string {
    return this.toString();
  }

  /**
   * Check if this type represents Dyn or Error.
   */
  isDynOrError(): boolean {
    return this.kind === TypeKind.Dyn || this.kind === TypeKind.Error;
  }

  /**
   * Check if this is an optional type
   */
  isOptionalType(): boolean {
    return this.kind === TypeKind.Opaque && this.runtimeTypeName === "optional_type";
  }

  /**
   * Get the element type of a list
   */
  listElementType(): Type | undefined {
    if (this.kind === TypeKind.List && this.parameters.length > 0) {
      return this.parameters[0];
    }
    return undefined;
  }

  /**
   * Get the key type of a map
   */
  mapKeyType(): Type | undefined {
    if (this.kind === TypeKind.Map && this.parameters.length > 0) {
      return this.parameters[0];
    }
    return undefined;
  }

  /**
   * Get the value type of a map
   */
  mapValueType(): Type | undefined {
    if (this.kind === TypeKind.Map && this.parameters.length > 1) {
      return this.parameters[1];
    }
    return undefined;
  }
}

/**
 * Primitive singleton types exposed as global constants.
 */
class PrimitiveType extends Type {
  constructor(kind: TypeKind, runtimeTypeName: string) {
    super(kind, runtimeTypeName);
  }

  override toString(): string {
    return this.runtimeTypeName;
  }
}

export const BoolType = new PrimitiveType(TypeKind.Bool, "bool");
export const IntType = new PrimitiveType(TypeKind.Int, "int");
export const UintType = new PrimitiveType(TypeKind.Uint, "uint");
export const DoubleType = new PrimitiveType(TypeKind.Double, "double");
export const StringType = new PrimitiveType(TypeKind.String, "string");
export const BytesType = new PrimitiveType(TypeKind.Bytes, "bytes");
export const NullType = new PrimitiveType(TypeKind.Null, "null_type");
export const DurationType = new PrimitiveType(TypeKind.Duration, "google.protobuf.Duration");
export const TimestampType = new PrimitiveType(TypeKind.Timestamp, "google.protobuf.Timestamp");
export const DynType = new PrimitiveType(TypeKind.Dyn, "dyn");
export const ErrorType = new PrimitiveType(TypeKind.Error, "error");
export const TypeType = new PrimitiveType(TypeKind.Type, "type");
export const AnyType = new PrimitiveType(TypeKind.Any, "any");

// ---------------------------------------------------------------------------
// Concrete Type Implementations
// ---------------------------------------------------------------------------

export class ListType extends Type {
  constructor(elemType: Type) {
    super(TypeKind.List, "list", [elemType]);
  }

  override toString(): string {
    const elem = this.parameters[0];
    return elem ? `list(${elem.toString()})` : "list";
  }
}

export class MapType extends Type {
  constructor(keyType: Type, valueType: Type) {
    super(TypeKind.Map, "map", [keyType, valueType]);
  }

  override toString(): string {
    const key = this.parameters[0];
    const val = this.parameters[1];
    return key && val ? `map(${key.toString()}, ${val.toString()})` : "map";
  }
}

export class StructType extends Type {
  constructor(typeName: string) {
    super(TypeKind.Struct, typeName);
  }

  override toString(): string {
    return this.runtimeTypeName;
  }
}

export class TypeParamType extends Type {
  constructor(name: string) {
    super(TypeKind.TypeParam, name);
  }

  override toString(): string {
    return this.runtimeTypeName;
  }
}

export class OpaqueType extends Type {
  constructor(name: string, ...params: Type[]) {
    super(TypeKind.Opaque, name, params);
  }

  override toString(): string {
    if (this.parameters.length === 0) {
      return this.runtimeTypeName;
    }
    const params = this.parameters.map((p) => p.toString()).join(", ");
    return `${this.runtimeTypeName}(${params})`;
  }
}

export class OptionalType extends Type {
  constructor(innerType: Type) {
    super(TypeKind.Opaque, "optional_type", [innerType]);
  }

  override toString(): string {
    const inner = this.parameters[0];
    return inner ? `optional_type(${inner.toString()})` : "optional_type";
  }
}

export class TypeTypeWithParam extends Type {
  constructor(param: Type) {
    super(TypeKind.Type, "type", [param]);
  }

  override toString(): string {
    const param = this.parameters[0];
    return param ? `type(${param.toString()})` : "type";
  }
}

/**
 * Check assignability without providing an existing mapping.
 */
export function isAssignable(target: Type, source: Type): boolean {
  const mapping = new TypeMapping();
  return mapping.isAssignable(target, source);
}

/**
 * Join two types to find their common type
 * Used for inferring element types in collections
 */
export function joinTypes(typ1: Type, typ2: Type): Type {
  // If either is Dyn or Error, result is Dyn
  if (typ1.kind === TypeKind.Dyn || typ1.kind === TypeKind.Error) {
    return DynType;
  }
  if (typ2.kind === TypeKind.Dyn || typ2.kind === TypeKind.Error) {
    return DynType;
  }

  // If types are equivalent, return one of them
  if (typ1.isEquivalentType(typ2)) {
    return typ1;
  }

  // Otherwise, fall back to Dyn
  return DynType;
}

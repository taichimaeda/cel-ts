// CEL Type System
// TypeScript-native implementation of CEL types

// ---------------------------------------------------------------------------
// Type Kind Constants and Union Types
// ---------------------------------------------------------------------------

/**
 * Primitive type kinds (bool, int, uint, double, string, bytes, null)
 */
export type PrimitiveTypeKind =
  | "bool"
  | "int"
  | "uint"
  | "double"
  | "string"
  | "bytes"
  | "null_type";

/**
 * Temporal type kinds (duration, timestamp)
 */
export type TemporalTypeKind = "duration" | "timestamp";

/**
 * Complex type kinds (list, map, struct, opaque)
 */
export type ComplexTypeKind = "list" | "map" | "struct" | "opaque";

/**
 * Special type kinds (dyn, error, type, type_param, any)
 */
export type SpecialTypeKind = "dyn" | "error" | "type" | "type_param" | "any";

/**
 * All type kinds as a union of categorized kinds
 */
export type TypeKind = PrimitiveTypeKind | TemporalTypeKind | ComplexTypeKind | SpecialTypeKind;

/**
 * Represents a CEL type with optional type parameters
 */
export class Type {
  readonly parameters: readonly Type[];

  protected constructor(
    readonly kind: TypeKind,
    readonly runtimeTypeName: string,
    parameters: Type[] = []
  ) {
    this.parameters = [...parameters];
  }

  /**
   * Unique key representation for type maps.
   */
  typeKey(): string {
    return this.toString();
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
    if (this.kind === "type_param" && other.kind === "type_param") {
      return true;
    }

    // For other kinds, names must match
    if (this.kind !== "type_param" && this.runtimeTypeName !== other.runtimeTypeName) {
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
      case "bool":
      case "int":
      case "uint":
      case "double":
      case "string":
      case "bytes":
        return true;
      default:
        return false;
    }
  }

  /**
   * Check if this type represents Dyn or Error.
   */
  isDynOrError(): boolean {
    return this.kind === "dyn" || this.kind === "error";
  }

  /**
   * Check if this is an optional type
   */
  isOptionalType(): boolean {
    return this.kind === "opaque" && this.runtimeTypeName === "optional_type";
  }

  /**
   * Get the element type of a list
   */
  listElementType(): Type | undefined {
    if (this.kind === "list" && this.parameters.length > 0) {
      return this.parameters[0];
    }
    return undefined;
  }

  /**
   * Get the key type of a map
   */
  mapKeyType(): Type | undefined {
    if (this.kind === "map" && this.parameters.length > 0) {
      return this.parameters[0];
    }
    return undefined;
  }

  /**
   * Get the value type of a map
   */
  mapValueType(): Type | undefined {
    if (this.kind === "map" && this.parameters.length > 1) {
      return this.parameters[1];
    }
    return undefined;
  }
}

/**
 * Primitive singleton types exposed as global constants.
 */
class PrimitiveType extends Type {
  override toString(): string {
    return this.runtimeTypeName;
  }
}

/**
 * Primitive CEL types as singleton instances.
 */
export const BoolType = new PrimitiveType("bool", "bool");
export const IntType = new PrimitiveType("int", "int");
export const UintType = new PrimitiveType("uint", "uint");
export const DoubleType = new PrimitiveType("double", "double");
export const StringType = new PrimitiveType("string", "string");
export const BytesType = new PrimitiveType("bytes", "bytes");
export const NullType = new PrimitiveType("null_type", "null_type");
export const DurationType = new PrimitiveType("duration", "google.protobuf.Duration");
export const TimestampType = new PrimitiveType("timestamp", "google.protobuf.Timestamp");
export const DynType = new PrimitiveType("dyn", "dyn");
export const ErrorType = new PrimitiveType("error", "error");
export const TypeType = new PrimitiveType("type", "type");
export const AnyType = new PrimitiveType("any", "any");

// ---------------------------------------------------------------------------
// Concrete Type Implementations
// ---------------------------------------------------------------------------

/**
 * CEL list type with element type parameter.
 */
export class ListType extends Type {
  constructor(elemType: Type) {
    super("list", "list", [elemType]);
  }

  override toString(): string {
    const elem = this.parameters[0];
    return elem ? `list(${elem.toString()})` : "list";
  }
}

/**
 * CEL map type with key and value type parameters.
 */
export class MapType extends Type {
  constructor(keyType: Type, valueType: Type) {
    super("map", "map", [keyType, valueType]);
  }

  override toString(): string {
    const key = this.parameters[0];
    const val = this.parameters[1];
    return key && val ? `map(${key.toString()}, ${val.toString()})` : "map";
  }
}

/**
 * CEL struct type representing a protobuf message or custom struct.
 */
export class StructType extends Type {
  constructor(typeName: string) {
    super("struct", typeName);
  }

  override toString(): string {
    return this.runtimeTypeName;
  }
}

/**
 * Type parameter placeholder used during type checking.
 */
export class TypeParamType extends Type {
  constructor(name: string) {
    super("type_param", name);
  }

  override toString(): string {
    return this.runtimeTypeName;
  }
}

/**
 * Opaque type for extension types with optional type parameters.
 */
export class OpaqueType extends Type {
  constructor(name: string, ...params: Type[]) {
    super("opaque", name, params);
  }

  override toString(): string {
    if (this.parameters.length === 0) {
      return this.runtimeTypeName;
    }
    const params = this.parameters.map((p) => p.toString()).join(", ");
    return `${this.runtimeTypeName}(${params})`;
  }
}

/**
 * CEL optional type wrapping an inner type.
 */
export class OptionalType extends Type {
  constructor(innerType: Type) {
    super("opaque", "optional_type", [innerType]);
  }

  override toString(): string {
    const inner = this.parameters[0];
    return inner ? `optional_type(${inner.toString()})` : "optional_type";
  }
}

/**
 * Polymorphic type representing type(T) where T is a type parameter.
 */
export class PolymorphicTypeType extends Type {
  constructor(param: Type) {
    super("type", "type", [param]);
  }

  override toString(): string {
    const param = this.parameters[0];
    return param ? `type(${param.toString()})` : "type";
  }
}

/** List type with dyn element type. */
export const DynListType = new ListType(DynType);

/** Map type with dyn key and value types. */
export const DynMapType = new MapType(DynType, DynType);

/**
 * Join two types to find their common type
 * Used for inferring element types in collections
 */
export function joinTypes(typ1: Type, typ2: Type): Type {
  const normalized1 = wellKnownTypeToNative(typ1) ?? typ1;
  const normalized2 = wellKnownTypeToNative(typ2) ?? typ2;
  if (normalized1 !== typ1 || normalized2 !== typ2) {
    return joinTypes(normalized1, normalized2);
  }

  if (typ1.isOptionalType() && typ2.kind === "null_type") {
    return typ1;
  }
  if (typ2.isOptionalType() && typ1.kind === "null_type") {
    return typ2;
  }
  if (typ1.isOptionalType() || typ2.isOptionalType()) {
    const inner1 = typ1.isOptionalType() ? (typ1.parameters[0] ?? DynType) : typ1;
    const inner2 = typ2.isOptionalType() ? (typ2.parameters[0] ?? DynType) : typ2;
    return new OptionalType(joinTypes(inner1, inner2));
  }

  // If either is Dyn or Error, result is Dyn
  if (typ1.kind === "dyn" || typ1.kind === "error") {
    return DynType;
  }
  if (typ2.kind === "dyn" || typ2.kind === "error") {
    return DynType;
  }

  if (typ1.kind === "null_type" && isLegacyNullableTarget(typ2)) {
    return typ2;
  }
  if (typ2.kind === "null_type" && isLegacyNullableTarget(typ1)) {
    return typ1;
  }

  if (typ1.kind === "type_param") {
    return typ2;
  }
  if (typ2.kind === "type_param") {
    return typ1;
  }

  const wrapper1 = wrapperTypeToPrimitive(typ1);
  const wrapper2 = wrapperTypeToPrimitive(typ2);
  if (wrapper1 || wrapper2) {
    const base1 = wrapper1 ?? typ1;
    const base2 = wrapper2 ?? typ2;
    if (base1.kind === "null_type" || base2.kind === "null_type") {
      return wrapper1 ? typ1 : typ2;
    }
    if (base1.isEquivalentType(base2)) {
      return wrapper1 ? typ1 : typ2;
    }
  }

  if (typ1.kind === "list" && typ2.kind === "list") {
    const elem1 = typ1.parameters[0] ?? DynType;
    const elem2 = typ2.parameters[0] ?? DynType;
    return new ListType(joinTypes(elem1, elem2));
  }

  if (typ1.kind === "map" && typ2.kind === "map") {
    const key1 = typ1.parameters[0] ?? DynType;
    const key2 = typ2.parameters[0] ?? DynType;
    const val1 = typ1.parameters[1] ?? DynType;
    const val2 = typ2.parameters[1] ?? DynType;
    return new MapType(joinTypes(key1, key2), joinTypes(val1, val2));
  }

  if (typ1.kind === "opaque" && typ2.kind === "opaque") {
    if (typ1.runtimeTypeName !== typ2.runtimeTypeName) {
      return DynType;
    }
    if (typ1.parameters.length !== typ2.parameters.length) {
      return DynType;
    }
    if (typ1.parameters.length === 0) {
      return typ1;
    }
    const params = typ1.parameters.map((param, index) => {
      const other = typ2.parameters[index] ?? DynType;
      return joinTypes(param, other);
    });
    return new OpaqueType(typ1.runtimeTypeName, ...params);
  }

  // If types are equivalent, return one of them
  if (typ1.isEquivalentType(typ2)) {
    return typ1;
  }

  // Otherwise, fall back to Dyn
  return DynType;
}

function isLegacyNullableTarget(type: Type): boolean {
  switch (type.kind) {
    case "struct":
    case "opaque":
    case "duration":
    case "timestamp":
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Protobuf Wrapper and Well-Known Type Mappings
// ---------------------------------------------------------------------------

/**
 * Protobuf wrapper type names.
 */
export type WrapperTypeName =
  | "google.protobuf.BoolValue"
  | "google.protobuf.BytesValue"
  | "google.protobuf.DoubleValue"
  | "google.protobuf.FloatValue"
  | "google.protobuf.Int32Value"
  | "google.protobuf.Int64Value"
  | "google.protobuf.UInt32Value"
  | "google.protobuf.UInt64Value"
  | "google.protobuf.StringValue";

/**
 * Primitive type kinds for protobuf wrapper types.
 */
export type WrapperTypeKind = "bool" | "bytes" | "double" | "float" | "int" | "uint" | "string";

/**
 * Maps protobuf wrapper type names to their CEL Type.
 */
const WrapperTypeToType = new Map<WrapperTypeName, Type>([
  ["google.protobuf.BoolValue", BoolType],
  ["google.protobuf.BytesValue", BytesType],
  ["google.protobuf.DoubleValue", DoubleType],
  ["google.protobuf.FloatValue", DoubleType],
  ["google.protobuf.Int32Value", IntType],
  ["google.protobuf.Int64Value", IntType],
  ["google.protobuf.UInt32Value", UintType],
  ["google.protobuf.UInt64Value", UintType],
  ["google.protobuf.StringValue", StringType],
]);

/**
 * Maps protobuf wrapper type names to their primitive kind.
 */
const WrapperTypeToKind = new Map<WrapperTypeName, WrapperTypeKind>([
  ["google.protobuf.BoolValue", "bool"],
  ["google.protobuf.BytesValue", "bytes"],
  ["google.protobuf.DoubleValue", "double"],
  ["google.protobuf.FloatValue", "float"],
  ["google.protobuf.Int32Value", "int"],
  ["google.protobuf.Int64Value", "int"],
  ["google.protobuf.UInt32Value", "uint"],
  ["google.protobuf.UInt64Value", "uint"],
  ["google.protobuf.StringValue", "string"],
]);

/**
 * Protobuf well-known type names.
 */
export type WellKnownTypeName =
  | "google.protobuf.Value"
  | "google.protobuf.Any"
  | "google.protobuf.Struct"
  | "google.protobuf.ListValue";

/**
 * Kind strings for protobuf well-known types.
 */
export type WellKnownTypeKind = "dyn" | "map" | "list";

/**
 * Maps protobuf well-known type names to their CEL Type.
 */
const WellKnownTypeToType = new Map<WellKnownTypeName, Type>([
  ["google.protobuf.Value", DynType],
  ["google.protobuf.Any", DynType],
  ["google.protobuf.Struct", new MapType(StringType, DynType)],
  ["google.protobuf.ListValue", new ListType(DynType)],
]);

/**
 * Maps protobuf well-known type names to their kind.
 */
const WellKnownTypeToKind = new Map<WellKnownTypeName, WellKnownTypeKind>([
  ["google.protobuf.Value", "dyn"],
  ["google.protobuf.Any", "dyn"],
  ["google.protobuf.Struct", "map"],
  ["google.protobuf.ListValue", "list"],
]);

// ---------------------------------------------------------------------------
// Builtin Type Name Mapping
// ---------------------------------------------------------------------------

/**
 * Builtin CEL type names.
 */
export type BuiltinTypeName =
  | "bool"
  | "int"
  | "uint"
  | "double"
  | "string"
  | "bytes"
  | "null_type"
  | "list"
  | "map"
  | "type"
  | "optional_type"
  | "google.protobuf.Timestamp"
  | "google.protobuf.Duration";

/**
 * Maps builtin type names to their CEL Type.
 */
const BuiltinNameToType = new Map<BuiltinTypeName, Type>([
  ["bool", BoolType],
  ["int", IntType],
  ["uint", UintType],
  ["double", DoubleType],
  ["string", StringType],
  ["bytes", BytesType],
  ["null_type", NullType],
  ["list", DynListType],
  ["map", DynMapType],
  ["type", TypeType],
  ["optional_type", new OptionalType(DynType)],
  ["google.protobuf.Timestamp", TimestampType],
  ["google.protobuf.Duration", DurationType],
]);

// ---------------------------------------------------------------------------
// Type Lookup Functions
// ---------------------------------------------------------------------------

/**
 * Get the primitive CEL type for a protobuf wrapper type.
 */
export function wrapperTypeToPrimitive(type: Type): Type | undefined {
  if (type.kind !== "struct") {
    return undefined;
  }
  const name = type.runtimeTypeName.startsWith(".")
    ? type.runtimeTypeName.slice(1)
    : type.runtimeTypeName;
  return WrapperTypeToType.get(name as WrapperTypeName);
}

/**
 * Get the primitive kind for a protobuf wrapper type name.
 */
export function wrapperTypeNameToKind(typeName: string): WrapperTypeKind | undefined {
  const name = typeName.startsWith(".") ? typeName.slice(1) : typeName;
  return WrapperTypeToKind.get(name as WrapperTypeName);
}

/**
 * Get the native CEL type for a protobuf well-known type.
 */
export function wellKnownTypeToNative(type: Type): Type | undefined {
  if (type.kind !== "struct") {
    return undefined;
  }
  const name = type.runtimeTypeName.startsWith(".")
    ? type.runtimeTypeName.slice(1)
    : type.runtimeTypeName;
  return WellKnownTypeToType.get(name as WellKnownTypeName);
}

/**
 * Get the kind for a protobuf well-known type name.
 */
export function wellKnownTypeNameToKind(typeName: string): WellKnownTypeKind | undefined {
  const name = typeName.startsWith(".") ? typeName.slice(1) : typeName;
  return WellKnownTypeToKind.get(name as WellKnownTypeName);
}

/**
 * Get the CEL Type for a builtin type name.
 */
export function builtinTypeNameToType(name: string): Type | undefined {
  return BuiltinNameToType.get(name as BuiltinTypeName);
}

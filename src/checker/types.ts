// CEL Type System
// TypeScript-native implementation of CEL types

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
 * Trait flags for type capabilities
 */
export enum TypeTrait {
  None = 0,
  Adder = 1 << 0,
  Comparer = 1 << 1,
  Container = 1 << 2,
  Divider = 1 << 3,
  FieldTester = 1 << 4,
  Indexer = 1 << 5,
  Iterator = 1 << 6,
  Matcher = 1 << 7,
  Modder = 1 << 8,
  Multiplier = 1 << 9,
  Negater = 1 << 10,
  Receiver = 1 << 11,
  Sizer = 1 << 12,
  Subtractor = 1 << 13,
}

/**
 * Represents a CEL type with optional type parameters
 */
export class Type {
  readonly kind: TypeKind;
  readonly parameters: readonly Type[];
  readonly runtimeTypeName: string;
  readonly traitMask: number;

  private constructor(
    kind: TypeKind,
    runtimeTypeName: string,
    parameters: Type[] = [],
    traitMask = TypeTrait.None
  ) {
    this.kind = kind;
    this.runtimeTypeName = runtimeTypeName;
    this.parameters = Object.freeze(parameters);
    this.traitMask = traitMask;
  }

  /**
   * Check if this type has a specific trait
   */
  hasTrait(trait: TypeTrait): boolean {
    return (this.traitMask & trait) !== 0;
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
   * Get a human-readable string representation
   */
  toString(): string {
    return formatType(this);
  }

  // Static factory methods for creating types

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Bool = new Type(
    TypeKind.Bool,
    "bool",
    [],
    TypeTrait.Comparer | TypeTrait.Negater
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Int = new Type(
    TypeKind.Int,
    "int",
    [],
    TypeTrait.Adder |
      TypeTrait.Comparer |
      TypeTrait.Divider |
      TypeTrait.Modder |
      TypeTrait.Multiplier |
      TypeTrait.Negater |
      TypeTrait.Subtractor
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Uint = new Type(
    TypeKind.Uint,
    "uint",
    [],
    TypeTrait.Adder |
      TypeTrait.Comparer |
      TypeTrait.Divider |
      TypeTrait.Modder |
      TypeTrait.Multiplier |
      TypeTrait.Subtractor
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Double = new Type(
    TypeKind.Double,
    "double",
    [],
    TypeTrait.Adder |
      TypeTrait.Comparer |
      TypeTrait.Divider |
      TypeTrait.Multiplier |
      TypeTrait.Negater |
      TypeTrait.Subtractor
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly String = new Type(
    TypeKind.String,
    "string",
    [],
    TypeTrait.Adder | TypeTrait.Comparer | TypeTrait.Matcher | TypeTrait.Sizer | TypeTrait.Indexer
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Bytes = new Type(
    TypeKind.Bytes,
    "bytes",
    [],
    TypeTrait.Adder | TypeTrait.Comparer | TypeTrait.Sizer | TypeTrait.Indexer
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Null = new Type(TypeKind.Null, "null_type");

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Duration = new Type(
    TypeKind.Duration,
    "google.protobuf.Duration",
    [],
    TypeTrait.Adder | TypeTrait.Comparer | TypeTrait.Negater | TypeTrait.Subtractor
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Timestamp = new Type(
    TypeKind.Timestamp,
    "google.protobuf.Timestamp",
    [],
    TypeTrait.Adder | TypeTrait.Comparer | TypeTrait.Subtractor
  );

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Dyn = new Type(TypeKind.Dyn, "dyn");

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly Error = new Type(TypeKind.Error, "error");

  /* biome-ignore lint/style/useNamingConvention: preserve public CEL type names */
  static readonly TypeType = new Type(TypeKind.Type, "type");

  /* biome-ignore lint/style/useNamingConvention */
  static readonly Any = new Type(TypeKind.Any, "any");

  /**
   * Create a list type with the given element type
   */
  static newListType(elemType: Type): Type {
    return new Type(
      TypeKind.List,
      "list",
      [elemType],
      TypeTrait.Adder |
        TypeTrait.Comparer |
        TypeTrait.Container |
        TypeTrait.Indexer |
        TypeTrait.Iterator |
        TypeTrait.Sizer
    );
  }

  /**
   * Create a map type with the given key and value types
   */
  static newMapType(keyType: Type, valueType: Type): Type {
    return new Type(
      TypeKind.Map,
      "map",
      [keyType, valueType],
      TypeTrait.Comparer |
        TypeTrait.Container |
        TypeTrait.FieldTester |
        TypeTrait.Indexer |
        TypeTrait.Iterator |
        TypeTrait.Sizer
    );
  }

  /**
   * Create a struct/message type
   */
  static newStructType(typeName: string): Type {
    return new Type(
      TypeKind.Struct,
      typeName,
      [],
      TypeTrait.FieldTester | TypeTrait.Indexer | TypeTrait.Receiver
    );
  }

  /**
   * Create a type parameter (for generic functions)
   */
  static newTypeParamType(name: string): Type {
    return new Type(TypeKind.TypeParam, name);
  }

  /**
   * Create an opaque type with optional type parameters
   */
  static newOpaqueType(name: string, ...params: Type[]): Type {
    return new Type(TypeKind.Opaque, name, params);
  }

  /**
   * Create an optional type (represented as opaque wrapper)
   */
  static newOptionalType(innerType: Type): Type {
    return new Type(TypeKind.Opaque, "optional_type", [innerType]);
  }

  /**
   * Create a type that represents a type value (meta-type)
   */
  static newTypeTypeWithParam(param: Type): Type {
    return new Type(TypeKind.Type, "type", [param]);
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
 * Format a type for display
 */
export function formatType(t: Type): string {
  switch (t.kind) {
    case TypeKind.List: {
      const elem = t.parameters[0];
      return elem ? `list(${formatType(elem)})` : "list";
    }
    case TypeKind.Map: {
      const key = t.parameters[0];
      const val = t.parameters[1];
      return key && val ? `map(${formatType(key)}, ${formatType(val)})` : "map";
    }
    case TypeKind.Type: {
      const param = t.parameters[0];
      return param ? `type(${formatType(param)})` : "type";
    }
    case TypeKind.Opaque: {
      if (t.parameters.length === 0) {
        return t.runtimeTypeName;
      }
      const params = t.parameters.map(formatType).join(", ");
      return `${t.runtimeTypeName}(${params})`;
    }
    case TypeKind.TypeParam:
      return t.runtimeTypeName;
    case TypeKind.Struct:
      return t.runtimeTypeName;
    default:
      return t.runtimeTypeName;
  }
}

/**
 * Create a unique string key for a type (used in type mappings)
 */
export function typeKey(t: Type): string {
  return formatType(t);
}

/**
 * Get the most general type between two types (for type inference)
 */
export function mostGeneral(t1: Type, t2: Type): Type {
  if (isDynOrError(t1) || isDynOrError(t2)) {
    return Type.Dyn;
  }
  if (t1.isEquivalentType(t2)) {
    return t1;
  }
  return Type.Dyn;
}

/**
 * Check if a type is Dyn or Error
 */
export function isDynOrError(t: Type): boolean {
  return t.kind === TypeKind.Dyn || t.kind === TypeKind.Error;
}

/**
 * Check if a type is assignable from another type
 * This is used during type checking for argument/parameter matching
 */
export function isAssignable(target: Type, source: Type): boolean {
  // Dyn is assignable to/from anything
  if (target.kind === TypeKind.Dyn || source.kind === TypeKind.Dyn) {
    return true;
  }

  // Error is assignable to/from anything
  if (target.kind === TypeKind.Error || source.kind === TypeKind.Error) {
    return true;
  }

  // Type params need special handling (done in checker with mapping)
  if (target.kind === TypeKind.TypeParam || source.kind === TypeKind.TypeParam) {
    return true; // Defer to checker's mapping logic
  }

  // Null is assignable to any optional type
  if (source.kind === TypeKind.Null && target.isOptionalType()) {
    return true;
  }

  // Same kind required for other types
  if (target.kind !== source.kind) {
    return false;
  }

  // For parameterized types, check parameters
  if (target.parameters.length !== source.parameters.length) {
    return false;
  }

  // For structs and opaques, names must match
  if (target.kind === TypeKind.Struct || target.kind === TypeKind.Opaque) {
    if (target.runtimeTypeName !== source.runtimeTypeName) {
      return false;
    }
  }

  // Check type parameters recursively
  return target.parameters.every((param, i) => {
    const sourceParam = source.parameters[i];
    return sourceParam ? isAssignable(param, sourceParam) : false;
  });
}

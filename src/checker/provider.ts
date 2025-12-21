import type { Root, Type as ProtoType, Field } from "protobufjs";
import type { StructDecl } from "./decl";
import {
  BoolType,
  BytesType,
  DoubleType,
  DynType,
  IntType,
  ListType,
  MapType,
  StringType,
  StructType,
  TimestampType,
  DurationType,
  Type,
  UintType,
} from "./type";

type ProtobufRoot = Pick<Root, "lookupType" | "lookupEnum">;

/**
 * Type provider interface for resolving struct field types.
 */
export interface TypeProvider {
  /**
   * Find a struct type by name.
   */
  findStructType(typeName: string): Type | undefined;

  /**
   * Find a field type within a struct.
   */
  findStructFieldType(typeName: string, fieldName: string): Type | undefined;

  /**
   * Get all field names for a struct type.
   */
  structFieldNames(typeName: string): string[];
}

/**
 * Type provider that merges multiple providers.
 */
export class CompositeTypeProvider implements TypeProvider {
  constructor(private readonly providers: readonly TypeProvider[]) {}

  findStructType(typeName: string): Type | undefined {
    for (const provider of this.providers) {
      const result = provider.findStructType(typeName);
      if (result) {
        return result;
      }
    }
    return undefined;
  }

  findStructFieldType(typeName: string, fieldName: string): Type | undefined {
    for (const provider of this.providers) {
      const result = provider.findStructFieldType(typeName, fieldName);
      if (result) {
        return result;
      }
    }
    return undefined;
  }

  structFieldNames(typeName: string): string[] {
    const names = new Set<string>();
    for (const provider of this.providers) {
      for (const name of provider.structFieldNames(typeName)) {
        names.add(name);
      }
    }
    return [...names];
  }
}

/**
 * Struct type provider backed by declared struct definitions.
 */
export class StructTypeProvider implements TypeProvider {
  private readonly structs: Map<string, StructDecl>;

  constructor(structs: readonly StructDecl[] = []) {
    this.structs = new Map(structs.map((decl) => [decl.name, decl]));
  }

  addStructs(...structs: StructDecl[]): void {
    for (const decl of structs) {
      this.structs.set(decl.name, decl);
    }
  }

  structDecls(): StructDecl[] {
    return [...this.structs.values()];
  }

  findStructType(typeName: string): Type | undefined {
    return this.structs.get(typeName)?.type;
  }

  findStructFieldType(typeName: string, fieldName: string): Type | undefined {
    return this.structs.get(typeName)?.fieldType(fieldName);
  }

  structFieldNames(typeName: string): string[] {
    return this.structs.get(typeName)?.fieldNames() ?? [];
  }
}

/**
 * Protobuf-backed type provider for resolving message fields as CEL struct types.
 */
export class ProtobufTypeProvider implements TypeProvider {
  constructor(private readonly root: ProtobufRoot) {}

  findStructType(typeName: string): Type | undefined {
    const message = this.lookupMessage(typeName);
    if (!message) {
      return undefined;
    }
    return new StructType(this.normalizeTypeName(message.fullName ?? typeName));
  }

  findStructFieldType(typeName: string, fieldName: string): Type | undefined {
    const message = this.lookupMessage(typeName);
    const field = message?.fields[fieldName];
    if (!field) {
      return undefined;
    }
    return this.fieldType(field);
  }

  structFieldNames(typeName: string): string[] {
    const message = this.lookupMessage(typeName);
    if (!message) {
      return [];
    }
    return Object.keys(message.fields);
  }

  private lookupMessage(typeName: string): ProtoType | undefined {
    const normalized = this.normalizeTypeName(typeName);
    try {
      return this.root.lookupType(normalized);
    } catch {
      return undefined;
    }
  }

  private normalizeTypeName(typeName: string): string {
    return typeName.startsWith(".") ? typeName.slice(1) : typeName;
  }

  private fieldType(field: Field): Type {
    if (field.map) {
      const keyType = this.scalarType((field as { keyType?: string })["keyType"]);
      const valueType = this.typeFromName(field.type);
      return new MapType(keyType, valueType);
    }
    const baseType = this.typeFromName(field.type);
    if (field.repeated) {
      return new ListType(baseType);
    }
    return baseType;
  }

  private typeFromName(typeName: string): Type {
    const scalar = this.scalarType(typeName);
    if (scalar !== DynType) {
      return scalar;
    }

    const normalized = this.normalizeTypeName(typeName);
    if (normalized === "google.protobuf.Timestamp") {
      return TimestampType;
    }
    if (normalized === "google.protobuf.Duration") {
      return DurationType;
    }
    if (normalized === "google.protobuf.Any") {
      return DynType;
    }
    if (normalized === "google.protobuf.Struct") {
      return DynType;
    }
    if (normalized === "google.protobuf.Value") {
      return DynType;
    }
    if (normalized === "google.protobuf.ListValue") {
      return new ListType(DynType);
    }

    try {
      this.root.lookupEnum(normalized);
      return IntType;
    } catch {
      return new StructType(normalized);
    }
  }

  private scalarType(typeName: string | undefined): Type {
    switch (typeName) {
      case "bool":
        return BoolType;
      case "string":
        return StringType;
      case "bytes":
        return BytesType;
      case "double":
      case "float":
        return DoubleType;
      case "int32":
      case "sint32":
      case "sfixed32":
      case "int64":
      case "sint64":
      case "sfixed64":
        return IntType;
      case "uint32":
      case "uint64":
      case "fixed32":
      case "fixed64":
        return UintType;
      default:
        return DynType;
    }
  }
}

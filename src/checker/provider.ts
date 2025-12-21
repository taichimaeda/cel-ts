import type { Field, Type as ProtoType, Root } from "protobufjs";
import type { StructDecl } from "./decls";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  IntType,
  ListType,
  MapType,
  OpaqueType,
  StringType,
  StructType,
  TimestampType,
  type Type,
  UintType,
} from "./types";

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
   * Find an enum type by name.
   */
  findEnumType(typeName: string): Type | undefined;

  /**
   * Find a field type within a struct.
   */
  findStructFieldType(typeName: string, fieldName: string): Type | undefined;

  /**
   * Get all field names for a struct type.
   */
  structFieldNames(typeName: string): string[];

  /**
   * Find an enum value by enum and value name.
   */
  findEnumValue(enumName: string, valueName: string): number | undefined;

  /**
   * Lookup the proto field scalar type if available.
   */
  fieldProtoType(typeName: string, fieldName: string): string | null;

  /**
   * Whether a field is part of a oneof.
   */
  fieldIsOneof(typeName: string, fieldName: string): boolean;
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

  findEnumType(typeName: string): Type | undefined {
    for (const provider of this.providers) {
      const result = provider.findEnumType(typeName);
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

  findEnumValue(enumName: string, valueName: string): number | undefined {
    for (const provider of this.providers) {
      const result = provider.findEnumValue(enumName, valueName);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  fieldProtoType(typeName: string, fieldName: string): string | null {
    for (const provider of this.providers) {
      const result = provider.fieldProtoType(typeName, fieldName);
      if (result) {
        return result;
      }
    }
    return null;
  }

  fieldIsOneof(typeName: string, fieldName: string): boolean {
    for (const provider of this.providers) {
      if (provider.fieldIsOneof(typeName, fieldName)) {
        return true;
      }
    }
    return false;
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

  findEnumType(_typeName: string): Type | undefined {
    return undefined;
  }

  findStructFieldType(typeName: string, fieldName: string): Type | undefined {
    return this.structs.get(typeName)?.fieldType(fieldName);
  }

  structFieldNames(typeName: string): string[] {
    return this.structs.get(typeName)?.fieldNames() ?? [];
  }

  findEnumValue(_enumName: string, _valueName: string): number | undefined {
    return undefined;
  }

  fieldProtoType(_typeName: string, _fieldName: string): string | null {
    return null;
  }

  fieldIsOneof(_typeName: string, _fieldName: string): boolean {
    return false;
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

  findEnumType(typeName: string): Type | undefined {
    const normalized = this.normalizeTypeName(typeName);
    try {
      const enumType = this.root.lookupEnum(normalized);
      return new OpaqueType(this.normalizeTypeName(enumType.fullName ?? normalized));
    } catch {
      return undefined;
    }
  }

  findStructFieldType(typeName: string, fieldName: string): Type | undefined {
    const message = this.lookupMessage(typeName);
    const field = message ? resolveMessageField(message, fieldName) : undefined;
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
    return Object.keys(message.fields).map((name) => normalizeFieldName(name));
  }

  fieldProtoType(typeName: string, fieldName: string): string | null {
    const message = this.lookupMessage(typeName);
    const field = message ? resolveMessageField(message, fieldName) : undefined;
    return field?.type ?? null;
  }

  fieldIsOneof(typeName: string, fieldName: string): boolean {
    const message = this.lookupMessage(typeName);
    const field = message ? resolveMessageField(message, fieldName) : undefined;
    return Boolean(field?.partOf);
  }

  findEnumValue(enumName: string, valueName: string): number | undefined {
    const normalized = this.normalizeTypeName(enumName);
    try {
      const enumType = this.root.lookupEnum(normalized);
      return enumType.values[valueName];
    } catch {
      return undefined;
    }
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
    const baseType = this.typeFromField(field);
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
      const enumType = this.root.lookupEnum(normalized);
      return new OpaqueType(this.normalizeTypeName(enumType.fullName ?? normalized));
    } catch {
      // Ignore.
    }

    try {
      const message = this.root.lookupType(normalized);
      return new StructType(this.normalizeTypeName(message.fullName ?? normalized));
    } catch {
      return new StructType(normalized);
    }
  }

  private typeFromField(field: Field): Type {
    const resolved = (field as Field & { resolvedType?: ProtoType }).resolvedType;
    if (resolved) {
      const fullName = this.normalizeTypeName(resolved.fullName ?? field.type);
      if (fullName === "google.protobuf.Timestamp") {
        return TimestampType;
      }
      if (fullName === "google.protobuf.Duration") {
        return DurationType;
      }
      if (fullName === "google.protobuf.Any") {
        return DynType;
      }
      if (fullName === "google.protobuf.Struct") {
        return new MapType(StringType, DynType);
      }
      if (fullName === "google.protobuf.Value") {
        return DynType;
      }
      if (fullName === "google.protobuf.ListValue") {
        return new ListType(DynType);
      }
      try {
        const enumType = this.root.lookupEnum(fullName);
        return new OpaqueType(this.normalizeTypeName(enumType.fullName ?? fullName));
      } catch {
        return new StructType(fullName);
      }
    }
    return this.typeFromName(field.type);
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

function normalizeFieldName(name: string): string {
  if (name.includes("_")) {
    return name;
  }
  return name.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function resolveMessageField(message: ProtoType, fieldName: string): Field | undefined {
  const direct = message.fields[fieldName];
  if (direct) {
    return direct;
  }
  const camel = fieldName.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase());
  const camelField = message.fields[camel];
  if (camelField) {
    return camelField;
  }
  const snake = normalizeFieldName(fieldName);
  return message.fields[snake];
}

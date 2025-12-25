import type { Field, Type as ProtoType, Root } from "protobufjs";
import { Field as ProtobufField, Type as ProtobufType } from "protobufjs";
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

type ProtobufRoot = Pick<Root, "lookupType" | "lookupEnum" | "lookup">;

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
   * Find an enum value by enum type and value name.
   */
  findEnumValue(typeName: string, valueName: string): number | undefined;

  /**
   * Lookup the proto field scalar type if available.
   */
  fieldProtoType(typeName: string, fieldName: string): string | undefined;

  /**
   * Whether a field is part of a oneof.
   */
  fieldIsOneof(typeName: string, fieldName: string): boolean;

  /**
   * Whether a field tracks presence.
   * Proto2 scalars always track presence (so setting an int32 to 0 makes has(x.field) true).
   * Proto3 scalars only track presence when declared optional/oneof (so setting an int32 to 0 is absent otherwise).
   */
  fieldHasPresence(typeName: string, fieldName: string): boolean;

  /**
   * Default value for a field if known.
   */
  findStructFieldDefaultValue(typeName: string, fieldName: string): unknown | undefined;
}

/**
 * Type provider that merges multiple providers.
 */
export class CompositeTypeProvider implements TypeProvider {
  constructor(private readonly providers: readonly TypeProvider[]) { }

  findStructType(typeName: string): Type | undefined {
    for (const provider of this.providers) {
      const result = provider.findStructType(typeName);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  findEnumType(typeName: string): Type | undefined {
    for (const provider of this.providers) {
      const result = provider.findEnumType(typeName);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  findStructFieldType(typeName: string, fieldName: string): Type | undefined {
    for (const provider of this.providers) {
      const result = provider.findStructFieldType(typeName, fieldName);
      if (result !== undefined) {
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

  fieldProtoType(typeName: string, fieldName: string): string | undefined {
    for (const provider of this.providers) {
      const result = provider.fieldProtoType(typeName, fieldName);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  fieldIsOneof(typeName: string, fieldName: string): boolean {
    for (const provider of this.providers) {
      if (provider.fieldIsOneof(typeName, fieldName)) {
        return true;
      }
    }
    return false;
  }

  fieldHasPresence(typeName: string, fieldName: string): boolean {
    for (const provider of this.providers) {
      if (provider.fieldHasPresence(typeName, fieldName)) {
        return true;
      }
    }
    return false;
  }

  findStructFieldDefaultValue(typeName: string, fieldName: string): unknown | undefined {
    for (const provider of this.providers) {
      const value = provider.findStructFieldDefaultValue(typeName, fieldName);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
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

  fieldProtoType(_typeName: string, _fieldName: string): string | undefined {
    return undefined;
  }

  fieldIsOneof(_typeName: string, _fieldName: string): boolean {
    return false;
  }

  fieldHasPresence(_typeName: string, _fieldName: string): boolean {
    return false;
  }

  findStructFieldDefaultValue(_typeName: string, _fieldName: string): unknown | undefined {
    return undefined;
  }
}

/**
 * Protobuf-backed type provider for resolving message fields as CEL struct types.
 */
export class ProtobufTypeProvider implements TypeProvider {
  constructor(
    private readonly root: ProtobufRoot,
    private readonly options: { legacyProto2?: boolean } = {}
  ) { }

  findStructType(typeName: string): Type | undefined {
    const message = this.lookupMessage(typeName);
    if (message === undefined) {
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
    if (this.isLegacyProto2Enabled(message)) {
      if (field === undefined && message !== undefined) {
        const extensionField = resolveExtensionField(this.root, message, fieldName);
        if (extensionField !== undefined) {
          return this.fieldType(extensionField);
        }
      }
    }
    if (field === undefined) {
      return undefined;
    }
    return this.fieldType(field);
  }

  structFieldNames(typeName: string): string[] {
    const message = this.lookupMessage(typeName);
    if (message === undefined) {
      return [];
    }
    return message.fieldsArray.map((field) =>
      stripLeadingDot(normalizeFieldName(field.name))
    );
  }

  fieldProtoType(typeName: string, fieldName: string): string | undefined {
    const message = this.lookupMessage(typeName);
    const field = message ? resolveMessageField(message, fieldName) : undefined;
    if (this.isLegacyProto2Enabled(message)) {
      if (field === undefined && message !== undefined) {
        const extensionField = resolveExtensionField(this.root, message, fieldName);
        if (extensionField !== undefined) {
          return extensionField.type ?? undefined;
        }
      }
    }
    return field?.type ?? undefined;
  }

  fieldIsOneof(typeName: string, fieldName: string): boolean {
    const message = this.lookupMessage(typeName);
    const field = message ? resolveMessageField(message, fieldName) : undefined;
    return Boolean(field?.partOf);
  }

  fieldHasPresence(typeName: string, fieldName: string): boolean {
    const message = this.lookupMessage(typeName);
    const field = message ? resolveMessageField(message, fieldName) : undefined;
    if (this.isLegacyProto2Enabled(message)) {
      if (field === undefined && message !== undefined) {
        const extensionField = resolveExtensionField(this.root, message, fieldName);
        return this.fieldHasPresenceFor(message, extensionField);
      }
    }
    return this.fieldHasPresenceFor(message, field);
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

  findStructFieldDefaultValue(typeName: string, fieldName: string): unknown | undefined {
    const message = this.lookupMessage(typeName);
    if (!this.isLegacyProto2Enabled(message)) {
      return undefined;
    }
    const field = message ? resolveMessageField(message, fieldName) : undefined;
    if (field === undefined && message !== undefined) {
      const extensionField = resolveExtensionField(this.root, message, fieldName);
      if (extensionField !== undefined) {
        return extensionField.defaultValue;
      }
    }
    return field?.defaultValue;
  }

  private lookupMessage(typeName: string): ProtoType | undefined {
    const normalized = this.normalizeTypeName(typeName);
    try {
      return this.root.lookupType(normalized);
    } catch {
      return undefined;
    }
  }

  private fieldHasPresenceFor(message?: ProtoType, field?: Field): boolean {
    if (message === undefined || field === undefined) {
      return false;
    }
    if (this.isLegacyProto2Enabled(message)) {
      return !field.repeated && !field.map;
    }
    return Boolean(field.hasPresence);
  }

  private isLegacyProto2Enabled(message?: ProtoType): boolean {
    return Boolean(this.options.legacyProto2 && message && this.isLegacyProto2Message(message));
  }

  private isLegacyProto2Message(message: ProtoType): boolean {
    const edition = (message as ProtoType & { _edition?: string })._edition;
    if (edition === "proto2") {
      return true;
    }
    const features = (message as ProtoType & { _features?: { field_presence?: string } })
      ._features;
    return features?.field_presence === "EXPLICIT";
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
    if (resolved !== null && resolved !== undefined) {
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

function stripLeadingDot(name: string): string {
  return name.startsWith(".") ? name.slice(1) : name;
}

function resolveMessageField(message: ProtoType, fieldName: string): Field | undefined {
  const normalized = stripLeadingDot(fieldName);
  const candidates = [fieldName, normalized, `.${normalized}`];
  for (const name of candidates) {
    const direct = message.fields[name];
    if (direct !== undefined) {
      return direct;
    }
    const arrayField = message.fieldsArray.find((field) => field.name === name);
    if (arrayField !== undefined) {
      return arrayField;
    }
  }
  const camel = normalized.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase());
  const camelCandidates = [camel, `.${camel}`];
  for (const name of camelCandidates) {
    const camelField = message.fields[name];
    if (camelField !== undefined) {
      return camelField;
    }
    const arrayField = message.fieldsArray.find((field) => field.name === name);
    if (arrayField !== undefined) {
      return arrayField;
    }
  }
  const snake = normalizeFieldName(normalized);
  const snakeCandidates = [snake, `.${snake}`];
  for (const name of snakeCandidates) {
    const snakeField = message.fields[name];
    if (snakeField !== undefined) {
      return snakeField;
    }
    const arrayField = message.fieldsArray.find((field) => field.name === name);
    if (arrayField !== undefined) {
      return arrayField;
    }
  }
  return undefined;
}

function resolveExtensionField(
  root: ProtobufRoot,
  message: ProtoType,
  fieldName: string
): Field | undefined {
  const normalized = stripLeadingDot(fieldName);
  let candidate: unknown;
  try {
    candidate = root.lookup(normalized);
  } catch {
    return undefined;
  }
  if (!(candidate instanceof ProtobufField)) {
    return undefined;
  }
  const targetName = extensionTargetName(candidate);
  if (targetName === undefined) {
    return undefined;
  }
  const messageName = stripLeadingDot(message.fullName ?? "");
  return messageName === targetName ? candidate : undefined;
}

function extensionTargetName(field: ProtobufField): string | undefined {
  const extend = field.extend;
  if (extend === undefined) {
    return undefined;
  }
  if (extend.startsWith(".")) {
    return stripLeadingDot(extend);
  }
  const parent = field.parent;
  if (parent instanceof ProtobufType) {
    const parentPackage = stripLeadingDot(parent.parent?.fullName ?? "");
    return parentPackage ? `${parentPackage}.${extend}` : extend;
  }
  if (parent === null || parent === undefined) {
    return extend;
  }
  const parentFull = stripLeadingDot(parent.fullName ?? "");
  return parentFull ? `${parentFull}.${extend}` : extend;
}

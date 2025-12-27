// CEL Type Checker
// Exports for the checker module

export { Checker } from "./checker";
/** Type checker result summary. */
export type { CheckResult } from "./checker";

// Re-export ReferenceInfo helpers from common/ast
export { ConstantReference, FunctionReference, VariableReference } from "../common/ast";
/** Reference info captured during type checking. */
export type { ReferenceInfo } from "../common/ast";

export {
  FunctionDecl,
  FunctionOverloadDecl as OverloadDecl,
  StructDecl,
  StructFieldDecl,
  VariableDecl,
} from "./decls";

export { CheckerEnv, Container } from "./env";
/** Symbol lookup result from the checker environment. */
export type { LookupResult } from "./env";
export { CompositeTypeProvider, ProtobufTypeProvider, StructTypeProvider } from "./provider";
/** Type provider interface used during type checking. */
export type { TypeProvider } from "./provider";

export { Errors } from "./errors";
/** Checker error metadata types. */
export type { Error, Location } from "./errors";

export { TypeMapping } from "./mapping";
export {
  AnyType,
  BoolType,
  BytesType,
  DoubleType,
  DynListType,
  DynMapType,
  DynType,
  DynTypeType,
  DurationType,
  ErrorType,
  IntType,
  joinTypes,
  ListType,
  MapType,
  OpaqueType,
  OptionalType,
  NullType,
  StringType,
  StructType,
  TimestampType,
  Type,
  TypeParamType,
  TypeType,
  UintType,
  wellKnownTypeNameToKind,
  wrapperTypeNameToKind,
} from "./types";

/** Type-system helper kinds and names. */
export type {
  BuiltinTypeName,
  ComplexTypeKind,
  PrimitiveTypeKind,
  SpecialTypeKind,
  TemporalTypeKind,
  TypeKind,
  WellKnownTypeKind,
  WellKnownTypeName,
  WrapperTypeKind,
  WrapperTypeName,
} from "./types";

export { StandardLibrary } from "./stdlib";

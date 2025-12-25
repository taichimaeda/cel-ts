// CEL Type Checker
// Exports for the checker module

export { Checker } from "./checker";
export type { CheckResult } from "./checker";

// Re-export ReferenceInfo helpers from common/ast
export { FunctionReference, VariableReference } from "../common/ast";
export type { ReferenceInfo } from "../common/ast";

export {
  FunctionDecl,
  FunctionOverloadDecl as OverloadDecl,
  StructDecl,
  StructFieldDecl,
  VariableDecl
} from "./decls";

export { CheckerEnv, Container } from "./env";
export type { LookupResult } from "./env";
export { CompositeTypeProvider, ProtobufTypeProvider, StructTypeProvider } from "./provider";
export type { TypeProvider } from "./provider";

export { Errors } from "./errors";
export type { Error, Location } from "./errors";

export { TypeMapping } from "./mapping";
export {
  DynListType,
  DynMapType,
  joinTypes,
  ListType,
  MapType,
  OpaqueType,
  OptionalType,
  PolymorphicTypeType,
  PrimitiveTypes,
  StructType,
  Type,
  TypeParamType,
  wellKnownTypeNameToKind,
  wrapperTypeNameToKind
} from "./types";

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
  WrapperTypeName
} from "./types";

export { StandardLibrary } from "./stdlib";

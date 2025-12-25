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

export { CheckerErrors } from "./error";
export type { CheckerError, Location } from "./error";

export { TypeMapping } from "./mapping";
export {
  AnyType,
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  ErrorType,
  IntType,
  joinTypes,
  ListType,
  MapType,
  NullType,
  OpaqueType,
  OptionalType,
  StringType,
  TimestampType,
  Type,
  TypeKind,
  TypeParamType,
  TypeType,
  PolymorphicTypeType,
  UintType
} from "./types";

export { StandardLibrary } from "./stdlib";

// CEL Type Checker
// Exports for the checker module

export { Checker } from "./checker";
export type { CheckResult } from "./checker";

// Re-export ReferenceInfo helpers from common/ast
export { FunctionReference, IdentReference } from "../common/ast";
export type { ReferenceInfo } from "../common/ast";

export {
  FunctionDecl,
  OverloadDecl,
  StructDecl,
  StructFieldDecl,
  VariableDecl,
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
  isAssignable,
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
  TypeTypeWithParam,
  UintType,
} from "./types";

export { StandardLibrary } from "./stdlib";

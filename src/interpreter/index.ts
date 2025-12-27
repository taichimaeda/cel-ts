// CEL Interpreter Module
// Interpreter module exports

// Interpreter runtime type helpers
export { OptionalType, DynamicType as RuntimeType, UnknownType } from "./types";

// Values - Runtime values
export {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  EnumValue,
  ErrorValue,
  IntLimits,
  IntValue,
  ListValue,
  MapValue,
  NullValue,
  OptionalValue,
  StringValue,
  StructValue,
  TimestampValue,
  TypeValue,
  UintValue,
  UnknownValue,
  compareValues,
  isBoolValue,
  isBytesValue,
  isComparableValue,
  isDoubleValue,
  isDurationValue,
  isEnumValue,
  isErrorValue,
  isIntValue,
  isListValue,
  isMapValue,
  isNullValue,
  isOptionalValue,
  isStringValue,
  isStructValue,
  isTimestampValue,
  isTypeValue,
  isUintValue,
  isUnknownValue,
  toTypeValue,
} from "./values";
/**
 * Map entries and values used by interpreter outputs.
 */
export type { MapEntry, Value } from "./values";

// Activation - Variable resolution
export {
  EmptyActivation,
  HierarchicalActivation,
  LazyActivation,
  MapActivation,
  MutableActivation,
  PartialActivation,
  StrictActivation,
  ActivationCache,
  type Activation,
} from "./activation";

// Attributes - Attributes/qualifiers
export {
  AbsoluteAttribute,
  ComputedQualifier,
  ConditionalAttribute,
  IndexQualifier,
  MaybeAttribute,
  RelativeAttribute,
  StringQualifier,
  type Attribute,
  type Qualifier,
} from "./attributes";

// Dispatcher - Function dispatcher
export {
  BinaryDispatcherOverload,
  Dispatcher,
  NaryDispatcherOverload,
  UnaryDispatcherOverload,
  type BinaryOp,
  type FunctionOp,
  type Overload,
  type UnaryOp,
} from "./dispatcher";

// Interpretable - Evaluatable expressions
export {
  AndValue,
  AttrValue,
  BinaryValue,
  CallValue,
  ComprehensionValue,
  ConditionalValue,
  ConstValue,
  CreateListValue,
  CreateMapValue,
  CreateStructValue,
  FieldValue,
  IdentValue,
  IndexValue,
  NegValue,
  NotValue,
  OrValue,
  TypeConversionValue,
  type Interpretable,
} from "./interpretable";

// Planner - AST transformation
export {
  Planner,
  type PlannerOptions,
} from "../planner";

// Interpreter - Main API
export {
  Env,
  Program,
  type CompileResult,
  type Declaration,
  type EnvOptions,
  type EvalResult,
} from "./interpreter";

// Functions - Standard functions
export {
  arithmeticFunctions,
  comparisonFunctions,
  listFunctions,
  logicalFunctions,
  mapFunctions,
  miscFunctions,
  sizeFunctions,
  standardFunctions,
  stringFunctions,
  timeFunctions,
  typeConversionFunctions,
} from "./functions";

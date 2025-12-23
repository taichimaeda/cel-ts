// CEL Interpreter Module
// Interpreter module exports

// Interpreter runtime type helpers
export { OptionalType, RuntimeType, UnknownType } from "./types";

// Values - Runtime values
export {
  BoolValue,
  BytesValue,
  DefaultTypeAdapter,
  DoubleValue,
  DurationValue,
  EnumValue,
  ErrorValue,
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
  ValueUtil
} from "./values";
export type { MapEntry, TypeAdapter, Value, ValueType } from "./values";

// Activation - Variable resolution
export {
  EmptyActivation,
  HierarchicalActivation,
  LazyActivation,
  MapActivation,
  MutableActivation,
  PartialActivation,
  StrictActivation,
  type Activation
} from "./activation";

// Attributes - Attributes/qualifiers
export {
  AbsoluteAttribute,
  ComputedQualifier,
  ConditionalAttribute,
  DefaultAttributeFactory,
  IndexQualifier,
  MaybeAttribute,
  RelativeAttribute,
  StringQualifier,
  type Attribute,
  type AttributeFactory,
  type Qualifier
} from "./attributes";

// Dispatcher - Function dispatcher
export {
  BinaryDispatcherOverload,
  Dispatcher as DefaultDispatcher,
  TryResolvedCall as ResolvedCall,
  UnaryDispatcherOverload,
  NaryDispatcherOverload as VariadicDispatcherOverload,
  type BinaryOp,
  type ResolvedCall as FunctionCall,
  type FunctionOp,
  type Overload,
  type UnaryOp
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
  type Interpretable
} from "./interpretable";

// Planner - AST transformation
export {
  Planner,
  type PlannerOptions
} from "../planner";

// Interpreter - Main API
export {
  Env,
  Program,
  type CompileResult,
  type Declaration,
  type EnvOptions,
  type EvalResult
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
  typeConversionFunctions
} from "./functions";

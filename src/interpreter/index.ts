// CEL Interpreter Module
// Interpreter module exports

// Values - Runtime values
export {
  type Value,
  type TypeAdapter,
  type MapEntry,
  ValueType,
  ValueTrait,
  BoolValue,
  IntValue,
  UintValue,
  DoubleValue,
  StringValue,
  BytesValue,
  NullValue,
  ListValue,
  MapValue,
  TypeValue,
  DurationValue,
  TimestampValue,
  ErrorValue,
  UnknownValue,
  OptionalValue,
  DefaultTypeAdapter,
  isError,
  isUnknown,
  isErrorOrUnknown,
} from "./values";

// Activation - Variable resolution
export {
  type Activation,
  EmptyActivation,
  MapActivation,
  LazyActivation,
  HierarchicalActivation,
  PartialActivation,
  MutableActivation,
  StrictActivation,
} from "./activation";

// Attributes - Attributes/qualifiers
export {
  type Attribute,
  type Qualifier,
  type AttributeFactory,
  StringQualifier,
  IndexQualifier,
  ComputedQualifier,
  AbsoluteAttribute,
  RelativeAttribute,
  ConditionalAttribute,
  MaybeAttribute,
  DefaultAttributeFactory,
} from "./attributes";

// Dispatcher - Function dispatcher
export {
  type Overload,
  type UnaryOp,
  type BinaryOp,
  type FunctionOp,
  type Dispatcher,
  type FunctionCall,
  DefaultDispatcher,
  ResolvedCall,
  FunctionResolver,
  UnaryDispatcherOverload,
  BinaryDispatcherOverload,
  VariadicDispatcherOverload,
} from "./dispatcher";

// Interpretable - Evaluatable expressions
export {
  type Interpretable,
  type Coster,
  ConstValue,
  IdentValue,
  AttrValue,
  NotValue,
  NegValue,
  AndValue,
  OrValue,
  ConditionalValue,
  BinaryValue,
  CallValue,
  CreateListValue,
  CreateMapValue,
  CreateStructValue,
  IndexValue,
  FieldValue,
  ComprehensionValue,
  TypeConversionValue,
} from "./interpretable";

// Planner - AST transformation
export {
  type PlannerOptions,
  Planner,
} from "./planner";

// Interpreter - Main API
export {
  type Program,
  type EvalResult,
  type EnvOptions,
  type CompileResult,
  type Declaration,
  Env,
  evaluate,
} from "./interpreter";

// Functions - Standard functions
export { registerStandardFunctions } from "./functions";

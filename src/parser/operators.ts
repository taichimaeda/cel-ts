// Operator names for CEL (shared between parser helper and macros).
export const Operators = {
  // Arithmetic
  Add: "_+_",
  Subtract: "_-_",
  Multiply: "_*_",
  Divide: "_/_",
  Modulo: "_%_",
  Negate: "-_",

  // Comparison
  Equals: "_==_",
  NotEquals: "_!=_",
  Less: "_<_",
  LessEquals: "_<=_",
  Greater: "_>_",
  GreaterEquals: "_>=_",
  In: "_in_",

  // Logical
  LogicalAnd: "_&&_",
  LogicalOr: "_||_",
  LogicalNot: "!_",
  NotStrictlyFalse: "@not_strictly_false",
  Conditional: "_?_:_",

  // Index
  Index: "_[_]",
};

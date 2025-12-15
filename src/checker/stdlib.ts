// CEL Standard Library Declarations
// Standard library declarations for the type checker
// Implemented based on checker/decls.go from cel-go

import { FunctionDecl, OverloadDecl } from "./decls";
import {
  BoolType,
  BytesType,
  DoubleType,
  DynType,
  DurationType,
  IntType,
  ListType,
  MapType,
  StringType,
  TimestampType,
  TypeParamType,
  TypeTypeWithParam,
  UintType,
} from "./types";

/**
 * Get all standard library function declarations.
 * Retrieves all standard library function declarations
 */
export function getStandardFunctions(): FunctionDecl[] {
  return [
    // Size functions
    sizeFunction(),
    // Type conversion functions
    intFunction(),
    uintFunction(),
    doubleFunction(),
    stringFunction(),
    boolFunction(),
    bytesFunction(),
    typeFunction(),
    durationFunction(),
    timestampFunction(),
    // String methods
    containsFunction(),
    startsWithFunction(),
    endsWithFunction(),
    matchesFunction(),
    // Collection functions
    inFunction(),
    indexFunction(),
    // Comparison operators (built-in but declared for completeness)
    ...comparisonFunctions(),
    // Arithmetic operators
    ...arithmeticFunctions(),
    // Logical operators
    ...logicalFunctions(),
  ];
}

/**
 * size function - returns the size of strings, bytes, lists, and maps
 */
function sizeFunction(): FunctionDecl {
  const fn = new FunctionDecl("size");

  // size(string) -> int
  fn.addOverload(new OverloadDecl("size_string", [StringType], IntType));

  // size(bytes) -> int
  fn.addOverload(new OverloadDecl("size_bytes", [BytesType], IntType));

  // size(list) -> int
  fn.addOverload(
    new OverloadDecl("size_list", [new ListType(new TypeParamType("T"))], IntType, ["T"])
  );

  // size(map) -> int
  fn.addOverload(
    new OverloadDecl(
      "size_map",
      [new MapType(new TypeParamType("K"), new TypeParamType("V"))],
      IntType,
      ["K", "V"]
    )
  );

  // string.size() -> int (receiver style)
  fn.addOverload(
    new OverloadDecl(
      "string_size",
      [StringType],
      IntType,
      [],
      true // member function
    )
  );

  // bytes.size() -> int (receiver style)
  fn.addOverload(new OverloadDecl("bytes_size", [BytesType], IntType, [], true));

  // list.size() -> int (receiver style)
  fn.addOverload(
    new OverloadDecl(
      "list_size",
      [new ListType(new TypeParamType("T"))],
      IntType,
      ["T"],
      true
    )
  );

  // map.size() -> int (receiver style)
  fn.addOverload(
    new OverloadDecl(
      "map_size",
      [new MapType(new TypeParamType("K"), new TypeParamType("V"))],
      IntType,
      ["K", "V"],
      true
    )
  );

  return fn;
}

/**
 * int() type conversion function
 */
function intFunction(): FunctionDecl {
  const fn = new FunctionDecl("int");

  // int(int) -> int
  fn.addOverload(new OverloadDecl("int_int", [IntType], IntType));
  // int(uint) -> int
  fn.addOverload(new OverloadDecl("int_uint", [UintType], IntType));
  // int(double) -> int
  fn.addOverload(new OverloadDecl("int_double", [DoubleType], IntType));
  // int(string) -> int
  fn.addOverload(new OverloadDecl("int_string", [StringType], IntType));
  // int(timestamp) -> int (seconds since epoch)
  fn.addOverload(new OverloadDecl("int_timestamp", [TimestampType], IntType));

  return fn;
}

/**
 * uint() type conversion function
 */
function uintFunction(): FunctionDecl {
  const fn = new FunctionDecl("uint");

  // uint(int) -> uint
  fn.addOverload(new OverloadDecl("uint_int", [IntType], UintType));
  // uint(uint) -> uint
  fn.addOverload(new OverloadDecl("uint_uint", [UintType], UintType));
  // uint(double) -> uint
  fn.addOverload(new OverloadDecl("uint_double", [DoubleType], UintType));
  // uint(string) -> uint
  fn.addOverload(new OverloadDecl("uint_string", [StringType], UintType));

  return fn;
}

/**
 * double() type conversion function
 */
function doubleFunction(): FunctionDecl {
  const fn = new FunctionDecl("double");

  // double(int) -> double
  fn.addOverload(new OverloadDecl("double_int", [IntType], DoubleType));
  // double(uint) -> double
  fn.addOverload(new OverloadDecl("double_uint", [UintType], DoubleType));
  // double(double) -> double
  fn.addOverload(new OverloadDecl("double_double", [DoubleType], DoubleType));
  // double(string) -> double
  fn.addOverload(new OverloadDecl("double_string", [StringType], DoubleType));

  return fn;
}

/**
 * string() type conversion function
 */
function stringFunction(): FunctionDecl {
  const fn = new FunctionDecl("string");

  // string(int) -> string
  fn.addOverload(new OverloadDecl("string_int", [IntType], StringType));
  // string(uint) -> string
  fn.addOverload(new OverloadDecl("string_uint", [UintType], StringType));
  // string(double) -> string
  fn.addOverload(new OverloadDecl("string_double", [DoubleType], StringType));
  // string(string) -> string
  fn.addOverload(new OverloadDecl("string_string", [StringType], StringType));
  // string(bytes) -> string
  fn.addOverload(new OverloadDecl("string_bytes", [BytesType], StringType));
  // string(timestamp) -> string
  fn.addOverload(new OverloadDecl("string_timestamp", [TimestampType], StringType));
  // string(duration) -> string
  fn.addOverload(new OverloadDecl("string_duration", [DurationType], StringType));

  return fn;
}

/**
 * bool() type conversion function
 */
function boolFunction(): FunctionDecl {
  const fn = new FunctionDecl("bool");

  // bool(bool) -> bool
  fn.addOverload(new OverloadDecl("bool_bool", [BoolType], BoolType));
  // bool(string) -> bool
  fn.addOverload(new OverloadDecl("bool_string", [StringType], BoolType));

  return fn;
}

/**
 * bytes() type conversion function
 */
function bytesFunction(): FunctionDecl {
  const fn = new FunctionDecl("bytes");

  // bytes(string) -> bytes
  fn.addOverload(new OverloadDecl("bytes_string", [StringType], BytesType));
  // bytes(bytes) -> bytes
  fn.addOverload(new OverloadDecl("bytes_bytes", [BytesType], BytesType));

  return fn;
}

/**
 * type() function - returns the type of a value
 */
function typeFunction(): FunctionDecl {
  const fn = new FunctionDecl("type");

  // type(dyn) -> type
  fn.addOverload(new OverloadDecl("type_dyn", [DynType], new TypeTypeWithParam(DynType), []));

  return fn;
}

/**
 * duration() function - creates duration from string
 */
function durationFunction(): FunctionDecl {
  const fn = new FunctionDecl("duration");

  // duration(string) -> duration
  fn.addOverload(new OverloadDecl("duration_string", [StringType], DurationType));

  return fn;
}

/**
 * timestamp() function - creates timestamp from string or int
 */
function timestampFunction(): FunctionDecl {
  const fn = new FunctionDecl("timestamp");

  // timestamp(string) -> timestamp
  fn.addOverload(new OverloadDecl("timestamp_string", [StringType], TimestampType));
  // timestamp(int) -> timestamp (seconds since epoch)
  fn.addOverload(new OverloadDecl("timestamp_int", [IntType], TimestampType));

  return fn;
}

/**
 * contains() string method
 */
function containsFunction(): FunctionDecl {
  const fn = new FunctionDecl("contains");

  // string.contains(string) -> bool
  fn.addOverload(
    new OverloadDecl(
      "contains_string",
      [StringType, StringType],
      BoolType,
      [],
      true // member function
    )
  );

  return fn;
}

/**
 * startsWith() string method
 */
function startsWithFunction(): FunctionDecl {
  const fn = new FunctionDecl("startsWith");

  // string.startsWith(string) -> bool
  fn.addOverload(
    new OverloadDecl("startsWith_string", [StringType, StringType], BoolType, [], true)
  );

  return fn;
}

/**
 * endsWith() string method
 */
function endsWithFunction(): FunctionDecl {
  const fn = new FunctionDecl("endsWith");

  // string.endsWith(string) -> bool
  fn.addOverload(
    new OverloadDecl("endsWith_string", [StringType, StringType], BoolType, [], true)
  );

  return fn;
}

/**
 * matches() string method for regex matching
 */
function matchesFunction(): FunctionDecl {
  const fn = new FunctionDecl("matches");

  // string.matches(string) -> bool
  fn.addOverload(
    new OverloadDecl("matches_string", [StringType, StringType], BoolType, [], true)
  );

  // matches(string, string) -> bool (global function style)
  fn.addOverload(new OverloadDecl("matches_string_string", [StringType, StringType], BoolType));

  return fn;
}

/**
 * in operator function
 */
function inFunction(): FunctionDecl {
  const fn = new FunctionDecl("_in_");

  // T in list<T> -> bool
  fn.addOverload(
    new OverloadDecl(
      "in_list",
      [new TypeParamType("T"), new ListType(new TypeParamType("T"))],
      BoolType,
      ["T"]
    )
  );

  // K in map<K, V> -> bool
  fn.addOverload(
    new OverloadDecl(
      "in_map",
      [
        new TypeParamType("K"),
        new MapType(new TypeParamType("K"), new TypeParamType("V")),
      ],
      BoolType,
      ["K", "V"]
    )
  );

  return fn;
}

/**
 * Index access operator (`_[_]`) providing list and map indexing.
 */
function indexFunction(): FunctionDecl {
  const fn = new FunctionDecl("_[_]");

  // list<T>[int] -> T
  fn.addOverload(
    new OverloadDecl(
      "index_list",
      [new ListType(new TypeParamType("T")), IntType],
      new TypeParamType("T"),
      ["T"]
    )
  );

  // map<K, V>[K] -> V
  fn.addOverload(
    new OverloadDecl(
      "index_map",
      [
        new MapType(new TypeParamType("K"), new TypeParamType("V")),
        new TypeParamType("K"),
      ],
      new TypeParamType("V"),
      ["K", "V"]
    )
  );

  return fn;
}

/**
 * Comparison operator functions
 */
function comparisonFunctions(): FunctionDecl[] {
  const operators = [
    { name: "_==_", id: "equals" },
    { name: "_!=_", id: "not_equals" },
    { name: "_<_", id: "less" },
    { name: "_<=_", id: "less_equals" },
    { name: "_>_", id: "greater" },
    { name: "_>=_", id: "greater_equals" },
  ];

  const types = [
    IntType,
    UintType,
    DoubleType,
    StringType,
    BoolType,
    BytesType,
    TimestampType,
    DurationType,
  ];

  return operators.map((op) => {
    const fn = new FunctionDecl(op.name);

    // Comparison between same types
    for (const t of types) {
      const typeName = t.toString().toLowerCase();
      fn.addOverload(new OverloadDecl(`${op.id}_${typeName}`, [t, t], BoolType));
    }

    // Comparison of Dyn type (for dynamic typing)
    fn.addOverload(new OverloadDecl(`${op.id}_dyn`, [DynType, DynType], BoolType));

    return fn;
  });
}

/**
 * Arithmetic operator functions
 */
function arithmeticFunctions(): FunctionDecl[] {
  const operators = [
    { name: "_+_", id: "add" },
    { name: "_-_", id: "subtract" },
    { name: "_*_", id: "multiply" },
    { name: "_/_", id: "divide" },
    { name: "_%_", id: "modulo" },
  ];

  const numericTypes = [IntType, UintType, DoubleType];

  const fns: FunctionDecl[] = [];

  for (const op of operators) {
    const fn = new FunctionDecl(op.name);

    // Numeric operations
    for (const t of numericTypes) {
      const typeName = t.toString().toLowerCase();
      fn.addOverload(new OverloadDecl(`${op.id}_${typeName}`, [t, t], t));
    }

    // String concatenation (+)
    if (op.name === "_+_") {
      fn.addOverload(new OverloadDecl("add_string", [StringType, StringType], StringType));

      // Bytes concatenation
      fn.addOverload(new OverloadDecl("add_bytes", [BytesType, BytesType], BytesType));

      // List concatenation
      fn.addOverload(
        new OverloadDecl(
          "add_list",
          [
            new ListType(new TypeParamType("T")),
            new ListType(new TypeParamType("T")),
          ],
          new ListType(new TypeParamType("T")),
          ["T"]
        )
      );

      // duration + duration
      fn.addOverload(
        new OverloadDecl("add_duration_duration", [DurationType, DurationType], DurationType)
      );

      // timestamp + duration
      fn.addOverload(
        new OverloadDecl("add_timestamp_duration", [TimestampType, DurationType], TimestampType)
      );

      // duration + timestamp
      fn.addOverload(
        new OverloadDecl("add_duration_timestamp", [DurationType, TimestampType], TimestampType)
      );
    }

    // duration - duration
    if (op.name === "_-_") {
      fn.addOverload(
        new OverloadDecl(
          "subtract_duration_duration",
          [DurationType, DurationType],
          DurationType
        )
      );

      // timestamp - duration
      fn.addOverload(
        new OverloadDecl(
          "subtract_timestamp_duration",
          [TimestampType, DurationType],
          TimestampType
        )
      );

      // timestamp - timestamp
      fn.addOverload(
        new OverloadDecl(
          "subtract_timestamp_timestamp",
          [TimestampType, TimestampType],
          DurationType
        )
      );
    }

    fns.push(fn);
  }

  // Unary negation
  const negFn = new FunctionDecl("-_");
  for (const t of numericTypes) {
    const typeName = t.toString().toLowerCase();
    negFn.addOverload(new OverloadDecl(`negate_${typeName}`, [t], t));
  }
  fns.push(negFn);

  return fns;
}

/**
 * Logical operator functions
 */
function logicalFunctions(): FunctionDecl[] {
  const fns: FunctionDecl[] = [];

  // Logical NOT
  const notFn = new FunctionDecl("!_");
  notFn.addOverload(new OverloadDecl("logical_not", [BoolType], BoolType));
  fns.push(notFn);

  // Logical AND (short-circuit)
  const andFn = new FunctionDecl("_&&_");
  andFn.addOverload(new OverloadDecl("logical_and", [BoolType, BoolType], BoolType));
  fns.push(andFn);

  // Logical OR (short-circuit)
  const orFn = new FunctionDecl("_||_");
  orFn.addOverload(new OverloadDecl("logical_or", [BoolType, BoolType], BoolType));
  fns.push(orFn);

  // Conditional (ternary)
  const condFn = new FunctionDecl("_?_:_");
  condFn.addOverload(
    new OverloadDecl(
      "conditional",
      [BoolType, new TypeParamType("T"), new TypeParamType("T")],
      new TypeParamType("T"),
      ["T"]
    )
  );
  fns.push(condFn);

  // @not_strictly_false - internal helper used in comprehension loop conditions.
  // Accepts a bool and only returns false for strict false (errors count as true).
  const notStrictlyFalseFn = new FunctionDecl("@not_strictly_false");
  notStrictlyFalseFn.addOverload(
    new OverloadDecl("not_strictly_false_bool", [BoolType], BoolType)
  );
  fns.push(notStrictlyFalseFn);

  return fns;
}

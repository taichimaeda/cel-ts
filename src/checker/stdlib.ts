// CEL Standard Library Declarations
// Standard library declarations for the type checker
// Implemented based on checker/decls.go from cel-go

import { FunctionDecl, OverloadDecl } from "./decls";
import { Type } from "./types";

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
  fn.addOverload(new OverloadDecl("size_string", [Type.String], Type.Int));

  // size(bytes) -> int
  fn.addOverload(new OverloadDecl("size_bytes", [Type.Bytes], Type.Int));

  // size(list) -> int
  fn.addOverload(
    new OverloadDecl("size_list", [Type.newListType(Type.newTypeParamType("T"))], Type.Int, ["T"])
  );

  // size(map) -> int
  fn.addOverload(
    new OverloadDecl(
      "size_map",
      [Type.newMapType(Type.newTypeParamType("K"), Type.newTypeParamType("V"))],
      Type.Int,
      ["K", "V"]
    )
  );

  // string.size() -> int (receiver style)
  fn.addOverload(
    new OverloadDecl(
      "string_size",
      [Type.String],
      Type.Int,
      [],
      true // member function
    )
  );

  // bytes.size() -> int (receiver style)
  fn.addOverload(new OverloadDecl("bytes_size", [Type.Bytes], Type.Int, [], true));

  // list.size() -> int (receiver style)
  fn.addOverload(
    new OverloadDecl(
      "list_size",
      [Type.newListType(Type.newTypeParamType("T"))],
      Type.Int,
      ["T"],
      true
    )
  );

  // map.size() -> int (receiver style)
  fn.addOverload(
    new OverloadDecl(
      "map_size",
      [Type.newMapType(Type.newTypeParamType("K"), Type.newTypeParamType("V"))],
      Type.Int,
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
  fn.addOverload(new OverloadDecl("int_int", [Type.Int], Type.Int));
  // int(uint) -> int
  fn.addOverload(new OverloadDecl("int_uint", [Type.Uint], Type.Int));
  // int(double) -> int
  fn.addOverload(new OverloadDecl("int_double", [Type.Double], Type.Int));
  // int(string) -> int
  fn.addOverload(new OverloadDecl("int_string", [Type.String], Type.Int));
  // int(timestamp) -> int (seconds since epoch)
  fn.addOverload(new OverloadDecl("int_timestamp", [Type.Timestamp], Type.Int));

  return fn;
}

/**
 * uint() type conversion function
 */
function uintFunction(): FunctionDecl {
  const fn = new FunctionDecl("uint");

  // uint(int) -> uint
  fn.addOverload(new OverloadDecl("uint_int", [Type.Int], Type.Uint));
  // uint(uint) -> uint
  fn.addOverload(new OverloadDecl("uint_uint", [Type.Uint], Type.Uint));
  // uint(double) -> uint
  fn.addOverload(new OverloadDecl("uint_double", [Type.Double], Type.Uint));
  // uint(string) -> uint
  fn.addOverload(new OverloadDecl("uint_string", [Type.String], Type.Uint));

  return fn;
}

/**
 * double() type conversion function
 */
function doubleFunction(): FunctionDecl {
  const fn = new FunctionDecl("double");

  // double(int) -> double
  fn.addOverload(new OverloadDecl("double_int", [Type.Int], Type.Double));
  // double(uint) -> double
  fn.addOverload(new OverloadDecl("double_uint", [Type.Uint], Type.Double));
  // double(double) -> double
  fn.addOverload(new OverloadDecl("double_double", [Type.Double], Type.Double));
  // double(string) -> double
  fn.addOverload(new OverloadDecl("double_string", [Type.String], Type.Double));

  return fn;
}

/**
 * string() type conversion function
 */
function stringFunction(): FunctionDecl {
  const fn = new FunctionDecl("string");

  // string(int) -> string
  fn.addOverload(new OverloadDecl("string_int", [Type.Int], Type.String));
  // string(uint) -> string
  fn.addOverload(new OverloadDecl("string_uint", [Type.Uint], Type.String));
  // string(double) -> string
  fn.addOverload(new OverloadDecl("string_double", [Type.Double], Type.String));
  // string(string) -> string
  fn.addOverload(new OverloadDecl("string_string", [Type.String], Type.String));
  // string(bytes) -> string
  fn.addOverload(new OverloadDecl("string_bytes", [Type.Bytes], Type.String));
  // string(timestamp) -> string
  fn.addOverload(new OverloadDecl("string_timestamp", [Type.Timestamp], Type.String));
  // string(duration) -> string
  fn.addOverload(new OverloadDecl("string_duration", [Type.Duration], Type.String));

  return fn;
}

/**
 * bool() type conversion function
 */
function boolFunction(): FunctionDecl {
  const fn = new FunctionDecl("bool");

  // bool(bool) -> bool
  fn.addOverload(new OverloadDecl("bool_bool", [Type.Bool], Type.Bool));
  // bool(string) -> bool
  fn.addOverload(new OverloadDecl("bool_string", [Type.String], Type.Bool));

  return fn;
}

/**
 * bytes() type conversion function
 */
function bytesFunction(): FunctionDecl {
  const fn = new FunctionDecl("bytes");

  // bytes(string) -> bytes
  fn.addOverload(new OverloadDecl("bytes_string", [Type.String], Type.Bytes));
  // bytes(bytes) -> bytes
  fn.addOverload(new OverloadDecl("bytes_bytes", [Type.Bytes], Type.Bytes));

  return fn;
}

/**
 * type() function - returns the type of a value
 */
function typeFunction(): FunctionDecl {
  const fn = new FunctionDecl("type");

  // type(dyn) -> type
  fn.addOverload(new OverloadDecl("type_dyn", [Type.Dyn], Type.newTypeTypeWithParam(Type.Dyn), []));

  return fn;
}

/**
 * duration() function - creates duration from string
 */
function durationFunction(): FunctionDecl {
  const fn = new FunctionDecl("duration");

  // duration(string) -> duration
  fn.addOverload(new OverloadDecl("duration_string", [Type.String], Type.Duration));

  return fn;
}

/**
 * timestamp() function - creates timestamp from string or int
 */
function timestampFunction(): FunctionDecl {
  const fn = new FunctionDecl("timestamp");

  // timestamp(string) -> timestamp
  fn.addOverload(new OverloadDecl("timestamp_string", [Type.String], Type.Timestamp));
  // timestamp(int) -> timestamp (seconds since epoch)
  fn.addOverload(new OverloadDecl("timestamp_int", [Type.Int], Type.Timestamp));

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
      [Type.String, Type.String],
      Type.Bool,
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
    new OverloadDecl("startsWith_string", [Type.String, Type.String], Type.Bool, [], true)
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
    new OverloadDecl("endsWith_string", [Type.String, Type.String], Type.Bool, [], true)
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
    new OverloadDecl("matches_string", [Type.String, Type.String], Type.Bool, [], true)
  );

  // matches(string, string) -> bool (global function style)
  fn.addOverload(new OverloadDecl("matches_string_string", [Type.String, Type.String], Type.Bool));

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
      [Type.newTypeParamType("T"), Type.newListType(Type.newTypeParamType("T"))],
      Type.Bool,
      ["T"]
    )
  );

  // K in map<K, V> -> bool
  fn.addOverload(
    new OverloadDecl(
      "in_map",
      [
        Type.newTypeParamType("K"),
        Type.newMapType(Type.newTypeParamType("K"), Type.newTypeParamType("V")),
      ],
      Type.Bool,
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
    Type.Int,
    Type.Uint,
    Type.Double,
    Type.String,
    Type.Bool,
    Type.Bytes,
    Type.Timestamp,
    Type.Duration,
  ];

  return operators.map((op) => {
    const fn = new FunctionDecl(op.name);

    // Comparison between same types
    for (const t of types) {
      const typeName = t.toString().toLowerCase();
      fn.addOverload(new OverloadDecl(`${op.id}_${typeName}`, [t, t], Type.Bool));
    }

    // Comparison of Dyn type (for dynamic typing)
    fn.addOverload(new OverloadDecl(`${op.id}_dyn`, [Type.Dyn, Type.Dyn], Type.Bool));

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

  const numericTypes = [Type.Int, Type.Uint, Type.Double];

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
      fn.addOverload(new OverloadDecl("add_string", [Type.String, Type.String], Type.String));

      // Bytes concatenation
      fn.addOverload(new OverloadDecl("add_bytes", [Type.Bytes, Type.Bytes], Type.Bytes));

      // List concatenation
      fn.addOverload(
        new OverloadDecl(
          "add_list",
          [
            Type.newListType(Type.newTypeParamType("T")),
            Type.newListType(Type.newTypeParamType("T")),
          ],
          Type.newListType(Type.newTypeParamType("T")),
          ["T"]
        )
      );

      // duration + duration
      fn.addOverload(
        new OverloadDecl("add_duration_duration", [Type.Duration, Type.Duration], Type.Duration)
      );

      // timestamp + duration
      fn.addOverload(
        new OverloadDecl("add_timestamp_duration", [Type.Timestamp, Type.Duration], Type.Timestamp)
      );

      // duration + timestamp
      fn.addOverload(
        new OverloadDecl("add_duration_timestamp", [Type.Duration, Type.Timestamp], Type.Timestamp)
      );
    }

    // duration - duration
    if (op.name === "_-_") {
      fn.addOverload(
        new OverloadDecl(
          "subtract_duration_duration",
          [Type.Duration, Type.Duration],
          Type.Duration
        )
      );

      // timestamp - duration
      fn.addOverload(
        new OverloadDecl(
          "subtract_timestamp_duration",
          [Type.Timestamp, Type.Duration],
          Type.Timestamp
        )
      );

      // timestamp - timestamp
      fn.addOverload(
        new OverloadDecl(
          "subtract_timestamp_timestamp",
          [Type.Timestamp, Type.Timestamp],
          Type.Duration
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
  notFn.addOverload(new OverloadDecl("logical_not", [Type.Bool], Type.Bool));
  fns.push(notFn);

  // Logical AND (short-circuit)
  const andFn = new FunctionDecl("_&&_");
  andFn.addOverload(new OverloadDecl("logical_and", [Type.Bool, Type.Bool], Type.Bool));
  fns.push(andFn);

  // Logical OR (short-circuit)
  const orFn = new FunctionDecl("_||_");
  orFn.addOverload(new OverloadDecl("logical_or", [Type.Bool, Type.Bool], Type.Bool));
  fns.push(orFn);

  // Conditional (ternary)
  const condFn = new FunctionDecl("_?_:_");
  condFn.addOverload(
    new OverloadDecl(
      "conditional",
      [Type.Bool, Type.newTypeParamType("T"), Type.newTypeParamType("T")],
      Type.newTypeParamType("T"),
      ["T"]
    )
  );
  fns.push(condFn);

  return fns;
}

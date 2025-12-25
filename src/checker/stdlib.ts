// CEL Standard Library Declarations
// Standard library declarations for the type checker
// Implemented based on checker/decls.go from cel-go

import { Operators } from "../common/ast";
import { FunctionDecl, FunctionOverloadDecl } from "./decls";
import {
  ListType,
  MapType,
  PrimitiveTypes,
  TypeParamType,
  PolymorphicTypeType,
} from "./types";

/**
 * Standard library declaration provider.
 * Provides all built-in CEL function declarations for type checking.
 */
export class StandardLibrary {
  static functions(): FunctionDecl[] {
    return [
      // Size functions
      this.sizeFunction(),
      // Type conversion functions
      this.intFunction(),
      this.uintFunction(),
      this.doubleFunction(),
      this.stringFunction(),
      this.boolFunction(),
      this.bytesFunction(),
      this.dynFunction(),
      this.typeFunction(),
      this.durationFunction(),
      this.timestampFunction(),
      // String methods
      this.containsFunction(),
      this.startsWithFunction(),
      this.endsWithFunction(),
      this.matchesFunction(),
      // Collection functions
      this.inFunction(),
      this.indexFunction(),
      // Comparison operators (built-in but declared for completeness)
      ...this.comparisonFunctions(),
      // Arithmetic operators
      ...this.arithmeticFunctions(),
      // Logical operators
      ...this.logicalFunctions(),
    ];
  }

  /**
   * size function - returns the size of strings, bytes, lists, and maps
   */
  private static sizeFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("size");

    // size(string) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("size_string", [PrimitiveTypes.String], PrimitiveTypes.Int));

    // size(bytes) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("size_bytes", [PrimitiveTypes.Bytes], PrimitiveTypes.Int));

    // size(list) -> int
    funcDecl.addOverload(
      new FunctionOverloadDecl("size_list", [new ListType(new TypeParamType("T"))], PrimitiveTypes.Int, ["T"])
    );

    // size(map) -> int
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "size_map",
        [new MapType(new TypeParamType("K"), new TypeParamType("V"))],
        PrimitiveTypes.Int,
        ["K", "V"]
      )
    );

    // string.size() -> int (receiver style)
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "string_size",
        [PrimitiveTypes.String],
        PrimitiveTypes.Int,
        [],
        true // member function
      )
    );

    // bytes.size() -> int (receiver style)
    funcDecl.addOverload(new FunctionOverloadDecl("bytes_size", [PrimitiveTypes.Bytes], PrimitiveTypes.Int, [], true));

    // list.size() -> int (receiver style)
    funcDecl.addOverload(
      new FunctionOverloadDecl("list_size", [new ListType(new TypeParamType("T"))], PrimitiveTypes.Int, ["T"], true)
    );

    // map.size() -> int (receiver style)
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "map_size",
        [new MapType(new TypeParamType("K"), new TypeParamType("V"))],
        PrimitiveTypes.Int,
        ["K", "V"],
        true
      )
    );

    return funcDecl;
  }

  /**
   * int() type conversion function
   */
  private static intFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("int");

    // int(int) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_int", [PrimitiveTypes.Int], PrimitiveTypes.Int));
    // int(uint) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_uint", [PrimitiveTypes.Uint], PrimitiveTypes.Int));
    // int(double) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_double", [PrimitiveTypes.Double], PrimitiveTypes.Int));
    // int(string) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_string", [PrimitiveTypes.String], PrimitiveTypes.Int));
    // int(timestamp) -> int (seconds since epoch)
    funcDecl.addOverload(new FunctionOverloadDecl("int_timestamp", [PrimitiveTypes.Timestamp], PrimitiveTypes.Int));

    return funcDecl;
  }

  /**
   * uint() type conversion function
   */
  private static uintFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("uint");

    // uint(int) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_int", [PrimitiveTypes.Int], PrimitiveTypes.Uint));
    // uint(uint) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_uint", [PrimitiveTypes.Uint], PrimitiveTypes.Uint));
    // uint(double) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_double", [PrimitiveTypes.Double], PrimitiveTypes.Uint));
    // uint(string) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_string", [PrimitiveTypes.String], PrimitiveTypes.Uint));

    return funcDecl;
  }

  /**
   * double() type conversion function
   */
  private static doubleFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("double");

    // double(int) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_int", [PrimitiveTypes.Int], PrimitiveTypes.Double));
    // double(uint) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_uint", [PrimitiveTypes.Uint], PrimitiveTypes.Double));
    // double(double) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_double", [PrimitiveTypes.Double], PrimitiveTypes.Double));
    // double(string) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_string", [PrimitiveTypes.String], PrimitiveTypes.Double));

    return funcDecl;
  }

  /**
   * string() type conversion function
   */
  private static stringFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("string");

    // string(int) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_int", [PrimitiveTypes.Int], PrimitiveTypes.String));
    // string(uint) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_uint", [PrimitiveTypes.Uint], PrimitiveTypes.String));
    // string(double) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_double", [PrimitiveTypes.Double], PrimitiveTypes.String));
    // string(string) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_string", [PrimitiveTypes.String], PrimitiveTypes.String));
    // string(bytes) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_bytes", [PrimitiveTypes.Bytes], PrimitiveTypes.String));
    // string(timestamp) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_timestamp", [PrimitiveTypes.Timestamp], PrimitiveTypes.String));
    // string(duration) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_duration", [PrimitiveTypes.Duration], PrimitiveTypes.String));

    return funcDecl;
  }

  /**
   * bool() type conversion function
   */
  private static boolFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("bool");

    // bool(bool) -> bool
    funcDecl.addOverload(new FunctionOverloadDecl("bool_bool", [PrimitiveTypes.Bool], PrimitiveTypes.Bool));
    // bool(string) -> bool
    funcDecl.addOverload(new FunctionOverloadDecl("bool_string", [PrimitiveTypes.String], PrimitiveTypes.Bool));

    return funcDecl;
  }

  /**
   * bytes() type conversion function
   */
  private static bytesFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("bytes");

    // bytes(string) -> bytes
    funcDecl.addOverload(new FunctionOverloadDecl("bytes_string", [PrimitiveTypes.String], PrimitiveTypes.Bytes));
    // bytes(bytes) -> bytes
    funcDecl.addOverload(new FunctionOverloadDecl("bytes_bytes", [PrimitiveTypes.Bytes], PrimitiveTypes.Bytes));

    return funcDecl;
  }

  /**
   * dyn() type conversion function
   */
  private static dynFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("dyn");

    // dyn(dyn) -> dyn
    funcDecl.addOverload(new FunctionOverloadDecl("dyn_dyn", [PrimitiveTypes.Dyn], PrimitiveTypes.Dyn));

    return funcDecl;
  }

  /**
   * type() function - returns the type of a value
   */
  private static typeFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("type");

    // type(dyn) -> type
    funcDecl.addOverload(new FunctionOverloadDecl("type_dyn", [PrimitiveTypes.Dyn], new PolymorphicTypeType(PrimitiveTypes.Dyn), []));

    return funcDecl;
  }

  /**
   * duration() function - creates duration from string
   */
  private static durationFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("duration");

    // duration(string) -> duration
    funcDecl.addOverload(new FunctionOverloadDecl("duration_string", [PrimitiveTypes.String], PrimitiveTypes.Duration));
    // duration(duration) -> duration
    funcDecl.addOverload(new FunctionOverloadDecl("duration_duration", [PrimitiveTypes.Duration], PrimitiveTypes.Duration));

    return funcDecl;
  }

  /**
   * timestamp() function - creates timestamp from string or int
   */
  private static timestampFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("timestamp");

    // timestamp(string) -> timestamp
    funcDecl.addOverload(new FunctionOverloadDecl("timestamp_string", [PrimitiveTypes.String], PrimitiveTypes.Timestamp));
    // timestamp(int) -> timestamp (seconds since epoch)
    funcDecl.addOverload(new FunctionOverloadDecl("timestamp_int", [PrimitiveTypes.Int], PrimitiveTypes.Timestamp));
    // timestamp(timestamp) -> timestamp
    funcDecl.addOverload(new FunctionOverloadDecl("timestamp_timestamp", [PrimitiveTypes.Timestamp], PrimitiveTypes.Timestamp));

    return funcDecl;
  }

  /**
   * contains() string method
   */
  private static containsFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("contains");

    // string.contains(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "contains_string",
        [PrimitiveTypes.String, PrimitiveTypes.String],
        PrimitiveTypes.Bool,
        [],
        true // member function
      )
    );

    return funcDecl;
  }

  /**
   * startsWith() string method
   */
  private static startsWithFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("startsWith");

    // string.startsWith(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl("startsWith_string", [PrimitiveTypes.String, PrimitiveTypes.String], PrimitiveTypes.Bool, [], true)
    );

    return funcDecl;
  }

  /**
   * endsWith() string method
   */
  private static endsWithFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("endsWith");

    // string.endsWith(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl("endsWith_string", [PrimitiveTypes.String, PrimitiveTypes.String], PrimitiveTypes.Bool, [], true)
    );

    return funcDecl;
  }

  /**
   * matches() string method for regex matching
   */
  private static matchesFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("matches");

    // string.matches(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl("matches_string", [PrimitiveTypes.String, PrimitiveTypes.String], PrimitiveTypes.Bool, [], true)
    );

    // matches(string, string) -> bool (global function style)
    funcDecl.addOverload(new FunctionOverloadDecl("matches_string_string", [PrimitiveTypes.String, PrimitiveTypes.String], PrimitiveTypes.Bool));

    return funcDecl;
  }

  /**
   * in operator function
   */
  private static inFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl(Operators.In);

    // T in list<T> -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "in_list",
        [new TypeParamType("T"), new ListType(new TypeParamType("T"))],
        PrimitiveTypes.Bool,
        ["T"]
      )
    );

    // K in map<K, V> -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "in_map",
        [new TypeParamType("K"), new MapType(new TypeParamType("K"), new TypeParamType("V"))],
        PrimitiveTypes.Bool,
        ["K", "V"]
      )
    );

    return funcDecl;
  }

  /**
   * Index access operator (`_[_]`) providing list and map indexing.
   */
  private static indexFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl(Operators.Index);

    // list<T>[int] -> T
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "index_list",
        [new ListType(new TypeParamType("T")), PrimitiveTypes.Int],
        new TypeParamType("T"),
        ["T"]
      )
    );

    // map<K, V>[K] -> V
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "index_map",
        [new MapType(new TypeParamType("K"), new TypeParamType("V")), new TypeParamType("K")],
        new TypeParamType("V"),
        ["K", "V"]
      )
    );

    return funcDecl;
  }

  /**
   * Comparison operator functions
   */
  private static comparisonFunctions(): FunctionDecl[] {
    const operators = [
      { name: Operators.Equals, id: "equals" },
      { name: Operators.NotEquals, id: "not_equals" },
      { name: Operators.Less, id: "less" },
      { name: Operators.LessEquals, id: "less_equals" },
      { name: Operators.Greater, id: "greater" },
      { name: Operators.GreaterEquals, id: "greater_equals" },
    ];

    const types = [
      PrimitiveTypes.Int,
      PrimitiveTypes.Uint,
      PrimitiveTypes.Double,
      PrimitiveTypes.String,
      PrimitiveTypes.Bool,
      PrimitiveTypes.Bytes,
      PrimitiveTypes.Timestamp,
      PrimitiveTypes.Duration,
    ];

    return operators.map((op) => {
      const funcDecl = new FunctionDecl(op.name);

      // Comparison between same types
      for (const t of types) {
        const typeName = t.toString().toLowerCase();
        funcDecl.addOverload(new FunctionOverloadDecl(`${op.id}_${typeName}`, [t, t], PrimitiveTypes.Bool));
      }

      // Comparison of Dyn type (for dynamic typing)
      funcDecl.addOverload(new FunctionOverloadDecl(`${op.id}_dyn`, [PrimitiveTypes.Dyn, PrimitiveTypes.Dyn], PrimitiveTypes.Bool));

      return funcDecl;
    });
  }

  /**
   * Arithmetic operator functions
   */
  private static arithmeticFunctions(): FunctionDecl[] {
    const operators = [
      { name: Operators.Add, id: "add" },
      { name: Operators.Subtract, id: "subtract" },
      { name: Operators.Multiply, id: "multiply" },
      { name: Operators.Divide, id: "divide" },
      { name: Operators.Modulo, id: "modulo" },
    ];

    const numericTypes = [PrimitiveTypes.Int, PrimitiveTypes.Uint, PrimitiveTypes.Double];

    const funcDecls: FunctionDecl[] = [];

    for (const op of operators) {
      const funcDecl = new FunctionDecl(op.name);

      // Numeric operations
      for (const t of numericTypes) {
        const typeName = t.toString().toLowerCase();
        funcDecl.addOverload(new FunctionOverloadDecl(`${op.id}_${typeName}`, [t, t], t));
      }

      // String concatenation (+)
      if (op.name === Operators.Add) {
        funcDecl.addOverload(new FunctionOverloadDecl("add_string", [PrimitiveTypes.String, PrimitiveTypes.String], PrimitiveTypes.String));

        // Bytes concatenation
        funcDecl.addOverload(new FunctionOverloadDecl("add_bytes", [PrimitiveTypes.Bytes, PrimitiveTypes.Bytes], PrimitiveTypes.Bytes));

        // List concatenation
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "add_list",
            [new ListType(new TypeParamType("T")), new ListType(new TypeParamType("T"))],
            new ListType(new TypeParamType("T")),
            ["T"]
          )
        );

        // duration + duration
        funcDecl.addOverload(
          new FunctionOverloadDecl("add_duration_duration", [PrimitiveTypes.Duration, PrimitiveTypes.Duration], PrimitiveTypes.Duration)
        );

        // timestamp + duration
        funcDecl.addOverload(
          new FunctionOverloadDecl("add_timestamp_duration", [PrimitiveTypes.Timestamp, PrimitiveTypes.Duration], PrimitiveTypes.Timestamp)
        );

        // duration + timestamp
        funcDecl.addOverload(
          new FunctionOverloadDecl("add_duration_timestamp", [PrimitiveTypes.Duration, PrimitiveTypes.Timestamp], PrimitiveTypes.Timestamp)
        );
      }

      // duration - duration
      if (op.name === Operators.Subtract) {
        funcDecl.addOverload(
          new FunctionOverloadDecl("subtract_duration_duration", [PrimitiveTypes.Duration, PrimitiveTypes.Duration], PrimitiveTypes.Duration)
        );

        // timestamp - duration
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "subtract_timestamp_duration",
            [PrimitiveTypes.Timestamp, PrimitiveTypes.Duration],
            PrimitiveTypes.Timestamp
          )
        );

        // timestamp - timestamp
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "subtract_timestamp_timestamp",
            [PrimitiveTypes.Timestamp, PrimitiveTypes.Timestamp],
            PrimitiveTypes.Duration
          )
        );
      }

      funcDecls.push(funcDecl);
    }

    // Unary negation
    const negFunc = new FunctionDecl(Operators.Negate);
    for (const t of numericTypes) {
      const typeName = t.toString().toLowerCase();
      negFunc.addOverload(new FunctionOverloadDecl(`negate_${typeName}`, [t], t));
    }
    funcDecls.push(negFunc);

    return funcDecls;
  }

  /**
   * Logical operator functions
   */
  private static logicalFunctions(): FunctionDecl[] {
    const funcDecls: FunctionDecl[] = [];

    // Logical NOT
    const notFunc = new FunctionDecl(Operators.LogicalNot);
    notFunc.addOverload(new FunctionOverloadDecl("logical_not", [PrimitiveTypes.Bool], PrimitiveTypes.Bool));
    funcDecls.push(notFunc);

    // Logical AND (short-circuit)
    const andFunc = new FunctionDecl(Operators.LogicalAnd);
    andFunc.addOverload(new FunctionOverloadDecl("logical_and", [PrimitiveTypes.Bool, PrimitiveTypes.Bool], PrimitiveTypes.Bool));
    funcDecls.push(andFunc);

    // Logical OR (short-circuit)
    const orFunc = new FunctionDecl(Operators.LogicalOr);
    orFunc.addOverload(new FunctionOverloadDecl("logical_or", [PrimitiveTypes.Bool, PrimitiveTypes.Bool], PrimitiveTypes.Bool));
    funcDecls.push(orFunc);

    // Conditional (ternary)
    const condFunc = new FunctionDecl(Operators.Conditional);
    condFunc.addOverload(
      new FunctionOverloadDecl(
        "conditional",
        [PrimitiveTypes.Bool, new TypeParamType("T"), new TypeParamType("T")],
        new TypeParamType("T"),
        ["T"]
      )
    );
    funcDecls.push(condFunc);

    // @not_strictly_false - internal helper used in comprehension loop conditions.
    // Accepts a bool and only returns false for strict false (errors count as true).
    const notStrictlyFalseFunc = new FunctionDecl(Operators.NotStrictlyFalse);
    notStrictlyFalseFunc.addOverload(
      new FunctionOverloadDecl("not_strictly_false_bool", [PrimitiveTypes.Bool], PrimitiveTypes.Bool)
    );
    funcDecls.push(notStrictlyFalseFunc);

    return funcDecls;
  }
}

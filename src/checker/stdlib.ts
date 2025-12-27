// CEL Standard Library Declarations
// Standard library declarations for the type checker
// Implemented based on checker/decls.go from cel-go

import { Operators } from "../common/ast";
import { FunctionDecl, FunctionOverloadDecl } from "./decls";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  IntType,
  ListType,
  MapType,
  PolymorphicTypeType,
  StringType,
  TimestampType,
  TypeParamType,
  UintType,
} from "./types";

/**
 * Standard library declaration provider.
 * Provides all built-in CEL function declarations for type checking.
 */
class StandardLibraryImpl {
  functions(): FunctionDecl[] {
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
  private sizeFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("size");

    // size(string) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("size_string", [StringType], IntType));

    // size(bytes) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("size_bytes", [BytesType], IntType));

    // size(list) -> int
    funcDecl.addOverload(
      new FunctionOverloadDecl("size_list", [new ListType(new TypeParamType("T"))], IntType, ["T"])
    );

    // size(map) -> int
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "size_map",
        [new MapType(new TypeParamType("K"), new TypeParamType("V"))],
        IntType,
        ["K", "V"]
      )
    );

    // string.size() -> int (receiver style)
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "string_size",
        [StringType],
        IntType,
        [],
        true // member function
      )
    );

    // bytes.size() -> int (receiver style)
    funcDecl.addOverload(new FunctionOverloadDecl("bytes_size", [BytesType], IntType, [], true));

    // list.size() -> int (receiver style)
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "list_size",
        [new ListType(new TypeParamType("T"))],
        IntType,
        ["T"],
        true
      )
    );

    // map.size() -> int (receiver style)
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "map_size",
        [new MapType(new TypeParamType("K"), new TypeParamType("V"))],
        IntType,
        ["K", "V"],
        true
      )
    );

    return funcDecl;
  }

  /**
   * int() type conversion function
   */
  private intFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("int");

    // int(int) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_int", [IntType], IntType));
    // int(uint) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_uint", [UintType], IntType));
    // int(double) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_double", [DoubleType], IntType));
    // int(string) -> int
    funcDecl.addOverload(new FunctionOverloadDecl("int_string", [StringType], IntType));
    // int(timestamp) -> int (seconds since epoch)
    funcDecl.addOverload(new FunctionOverloadDecl("int_timestamp", [TimestampType], IntType));

    return funcDecl;
  }

  /**
   * uint() type conversion function
   */
  private uintFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("uint");

    // uint(int) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_int", [IntType], UintType));
    // uint(uint) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_uint", [UintType], UintType));
    // uint(double) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_double", [DoubleType], UintType));
    // uint(string) -> uint
    funcDecl.addOverload(new FunctionOverloadDecl("uint_string", [StringType], UintType));

    return funcDecl;
  }

  /**
   * double() type conversion function
   */
  private doubleFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("double");

    // double(int) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_int", [IntType], DoubleType));
    // double(uint) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_uint", [UintType], DoubleType));
    // double(double) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_double", [DoubleType], DoubleType));
    // double(string) -> double
    funcDecl.addOverload(new FunctionOverloadDecl("double_string", [StringType], DoubleType));

    return funcDecl;
  }

  /**
   * string() type conversion function
   */
  private stringFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("string");

    // string(int) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_int", [IntType], StringType));
    // string(uint) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_uint", [UintType], StringType));
    // string(double) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_double", [DoubleType], StringType));
    // string(string) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_string", [StringType], StringType));
    // string(bytes) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_bytes", [BytesType], StringType));
    // string(timestamp) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_timestamp", [TimestampType], StringType));
    // string(duration) -> string
    funcDecl.addOverload(new FunctionOverloadDecl("string_duration", [DurationType], StringType));

    return funcDecl;
  }

  /**
   * bool() type conversion function
   */
  private boolFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("bool");

    // bool(bool) -> bool
    funcDecl.addOverload(new FunctionOverloadDecl("bool_bool", [BoolType], BoolType));
    // bool(string) -> bool
    funcDecl.addOverload(new FunctionOverloadDecl("bool_string", [StringType], BoolType));

    return funcDecl;
  }

  /**
   * bytes() type conversion function
   */
  private bytesFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("bytes");

    // bytes(string) -> bytes
    funcDecl.addOverload(new FunctionOverloadDecl("bytes_string", [StringType], BytesType));
    // bytes(bytes) -> bytes
    funcDecl.addOverload(new FunctionOverloadDecl("bytes_bytes", [BytesType], BytesType));

    return funcDecl;
  }

  /**
   * dyn() type conversion function
   */
  private dynFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("dyn");

    // dyn(dyn) -> dyn
    funcDecl.addOverload(new FunctionOverloadDecl("dyn_dyn", [DynType], DynType));

    return funcDecl;
  }

  /**
   * type() function - returns the type of a value
   */
  private typeFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("type");

    // type(dyn) -> type
    funcDecl.addOverload(
      new FunctionOverloadDecl("type_dyn", [DynType], new PolymorphicTypeType(DynType), [])
    );

    return funcDecl;
  }

  /**
   * duration() function - creates duration from string
   */
  private durationFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("duration");

    // duration(string) -> duration
    funcDecl.addOverload(new FunctionOverloadDecl("duration_string", [StringType], DurationType));
    // duration(duration) -> duration
    funcDecl.addOverload(
      new FunctionOverloadDecl("duration_duration", [DurationType], DurationType)
    );

    return funcDecl;
  }

  /**
   * timestamp() function - creates timestamp from string or int
   */
  private timestampFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("timestamp");

    // timestamp(string) -> timestamp
    funcDecl.addOverload(new FunctionOverloadDecl("timestamp_string", [StringType], TimestampType));
    // timestamp(int) -> timestamp (seconds since epoch)
    funcDecl.addOverload(new FunctionOverloadDecl("timestamp_int", [IntType], TimestampType));
    // timestamp(timestamp) -> timestamp
    funcDecl.addOverload(
      new FunctionOverloadDecl("timestamp_timestamp", [TimestampType], TimestampType)
    );

    return funcDecl;
  }

  /**
   * contains() string method
   */
  private containsFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("contains");

    // string.contains(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "contains_string",
        [StringType, StringType],
        BoolType,
        [],
        true // member function
      )
    );

    return funcDecl;
  }

  /**
   * startsWith() string method
   */
  private startsWithFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("startsWith");

    // string.startsWith(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl("startsWith_string", [StringType, StringType], BoolType, [], true)
    );

    return funcDecl;
  }

  /**
   * endsWith() string method
   */
  private endsWithFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("endsWith");

    // string.endsWith(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl("endsWith_string", [StringType, StringType], BoolType, [], true)
    );

    return funcDecl;
  }

  /**
   * matches() string method for regex matching
   */
  private matchesFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl("matches");

    // string.matches(string) -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl("matches_string", [StringType, StringType], BoolType, [], true)
    );

    // matches(string, string) -> bool (global function style)
    funcDecl.addOverload(
      new FunctionOverloadDecl("matches_string_string", [StringType, StringType], BoolType)
    );

    return funcDecl;
  }

  /**
   * in operator function
   */
  private inFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl(Operators.In);

    // T in list<T> -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "in_list",
        [new TypeParamType("T"), new ListType(new TypeParamType("T"))],
        BoolType,
        ["T"]
      )
    );

    // K in map<K, V> -> bool
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "in_map",
        [new TypeParamType("K"), new MapType(new TypeParamType("K"), new TypeParamType("V"))],
        BoolType,
        ["K", "V"]
      )
    );

    return funcDecl;
  }

  /**
   * Index access operator (`_[_]`) providing list and map indexing.
   */
  private indexFunction(): FunctionDecl {
    const funcDecl = new FunctionDecl(Operators.Index);

    // list<T>[int] -> T
    funcDecl.addOverload(
      new FunctionOverloadDecl(
        "index_list",
        [new ListType(new TypeParamType("T")), IntType],
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
  private comparisonFunctions(): FunctionDecl[] {
    const operators = [
      { name: Operators.Equals, id: "equals" },
      { name: Operators.NotEquals, id: "not_equals" },
      { name: Operators.Less, id: "less" },
      { name: Operators.LessEquals, id: "less_equals" },
      { name: Operators.Greater, id: "greater" },
      { name: Operators.GreaterEquals, id: "greater_equals" },
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
      const funcDecl = new FunctionDecl(op.name);

      // Comparison between same types
      for (const typeItem of types) {
        const typeName = typeItem.toString().toLowerCase();
        funcDecl.addOverload(
          new FunctionOverloadDecl(`${op.id}_${typeName}`, [typeItem, typeItem], BoolType)
        );
      }

      // Comparison of Dyn type (for dynamic typing)
      funcDecl.addOverload(new FunctionOverloadDecl(`${op.id}_dyn`, [DynType, DynType], BoolType));

      return funcDecl;
    });
  }

  /**
   * Arithmetic operator functions
   */
  private arithmeticFunctions(): FunctionDecl[] {
    const operators = [
      { name: Operators.Add, id: "add" },
      { name: Operators.Subtract, id: "subtract" },
      { name: Operators.Multiply, id: "multiply" },
      { name: Operators.Divide, id: "divide" },
      { name: Operators.Modulo, id: "modulo" },
    ];

    const numericTypes = [IntType, UintType, DoubleType];

    const funcDecls: FunctionDecl[] = [];

    for (const op of operators) {
      const funcDecl = new FunctionDecl(op.name);

      // Numeric operations
      for (const typeItem of numericTypes) {
        const typeName = typeItem.toString().toLowerCase();
        funcDecl.addOverload(
          new FunctionOverloadDecl(`${op.id}_${typeName}`, [typeItem, typeItem], typeItem)
        );
      }

      // String concatenation (+)
      if (op.name === Operators.Add) {
        funcDecl.addOverload(
          new FunctionOverloadDecl("add_string", [StringType, StringType], StringType)
        );

        // Bytes concatenation
        funcDecl.addOverload(
          new FunctionOverloadDecl("add_bytes", [BytesType, BytesType], BytesType)
        );

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
          new FunctionOverloadDecl(
            "add_duration_duration",
            [DurationType, DurationType],
            DurationType
          )
        );

        // timestamp + duration
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "add_timestamp_duration",
            [TimestampType, DurationType],
            TimestampType
          )
        );

        // duration + timestamp
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "add_duration_timestamp",
            [DurationType, TimestampType],
            TimestampType
          )
        );
      }

      // duration - duration
      if (op.name === Operators.Subtract) {
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "subtract_duration_duration",
            [DurationType, DurationType],
            DurationType
          )
        );

        // timestamp - duration
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "subtract_timestamp_duration",
            [TimestampType, DurationType],
            TimestampType
          )
        );

        // timestamp - timestamp
        funcDecl.addOverload(
          new FunctionOverloadDecl(
            "subtract_timestamp_timestamp",
            [TimestampType, TimestampType],
            DurationType
          )
        );
      }

      funcDecls.push(funcDecl);
    }

    // Unary negation
    const negFunc = new FunctionDecl(Operators.Negate);
    for (const typeItem of numericTypes) {
      const typeName = typeItem.toString().toLowerCase();
      negFunc.addOverload(new FunctionOverloadDecl(`negate_${typeName}`, [typeItem], typeItem));
    }
    funcDecls.push(negFunc);

    return funcDecls;
  }

  /**
   * Logical operator functions
   */
  private logicalFunctions(): FunctionDecl[] {
    const funcDecls: FunctionDecl[] = [];

    // Logical NOT
    const notFunc = new FunctionDecl(Operators.LogicalNot);
    notFunc.addOverload(new FunctionOverloadDecl("logical_not", [BoolType], BoolType));
    funcDecls.push(notFunc);

    // Logical AND (short-circuit)
    const andFunc = new FunctionDecl(Operators.LogicalAnd);
    andFunc.addOverload(new FunctionOverloadDecl("logical_and", [BoolType, BoolType], BoolType));
    funcDecls.push(andFunc);

    // Logical OR (short-circuit)
    const orFunc = new FunctionDecl(Operators.LogicalOr);
    orFunc.addOverload(new FunctionOverloadDecl("logical_or", [BoolType, BoolType], BoolType));
    funcDecls.push(orFunc);

    // Conditional (ternary)
    const condFunc = new FunctionDecl(Operators.Conditional);
    condFunc.addOverload(
      new FunctionOverloadDecl(
        "conditional",
        [BoolType, new TypeParamType("T"), new TypeParamType("T")],
        new TypeParamType("T"),
        ["T"]
      )
    );
    funcDecls.push(condFunc);

    // @not_strictly_false - internal helper used in comprehension loop conditions.
    // Accepts a bool and only returns false for strict false (errors count as true).
    const notStrictlyFalseFunc = new FunctionDecl(Operators.NotStrictlyFalse);
    notStrictlyFalseFunc.addOverload(
      new FunctionOverloadDecl("not_strictly_false_bool", [BoolType], BoolType)
    );
    funcDecls.push(notStrictlyFalseFunc);

    return funcDecls;
  }
}

/**
 * Shared instance for the standard CEL function declarations.
 */
export const StandardLibrary = new StandardLibraryImpl();

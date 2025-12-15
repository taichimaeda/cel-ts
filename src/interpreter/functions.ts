// CEL Standard Functions
// Standard function library
// Implementation based on cel-go's cel/library.go and checker/standard.go

import {
  BinaryDispatcherOverload,
  type Dispatcher,
  UnaryDispatcherOverload,
  VariadicDispatcherOverload,
} from "./dispatcher";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  ErrorValue,
  IntValue,
  ListValue,
  MapValue,
  StringValue,
  TimestampValue,
  UintValue,
  type Value,
  isError,
  toTypeValue,
} from "./values";

/**
 * Register all standard CEL functions.
 */
export function registerStandardFunctions(dispatcher: Dispatcher): void {
  registerSizeFunctions(dispatcher);
  registerStringFunctions(dispatcher);
  registerTypeConversions(dispatcher);
  registerComparisonFunctions(dispatcher);
  registerArithmeticFunctions(dispatcher);
  registerLogicalFunctions(dispatcher);
  registerListFunctions(dispatcher);
  registerMapFunctions(dispatcher);
  registerTimeFunctions(dispatcher);
  registerMiscFunctions(dispatcher);
}

/**
 * Register size functions.
 */
function registerSizeFunctions(dispatcher: Dispatcher): void {
  // size(string) -> int
  dispatcher.add(
    new UnaryDispatcherOverload("size_string", (val: Value): Value => {
      if (val instanceof StringValue) {
        return val.size();
      }
      return ErrorValue.typeMismatch("string", val);
    })
  );

  // size(bytes) -> int
  dispatcher.add(
    new UnaryDispatcherOverload("size_bytes", (val: Value): Value => {
      if (val instanceof BytesValue) {
        return val.size();
      }
      return ErrorValue.typeMismatch("bytes", val);
    })
  );

  // size(list) -> int
  dispatcher.add(
    new UnaryDispatcherOverload("size_list", (val: Value): Value => {
      if (val instanceof ListValue) {
        return val.size();
      }
      return ErrorValue.typeMismatch("list", val);
    })
  );

  // size(map) -> int
  dispatcher.add(
    new UnaryDispatcherOverload("size_map", (val: Value): Value => {
      if (val instanceof MapValue) {
        return val.size();
      }
      return ErrorValue.typeMismatch("map", val);
    })
  );
}

/**
 * Register string functions.
 */
function registerStringFunctions(dispatcher: Dispatcher): void {
  // string.contains(string) -> bool
  dispatcher.add(
    new BinaryDispatcherOverload("contains_string", (lhs: Value, rhs: Value): Value => {
      if (lhs instanceof StringValue && rhs instanceof StringValue) {
        return lhs.contains(rhs);
      }
      return ErrorValue.typeMismatch("string", lhs);
    })
  );

  // string.startsWith(string) -> bool
  dispatcher.add(
    new BinaryDispatcherOverload("startsWith_string", (lhs: Value, rhs: Value): Value => {
      if (lhs instanceof StringValue && rhs instanceof StringValue) {
        return lhs.startsWith(rhs);
      }
      return ErrorValue.typeMismatch("string", lhs);
    })
  );

  // string.endsWith(string) -> bool
  dispatcher.add(
    new BinaryDispatcherOverload("endsWith_string", (lhs: Value, rhs: Value): Value => {
      if (lhs instanceof StringValue && rhs instanceof StringValue) {
        return lhs.endsWith(rhs);
      }
      return ErrorValue.typeMismatch("string", lhs);
    })
  );

  // string.matches(string) -> bool
  dispatcher.add(
    new BinaryDispatcherOverload("matches_string", (lhs: Value, rhs: Value): Value => {
      if (lhs instanceof StringValue && rhs instanceof StringValue) {
        return lhs.matches(rhs);
      }
      return ErrorValue.typeMismatch("string", lhs);
    })
  );

  // matches(string, string) -> bool (global function)
  dispatcher.add(
    new BinaryDispatcherOverload("matches", (lhs: Value, rhs: Value): Value => {
      if (lhs instanceof StringValue && rhs instanceof StringValue) {
        return lhs.matches(rhs);
      }
      return ErrorValue.typeMismatch("string", lhs);
    })
  );

  // string.toLowerCase() -> string
  dispatcher.add(
    new UnaryDispatcherOverload("lowerAscii_string", (val: Value): Value => {
      if (val instanceof StringValue) {
        return StringValue.of(val.value().toLowerCase());
      }
      return ErrorValue.typeMismatch("string", val);
    })
  );

  // string.toUpperCase() -> string
  dispatcher.add(
    new UnaryDispatcherOverload("upperAscii_string", (val: Value): Value => {
      if (val instanceof StringValue) {
        return StringValue.of(val.value().toUpperCase());
      }
      return ErrorValue.typeMismatch("string", val);
    })
  );

  // string.trim() -> string
  dispatcher.add(
    new UnaryDispatcherOverload("trim_string", (val: Value): Value => {
      if (val instanceof StringValue) {
        return StringValue.of(val.value().trim());
      }
      return ErrorValue.typeMismatch("string", val);
    })
  );

  // string.split(string) -> list(string)
  dispatcher.add(
    new BinaryDispatcherOverload("split_string", (lhs: Value, rhs: Value): Value => {
      if (lhs instanceof StringValue && rhs instanceof StringValue) {
        const parts = lhs.value().split(rhs.value());
        return ListValue.of(parts.map((p) => StringValue.of(p)));
      }
      return ErrorValue.typeMismatch("string", lhs);
    })
  );

  // string.join(list) -> string
  dispatcher.add(
    new BinaryDispatcherOverload("join_string", (lhs: Value, rhs: Value): Value => {
      if (lhs instanceof ListValue && rhs instanceof StringValue) {
        const parts: string[] = [];
        for (const elem of lhs) {
          if (elem instanceof StringValue) {
            parts.push(elem.value());
          } else {
            return ErrorValue.typeMismatch("string", elem);
          }
        }
        return StringValue.of(parts.join(rhs.value()));
      }
      return ErrorValue.typeMismatch("list", lhs);
    })
  );

  // string.replace(string, string) -> string
  dispatcher.add(
    new VariadicDispatcherOverload("replace_string", (args: Value[]): Value => {
      if (args.length !== 3) {
        return ErrorValue.create("replace requires 3 arguments");
      }
      const [str, from, to] = args;
      if (str instanceof StringValue && from instanceof StringValue && to instanceof StringValue) {
        return StringValue.of(str.value().replaceAll(from.value(), to.value()));
      }
      return ErrorValue.typeMismatch("string", str!);
    })
  );
}

/**
 * Register type conversion functions.
 */
function registerTypeConversions(dispatcher: Dispatcher): void {
  // int(value) -> int
  dispatcher.add(
    new UnaryDispatcherOverload("int", (val: Value): Value => {
      if (val instanceof IntValue) {
        return val;
      }
      if (val instanceof UintValue) {
        return IntValue.of(val.value());
      }
      if (val instanceof DoubleValue) {
        const d = val.value();
        if (!Number.isFinite(d)) {
          return ErrorValue.create("cannot convert infinity or NaN to int");
        }
        return IntValue.of(Math.trunc(d));
      }
      if (val instanceof StringValue) {
        try {
          const n = BigInt(val.value());
          return IntValue.of(n);
        } catch {
          return ErrorValue.create(`cannot parse '${val.value()}' as int`);
        }
      }
      if (val instanceof TimestampValue) {
        return IntValue.of(val.value() / 1_000_000_000n);
      }
      return ErrorValue.create(`cannot convert ${val.type()} to int`);
    })
  );

  // uint(value) -> uint
  dispatcher.add(
    new UnaryDispatcherOverload("uint", (val: Value): Value => {
      if (val instanceof UintValue) {
        return val;
      }
      if (val instanceof IntValue) {
        const n = val.value();
        if (n < 0n) {
          return ErrorValue.create("cannot convert negative int to uint");
        }
        return UintValue.of(n);
      }
      if (val instanceof DoubleValue) {
        const d = val.value();
        if (!Number.isFinite(d) || d < 0) {
          return ErrorValue.create("cannot convert to uint");
        }
        return UintValue.of(Math.trunc(d));
      }
      if (val instanceof StringValue) {
        try {
          const n = BigInt(val.value());
          if (n < 0n) {
            return ErrorValue.create("cannot convert negative string to uint");
          }
          return UintValue.of(n);
        } catch {
          return ErrorValue.create(`cannot parse '${val.value()}' as uint`);
        }
      }
      return ErrorValue.create(`cannot convert ${val.type()} to uint`);
    })
  );

  // double(value) -> double
  dispatcher.add(
    new UnaryDispatcherOverload("double", (val: Value): Value => {
      if (val instanceof DoubleValue) {
        return val;
      }
      if (val instanceof IntValue) {
        return DoubleValue.of(Number(val.value()));
      }
      if (val instanceof UintValue) {
        return DoubleValue.of(Number(val.value()));
      }
      if (val instanceof StringValue) {
        const d = Number.parseFloat(val.value());
        if (Number.isNaN(d) && val.value() !== "NaN") {
          return ErrorValue.create(`cannot parse '${val.value()}' as double`);
        }
        return DoubleValue.of(d);
      }
      return ErrorValue.create(`cannot convert ${val.type()} to double`);
    })
  );

  // string(value) -> string
  dispatcher.add(
    new UnaryDispatcherOverload("string", (val: Value): Value => {
      if (val instanceof StringValue) {
        return val;
      }
      if (val instanceof IntValue || val instanceof UintValue) {
        return StringValue.of(val.value().toString());
      }
      if (val instanceof DoubleValue) {
        return StringValue.of(val.value().toString());
      }
      if (val instanceof BoolValue) {
        return StringValue.of(val.value() ? "true" : "false");
      }
      if (val instanceof BytesValue) {
        const decoder = new TextDecoder();
        try {
          return StringValue.of(decoder.decode(val.value()));
        } catch {
          return ErrorValue.create("invalid UTF-8 in bytes");
        }
      }
      if (val instanceof TimestampValue) {
        return StringValue.of(val.toString());
      }
      if (val instanceof DurationValue) {
        return StringValue.of(val.toString());
      }
      return ErrorValue.create(`cannot convert ${val.type()} to string`);
    })
  );

  // bytes(value) -> bytes
  dispatcher.add(
    new UnaryDispatcherOverload("bytes", (val: Value): Value => {
      if (val instanceof BytesValue) {
        return val;
      }
      if (val instanceof StringValue) {
        return BytesValue.fromString(val.value());
      }
      return ErrorValue.create(`cannot convert ${val.type()} to bytes`);
    })
  );

  // bool(value) -> bool
  dispatcher.add(
    new UnaryDispatcherOverload("bool", (val: Value): Value => {
      if (val instanceof BoolValue) {
        return val;
      }
      if (val instanceof StringValue) {
        const s = val.value().toLowerCase();
        if (s === "true") {
          return BoolValue.True;
        }
        if (s === "false") {
          return BoolValue.False;
        }
        return ErrorValue.create(`cannot parse '${val.value()}' as bool`);
      }
      return ErrorValue.create(`cannot convert ${val.type()} to bool`);
    })
  );

  // type(value) -> type
  dispatcher.add(
    new UnaryDispatcherOverload("type", (val: Value): Value => {
      return toTypeValue(val.type());
    })
  );

  // dyn(value) -> dyn
  dispatcher.add(
    new UnaryDispatcherOverload("dyn", (val: Value): Value => {
      return val;
    })
  );
}

/**
 * Register comparison functions.
 */
function registerComparisonFunctions(_dispatcher: Dispatcher): void {
  // No additional comparison functions needed - handled by BinaryValue
}

/**
 * Register arithmetic functions.
 */
function registerArithmeticFunctions(_dispatcher: Dispatcher): void {
  // No additional arithmetic functions needed - handled by BinaryValue
}

/**
 * Register logical functions.
 */
function registerLogicalFunctions(_dispatcher: Dispatcher): void {
  // No additional logical functions needed - handled by AndValue/OrValue/NotValue
}

/**
 * Register list functions.
 */
function registerListFunctions(_dispatcher: Dispatcher): void {
  // list.all(predicate) is handled by comprehensions
  // list.exists(predicate) is handled by comprehensions
  // list.exists_one(predicate) is handled by comprehensions
  // list.filter(predicate) is handled by comprehensions
  // list.map(expr) is handled by comprehensions
  // list + list is handled by BinaryValue
}

/**
 * Register map functions.
 */
function registerMapFunctions(_dispatcher: Dispatcher): void {
  // has(map.key) - existence test - handled specially during planning
  // map.all(predicate) is handled by comprehensions
  // map.exists(predicate) is handled by comprehensions
  // map.filter(predicate) is handled by comprehensions
  // map.map(expr) is handled by comprehensions
}

/**
 * Register time-related functions.
 */
function registerTimeFunctions(dispatcher: Dispatcher): void {
  // timestamp(string) -> timestamp
  dispatcher.add(
    new UnaryDispatcherOverload("timestamp_string", (val: Value): Value => {
      if (val instanceof StringValue) {
        const date = new Date(val.value());
        if (isNaN(date.getTime())) {
          return ErrorValue.create(`cannot parse '${val.value()}' as timestamp`);
        }
        return TimestampValue.fromDate(date);
      }
      return ErrorValue.typeMismatch("string", val);
    })
  );

  // timestamp(int) -> timestamp (seconds since epoch)
  dispatcher.add(
    new UnaryDispatcherOverload("timestamp_int", (val: Value): Value => {
      if (val instanceof IntValue) {
        return TimestampValue.fromSeconds(Number(val.value()));
      }
      return ErrorValue.typeMismatch("int", val);
    })
  );

  // duration(string) -> duration
  dispatcher.add(
    new UnaryDispatcherOverload("duration_string", (val: Value): Value => {
      if (val instanceof StringValue) {
        const parsed = parseDuration(val.value());
        if (isError(parsed)) {
          return parsed;
        }
        return parsed;
      }
      return ErrorValue.typeMismatch("string", val);
    })
  );

  // timestamp.getFullYear() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getFullYear", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getFullYear();
      }
      return ErrorValue.typeMismatch("timestamp", val);
    })
  );

  // timestamp.getMonth() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getMonth", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getMonth();
      }
      return ErrorValue.typeMismatch("timestamp", val);
    })
  );

  // timestamp.getDayOfMonth() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getDayOfMonth", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getDayOfMonth();
      }
      return ErrorValue.typeMismatch("timestamp", val);
    })
  );

  // timestamp.getDayOfWeek() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getDayOfWeek", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getDayOfWeek();
      }
      return ErrorValue.typeMismatch("timestamp", val);
    })
  );

  // timestamp.getHours() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getHours", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getHours();
      }
      if (val instanceof DurationValue) {
        return val.getHours();
      }
      return ErrorValue.typeMismatch("timestamp or duration", val);
    })
  );

  // timestamp.getMinutes() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getMinutes", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getMinutes();
      }
      if (val instanceof DurationValue) {
        return val.getMinutes();
      }
      return ErrorValue.typeMismatch("timestamp or duration", val);
    })
  );

  // timestamp.getSeconds() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getSeconds", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getSeconds();
      }
      if (val instanceof DurationValue) {
        return val.getSeconds();
      }
      return ErrorValue.typeMismatch("timestamp or duration", val);
    })
  );

  // timestamp.getMilliseconds() -> int
  dispatcher.add(
    new UnaryDispatcherOverload("getMilliseconds", (val: Value): Value => {
      if (val instanceof TimestampValue) {
        return val.getMilliseconds();
      }
      if (val instanceof DurationValue) {
        return val.getMilliseconds();
      }
      return ErrorValue.typeMismatch("timestamp or duration", val);
    })
  );
}

/**
 * Register miscellaneous functions.
 */
function registerMiscFunctions(_dispatcher: Dispatcher): void {
  // has(field) - field presence test
  // Note: This is typically handled during planning, not as a runtime function
  // Conditional ternary is handled by ConditionalValue
}

/**
 * Parse a duration string.
 */
function parseDuration(s: string): DurationValue | ErrorValue {
  // Parse durations like "1h30m", "5s", "100ms", "1.5s"
  let totalNanos = 0n;
  let remaining = s.trim();

  if (remaining === "") {
    return ErrorValue.create("empty duration string");
  }

  // Check for negative sign
  let negative = false;
  if (remaining.startsWith("-")) {
    negative = true;
    remaining = remaining.substring(1);
  }

  const regex = /^(\d+\.?\d*)(h|m|s|ms|us|µs|ns)/;
  let match: RegExpMatchArray | null;

  while (remaining.length > 0 && (match = regex.exec(remaining))) {
    const valueStr = match[1]!;
    const unit = match[2]!;
    const value = Number.parseFloat(valueStr);

    if (Number.isNaN(value)) {
      return ErrorValue.create(`invalid duration value: ${valueStr}`);
    }

    let nanos: bigint;
    switch (unit) {
      case "h":
        nanos = BigInt(Math.trunc(value * 3_600_000_000_000));
        break;
      case "m":
        nanos = BigInt(Math.trunc(value * 60_000_000_000));
        break;
      case "s":
        nanos = BigInt(Math.trunc(value * 1_000_000_000));
        break;
      case "ms":
        nanos = BigInt(Math.trunc(value * 1_000_000));
        break;
      case "us":
      case "µs":
        nanos = BigInt(Math.trunc(value * 1_000));
        break;
      case "ns":
        nanos = BigInt(Math.trunc(value));
        break;
      default:
        return ErrorValue.create(`unknown duration unit: ${unit}`);
    }

    totalNanos += nanos;
    remaining = remaining.substring(match[0].length);
  }

  if (remaining.length > 0) {
    return ErrorValue.create(`invalid duration: ${s}`);
  }

  if (negative) {
    totalNanos = -totalNanos;
  }

  return DurationValue.of(totalNanos);
}

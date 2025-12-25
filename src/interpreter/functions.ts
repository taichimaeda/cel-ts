// CEL Standard Functions
// Standard function library
// Implementation based on cel-go's cel/library.go and checker/standard.go

import {
  BinaryDispatcherOverload,
  NaryDispatcherOverload,
  type Overload,
  UnaryDispatcherOverload,
} from "./dispatcher";
import { parseTimeZoneOffset } from "./utils";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  ErrorValue,
  isBoolValue,
  isBytesValue,
  isDoubleValue,
  isDurationValue,
  isIntValue,
  isListValue,
  isMapValue,
  isStringValue,
  isTimestampValue,
  isUintValue,
  IntLimits,
  IntValue,
  ListValue,
  StringValue,
  TimestampValue,
  UintValue,
  type Value,
  isErrorValue,
  toTypeValue,
} from "./values";

export const sizeFunctions: Overload[] = [
  // size(string) -> int
  new UnaryDispatcherOverload("size_string", (val: Value): Value => {
    if (isStringValue(val)) {
      return val.size();
    }
    return ErrorValue.typeMismatch("string", val);
  }),

  // size(bytes) -> int
  new UnaryDispatcherOverload("size_bytes", (val: Value): Value => {
    if (isBytesValue(val)) {
      return val.size();
    }
    return ErrorValue.typeMismatch("bytes", val);
  }),

  // size(list) -> int
  new UnaryDispatcherOverload("size_list", (val: Value): Value => {
    if (isListValue(val)) {
      return val.size();
    }
    return ErrorValue.typeMismatch("list", val);
  }),

  // size(map) -> int
  new UnaryDispatcherOverload("size_map", (val: Value): Value => {
    if (isMapValue(val)) {
      return val.size();
    }
    return ErrorValue.typeMismatch("map", val);
  }),
];

export const stringFunctions: Overload[] = [
  // string.contains(string) -> bool
  new BinaryDispatcherOverload("contains_string", (lhs: Value, rhs: Value): Value => {
    if (isStringValue(lhs) && isStringValue(rhs)) {
      return lhs.contains(rhs);
    }
    return ErrorValue.typeMismatch("string", lhs);
  }),

  // string.startsWith(string) -> bool
  new BinaryDispatcherOverload("startsWith_string", (lhs: Value, rhs: Value): Value => {
    if (isStringValue(lhs) && isStringValue(rhs)) {
      return lhs.startsWith(rhs);
    }
    return ErrorValue.typeMismatch("string", lhs);
  }),

  // string.endsWith(string) -> bool
  new BinaryDispatcherOverload("endsWith_string", (lhs: Value, rhs: Value): Value => {
    if (isStringValue(lhs) && isStringValue(rhs)) {
      return lhs.endsWith(rhs);
    }
    return ErrorValue.typeMismatch("string", lhs);
  }),

  // string.matches(string) -> bool
  new BinaryDispatcherOverload("matches_string", (lhs: Value, rhs: Value): Value => {
    if (isStringValue(lhs) && isStringValue(rhs)) {
      return lhs.matches(rhs);
    }
    return ErrorValue.typeMismatch("string", lhs);
  }),

  // matches(string, string) -> bool (global function)
  new BinaryDispatcherOverload("matches", (lhs: Value, rhs: Value): Value => {
    if (isStringValue(lhs) && isStringValue(rhs)) {
      return lhs.matches(rhs);
    }
    return ErrorValue.typeMismatch("string", lhs);
  }),

  // string.toLowerCase() -> string
  new UnaryDispatcherOverload("lowerAscii_string", (val: Value): Value => {
    if (isStringValue(val)) {
      return StringValue.of(val.value().toLowerCase());
    }
    return ErrorValue.typeMismatch("string", val);
  }),

  // string.toUpperCase() -> string
  new UnaryDispatcherOverload("upperAscii_string", (val: Value): Value => {
    if (isStringValue(val)) {
      return StringValue.of(val.value().toUpperCase());
    }
    return ErrorValue.typeMismatch("string", val);
  }),

  // string.trim() -> string
  new UnaryDispatcherOverload("trim_string", (val: Value): Value => {
    if (isStringValue(val)) {
      return StringValue.of(val.value().trim());
    }
    return ErrorValue.typeMismatch("string", val);
  }),

  // string.split(string) -> list(string)
  new BinaryDispatcherOverload("split_string", (lhs: Value, rhs: Value): Value => {
    if (isStringValue(lhs) && isStringValue(rhs)) {
      const parts = lhs.value().split(rhs.value());
      return ListValue.of(parts.map((p) => StringValue.of(p)));
    }
    return ErrorValue.typeMismatch("string", lhs);
  }),

  // string.join(list) -> string
  new BinaryDispatcherOverload("join_string", (lhs: Value, rhs: Value): Value => {
    if (isListValue(lhs) && isStringValue(rhs)) {
      const parts: string[] = [];
      for (const elem of lhs) {
        if (isStringValue(elem)) {
          parts.push(elem.value());
        } else {
          return ErrorValue.typeMismatch("string", elem);
        }
      }
      return StringValue.of(parts.join(rhs.value()));
    }
    return ErrorValue.typeMismatch("list", lhs);
  }),

  // string.replace(string, string) -> string
  new NaryDispatcherOverload("replace_string", (args: Value[]): Value => {
    if (args.length !== 3) {
      return ErrorValue.of("replace requires 3 arguments");
    }
    const [str, from, to] = args;
    if (str !== undefined && from !== undefined && to !== undefined && isStringValue(str) && isStringValue(from) && isStringValue(to)) {
      return StringValue.of(
        str.value().replaceAll(from.value(), to.value())
      );
    }
    return ErrorValue.typeMismatch("string", str!);
  }),
];

export const typeConversionFunctions: Overload[] = [
  // int(value) -> int
  new UnaryDispatcherOverload("int", (val: Value): Value => {
    if (isIntValue(val)) {
      return val;
    }
    if (isUintValue(val)) {
      const raw = val.value();
      if (raw > IntLimits.Int64Max) {
        return ErrorValue.of("range error");
      }
      return IntValue.of(raw);
    }
    if (isDoubleValue(val)) {
      const doubleValue = val.value();
      if (!Number.isFinite(doubleValue)) {
        return ErrorValue.of("cannot convert infinity or NaN to int");
      }
      if (
        doubleValue <= Number(IntLimits.Int64Min) ||
        doubleValue >= Number(IntLimits.Int64Max)
      ) {
        return ErrorValue.of("range error");
      }
      const truncated = BigInt(Math.trunc(doubleValue));
      if (truncated < IntLimits.Int64Min || truncated > IntLimits.Int64Max) {
        return ErrorValue.of("range error");
      }
      return IntValue.of(truncated);
    }
    if (isStringValue(val)) {
      try {
        const numericValue = BigInt(val.value());
        if (numericValue < IntLimits.Int64Min || numericValue > IntLimits.Int64Max) {
          return ErrorValue.of("range error");
        }
        return IntValue.of(numericValue);
      } catch {
        return ErrorValue.of(`cannot parse '${val.value()}' as int`);
      }
    }
    if (isTimestampValue(val)) {
      return IntValue.of(val.value() / 1_000_000_000n);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to int`);
  }),

  // uint(value) -> uint
  new UnaryDispatcherOverload("uint", (val: Value): Value => {
    if (isUintValue(val)) {
      return val;
    }
    if (isIntValue(val)) {
      const numericValue = val.value();
      if (numericValue < 0n) {
        return ErrorValue.of("cannot convert negative int to uint");
      }
      if (numericValue > IntLimits.Uint64Max) {
        return ErrorValue.of("range error");
      }
      return UintValue.of(numericValue);
    }
    if (isDoubleValue(val)) {
      const doubleValue = val.value();
      if (!Number.isFinite(doubleValue) || doubleValue < 0) {
        return ErrorValue.of("cannot convert to uint");
      }
      const truncated = BigInt(Math.trunc(doubleValue));
      if (truncated > IntLimits.Uint64Max) {
        return ErrorValue.of("range error");
      }
      return UintValue.of(truncated);
    }
    if (isStringValue(val)) {
      try {
        const numericValue = BigInt(val.value());
        if (numericValue < 0n) {
          return ErrorValue.of("cannot convert negative string to uint");
        }
        if (numericValue > IntLimits.Uint64Max) {
          return ErrorValue.of("range error");
        }
        return UintValue.of(numericValue);
      } catch {
        return ErrorValue.of(`cannot parse '${val.value()}' as uint`);
      }
    }
    return ErrorValue.of(`cannot convert ${val.type()} to uint`);
  }),

  // double(value) -> double
  new UnaryDispatcherOverload("double", (val: Value): Value => {
    if (isDoubleValue(val)) {
      return val;
    }
    if (isIntValue(val)) {
      return DoubleValue.of(Number(val.value()));
    }
    if (isUintValue(val)) {
      return DoubleValue.of(Number(val.value()));
    }
    if (isStringValue(val)) {
      const raw = val.value();
      const doubleValue = Number.parseFloat(raw);
      if (Number.isNaN(doubleValue) && raw !== "NaN") {
        return ErrorValue.of(`cannot parse '${raw}' as double`);
      }
      return DoubleValue.of(doubleValue);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to double`);
  }),

  // string(value) -> string
  new UnaryDispatcherOverload("string", (val: Value): Value => {
    if (isStringValue(val)) {
      return val;
    }
    if (isIntValue(val) || isUintValue(val)) {
      return StringValue.of(val.value().toString());
    }
    if (isDoubleValue(val)) {
      return StringValue.of(val.value().toString());
    }
    if (isBoolValue(val)) {
      return StringValue.of(val.value() ? "true" : "false");
    }
    if (isBytesValue(val)) {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        return StringValue.of(decoder.decode(val.value()));
      } catch {
        return ErrorValue.of("invalid UTF-8 in bytes");
      }
    }
    if (isTimestampValue(val)) {
      return StringValue.of(val.toString());
    }
    if (isDurationValue(val)) {
      return StringValue.of(val.toString());
    }
    return ErrorValue.of(`cannot convert ${val.type()} to string`);
  }),

  // bytes(value) -> bytes
  new UnaryDispatcherOverload("bytes", (val: Value): Value => {
    if (isBytesValue(val)) {
      return val;
    }
    if (isStringValue(val)) {
      return BytesValue.fromString(val.value());
    }
    return ErrorValue.of(`cannot convert ${val.type()} to bytes`);
  }),

  // bool(value) -> bool
  new UnaryDispatcherOverload("bool", (val: Value): Value => {
    if (isBoolValue(val)) {
      return val;
    }
    if (isStringValue(val)) {
      const stringValue = val.value();
      if (
        stringValue === "true" ||
        stringValue === "TRUE" ||
        stringValue === "True" ||
        stringValue === "t" ||
        stringValue === "1"
      ) {
        return BoolValue.True;
      }
      if (
        stringValue === "false" ||
        stringValue === "FALSE" ||
        stringValue === "False" ||
        stringValue === "f" ||
        stringValue === "0"
      ) {
        return BoolValue.False;
      }
      return ErrorValue.of(`cannot parse '${stringValue}' as bool`);
    }
    return ErrorValue.of(`cannot convert ${val.type()} to bool`);
  }),

  // type(value) -> type
  new UnaryDispatcherOverload("type", (val: Value): Value => {
    return toTypeValue(val.type());
  }),

  // dyn(value) -> dyn
  new UnaryDispatcherOverload("dyn", (val: Value): Value => {
    return val;
  }),
];

export const comparisonFunctions: Overload[] = [
  // No additional comparison functions needed - handled by BinaryValue
];

export const arithmeticFunctions: Overload[] = [
  // No additional arithmetic functions needed - handled by BinaryValue
];

export const logicalFunctions: Overload[] = [
  // No additional logical functions needed - handled by AndValue/OrValue/NotValue
];

export const listFunctions: Overload[] = [
  // list.all(predicate) is handled by comprehensions
  // list.exists(predicate) is handled by comprehensions
  // list.exists_one(predicate) is handled by comprehensions
  // list.filter(predicate) is handled by comprehensions
  // list.map(expr) is handled by comprehensions
  // list + list is handled by BinaryValue
];

export const mapFunctions: Overload[] = [
  // has(map.key) - existence test - handled specially during planning
  // map.all(predicate) is handled by comprehensions
  // map.exists(predicate) is handled by comprehensions
  // map.filter(predicate) is handled by comprehensions
  // map.map(expr) is handled by comprehensions
];

export const timeFunctions: Overload[] = [
  // timestamp(string) -> timestamp
  new UnaryDispatcherOverload("timestamp_string", (val: Value): Value => {
    if (isStringValue(val)) {
      const parsed = parseTimestamp(val.value());
      if (isErrorValue(parsed)) {
        return parsed;
      }
      return parsed;
    }
    return ErrorValue.typeMismatch("string", val);
  }),

  // timestamp(int) -> timestamp (seconds since epoch)
  new UnaryDispatcherOverload("timestamp_int", (val: Value): Value => {
    if (isIntValue(val)) {
      return TimestampValue.fromSeconds(Number(val.value()));
    }
    return ErrorValue.typeMismatch("int", val);
  }),
  // timestamp(timestamp) -> timestamp
  new UnaryDispatcherOverload("timestamp_timestamp", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val;
    }
    return ErrorValue.typeMismatch("timestamp", val);
  }),

  // duration(string) -> duration
  new UnaryDispatcherOverload("duration_string", (val: Value): Value => {
    if (isStringValue(val)) {
      const parsed = parseDuration(val.value());
      if (isErrorValue(parsed)) {
        return parsed;
      }
      return parsed;
    }
    return ErrorValue.typeMismatch("string", val);
  }),
  // duration(duration) -> duration
  new UnaryDispatcherOverload("duration_duration", (val: Value): Value => {
    if (isDurationValue(val)) {
      return val;
    }
    return ErrorValue.typeMismatch("duration", val);
  }),

  // timestamp.getFullYear() -> int
  new UnaryDispatcherOverload("getFullYear", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getFullYear();
    }
    return ErrorValue.typeMismatch("timestamp", val);
  }),
  new BinaryDispatcherOverload("getFullYear_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getFullYear(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),

  // timestamp.getMonth() -> int
  new UnaryDispatcherOverload("getMonth", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getMonth();
    }
    return ErrorValue.typeMismatch("timestamp", val);
  }),
  new BinaryDispatcherOverload("getMonth_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getMonth(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),
  // timestamp.getDate() -> int
  new UnaryDispatcherOverload("getDate", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getDate();
    }
    return ErrorValue.typeMismatch("timestamp", val);
  }),
  new BinaryDispatcherOverload("getDate_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getDate(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),

  // timestamp.getDayOfMonth() -> int
  new UnaryDispatcherOverload("getDayOfMonth", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getDayOfMonth();
    }
    return ErrorValue.typeMismatch("timestamp", val);
  }),
  new BinaryDispatcherOverload("getDayOfMonth_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getDayOfMonth(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),

  // timestamp.getDayOfWeek() -> int
  new UnaryDispatcherOverload("getDayOfWeek", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getDayOfWeek();
    }
    return ErrorValue.typeMismatch("timestamp", val);
  }),
  new BinaryDispatcherOverload("getDayOfWeek_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getDayOfWeek(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),
  // timestamp.getDayOfYear() -> int
  new UnaryDispatcherOverload("getDayOfYear", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getDayOfYear();
    }
    return ErrorValue.typeMismatch("timestamp", val);
  }),
  new BinaryDispatcherOverload("getDayOfYear_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getDayOfYear(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),

  // timestamp.getHours() -> int
  new UnaryDispatcherOverload("getHours", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getHours();
    }
    if (isDurationValue(val)) {
      return val.getHours();
    }
    return ErrorValue.typeMismatch("timestamp or duration", val);
  }),
  new BinaryDispatcherOverload("getHours_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getHours(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),

  // timestamp.getMinutes() -> int
  new UnaryDispatcherOverload("getMinutes", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getMinutes();
    }
    if (isDurationValue(val)) {
      return val.getMinutes();
    }
    return ErrorValue.typeMismatch("timestamp or duration", val);
  }),
  new BinaryDispatcherOverload("getMinutes_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getMinutes(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),

  // timestamp.getSeconds() -> int
  new UnaryDispatcherOverload("getSeconds", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getSeconds();
    }
    if (isDurationValue(val)) {
      return val.getSeconds();
    }
    return ErrorValue.typeMismatch("timestamp or duration", val);
  }),
  new BinaryDispatcherOverload("getSeconds_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getSeconds(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),

  // timestamp.getMilliseconds() -> int
  new UnaryDispatcherOverload("getMilliseconds", (val: Value): Value => {
    if (isTimestampValue(val)) {
      return val.getMilliseconds();
    }
    if (isDurationValue(val)) {
      return val.getMilliseconds();
    }
    return ErrorValue.typeMismatch("timestamp or duration", val);
  }),
  new BinaryDispatcherOverload("getMilliseconds_string", (lhs: Value, rhs: Value): Value => {
    if (isTimestampValue(lhs) && isStringValue(rhs)) {
      return lhs.getMilliseconds(rhs.value());
    }
    return ErrorValue.typeMismatch("timestamp, string", lhs);
  }),
];

export const miscFunctions: Overload[] = [
  // has(field) - field presence test
  // Note: This is typically handled during planning, not as a runtime function
  // Conditional ternary is handled by ConditionalValue
];

export const standardFunctions: Overload[] = [
  ...sizeFunctions,
  ...stringFunctions,
  ...typeConversionFunctions,
  ...comparisonFunctions,
  ...arithmeticFunctions,
  ...logicalFunctions,
  ...listFunctions,
  ...mapFunctions,
  ...timeFunctions,
  ...miscFunctions,
];

function parseTimestamp(value: string): TimestampValue | ErrorValue {
  const match =
    /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]?\d{2}:\d{2})$/.exec(
      value
    );
  if (match === null) {
    return ErrorValue.of(`cannot parse '${value}' as timestamp`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7];
  const tz = match[8] ?? "Z";

  if (year < 1 || year > 9999) {
    return ErrorValue.of("timestamp out of range");
  }

  const offsetMinutes = parseTimeZoneOffset(tz);
  if (offsetMinutes === undefined) {
    return ErrorValue.of(`cannot parse '${value}' as timestamp`);
  }

  const baseMillis = utcMillisForDate(year, month, day, hour, minute, second);
  if (Number.isNaN(baseMillis)) {
    return ErrorValue.of(`cannot parse '${value}' as timestamp`);
  }
  const date = new Date(baseMillis);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return ErrorValue.of(`cannot parse '${value}' as timestamp`);
  }
  const utcMillis = baseMillis - offsetMinutes * 60_000;

  let nanos = 0n;
  if (fraction !== undefined) {
    const digits = fraction.slice(1);
    nanos = BigInt(digits.padEnd(9, "0"));
  }

  const timestampNanos = BigInt(utcMillis) * 1_000_000n + nanos;
  if (timestampNanos < TIMESTAMP_MIN_NANOS || timestampNanos > TIMESTAMP_MAX_NANOS) {
    return ErrorValue.of("timestamp out of range");
  }
  return TimestampValue.of(timestampNanos);
}

function utcMillisForDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number {
  const date = new Date(Date.UTC(0, month - 1, day, hour, minute, second));
  date.setUTCFullYear(year);
  return date.getTime();
}

/**
 * Parse a duration string.
 */
function parseDuration(s: string): DurationValue | ErrorValue {
  // Parse durations like "1h30m", "5s", "100ms", "1.5s"
  let totalNanos = 0n;
  let remaining = s.trim();

  if (remaining === "") {
    return ErrorValue.of("empty duration string");
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
      return ErrorValue.of(`invalid duration value: ${valueStr}`);
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
        return ErrorValue.of(`unknown duration unit: ${unit}`);
    }

    totalNanos += nanos;
    remaining = remaining.substring(match[0].length);
  }

  if (remaining.length > 0) {
    return ErrorValue.of(`invalid duration: ${s}`);
  }

  if (negative) {
    totalNanos = -totalNanos;
  }

  if (
    totalNanos < -DURATION_MAX_NANOS ||
    totalNanos > DURATION_MAX_NANOS ||
    totalNanos < IntLimits.Int64Min ||
    totalNanos > IntLimits.Int64Max
  ) {
    return ErrorValue.of("duration out of range");
  }

  return DurationValue.of(totalNanos);
}

const DURATION_MAX_SECONDS = 315576000000n;
const DURATION_MAX_NANOS = DURATION_MAX_SECONDS * 1_000_000_000n;
const TIMESTAMP_MIN_SECONDS = -62135596800n;
const TIMESTAMP_MAX_SECONDS = 253402300799n;
const TIMESTAMP_MIN_NANOS = TIMESTAMP_MIN_SECONDS * 1_000_000_000n;
const TIMESTAMP_MAX_NANOS = TIMESTAMP_MAX_SECONDS * 1_000_000_000n + 999_999_999n;

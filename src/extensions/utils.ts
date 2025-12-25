import {
  BoolValue,
  BytesValue,
  DoubleValue,
  DurationValue,
  ErrorValue,
  IntValue,
  StringValue,
  TimestampValue,
  UintValue,
  type Value,
} from "../interpreter/values";

/**
 * Compare two CEL values, returning -1, 0, or 1 for ordering.
 */
export function compareValues(lhs: Value, rhs: Value): number | ErrorValue {
  if (lhs instanceof IntValue && rhs instanceof IntValue) {
    return lhs.compare(rhs);
  }
  if (lhs instanceof UintValue && rhs instanceof UintValue) {
    return lhs.compare(rhs);
  }
  if (lhs instanceof DoubleValue && rhs instanceof DoubleValue) {
    const cmp = lhs.compare(rhs);
    if (Number.isNaN(cmp)) {
      return ErrorValue.of("cannot compare NaN");
    }
    return cmp;
  }
  if (lhs instanceof IntValue && rhs instanceof UintValue) {
    return compareIntUint(lhs, rhs);
  }
  if (lhs instanceof UintValue && rhs instanceof IntValue) {
    return -compareIntUint(rhs, lhs);
  }
  if (lhs instanceof StringValue && rhs instanceof StringValue) {
    return lhs.compare(rhs);
  }
  if (lhs instanceof BytesValue && rhs instanceof BytesValue) {
    const left = lhs.value();
    const right = rhs.value();
    const len = Math.min(left.length, right.length);
    for (let i = 0; i < len; i++) {
      if (left[i]! < right[i]!) return -1;
      if (left[i]! > right[i]!) return 1;
    }
    if (left.length === right.length) return 0;
    return left.length < right.length ? -1 : 1;
  }
  if (lhs instanceof BoolValue && rhs instanceof BoolValue) {
    if (lhs.value() === rhs.value()) return 0;
    return lhs.value() ? 1 : -1;
  }
  if (lhs instanceof DurationValue && rhs instanceof DurationValue) {
    return lhs.compare(rhs);
  }
  if (lhs instanceof TimestampValue && rhs instanceof TimestampValue) {
    return lhs.compare(rhs);
  }
  if (
    (lhs instanceof IntValue || lhs instanceof UintValue || lhs instanceof DoubleValue) &&
    (rhs instanceof IntValue || rhs instanceof UintValue || rhs instanceof DoubleValue)
  ) {
    const left = toNumber(lhs);
    const right = toNumber(rhs);
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return ErrorValue.of("cannot compare NaN");
    }
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return ErrorValue.of(`cannot compare ${lhs.type()} with ${rhs.type()}`);
}

/**
 * Check if a value is a comparable type (numeric, bool, duration, timestamp, string, bytes).
 */
export function isComparableValue(value: Value): boolean {
  return (
    value instanceof IntValue ||
    value instanceof UintValue ||
    value instanceof DoubleValue ||
    value instanceof BoolValue ||
    value instanceof DurationValue ||
    value instanceof TimestampValue ||
    value instanceof StringValue ||
    value instanceof BytesValue
  );
}

function toNumber(value: IntValue | UintValue | DoubleValue): number {
  if (value instanceof DoubleValue) return value.value();
  return Number(value.value());
}

function compareIntUint(lhs: IntValue, rhs: UintValue): number {
  const left = lhs.value();
  if (left < 0n) {
    return -1;
  }
  const right = rhs.value();
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

import {
  Function as CelFunction,
  DynType,
  type EnvOptions,
  IntType,
  MemberOverload,
  Overload,
  StringType,
} from "../api";
import { ListType } from "../checker/types";
import {
  ErrorValue,
  IntValue,
  ListValue,
  StringValue,
  type Value,
  isBoolValue,
  isBytesValue,
  isDoubleValue,
  isIntValue,
  isListValue,
  isMapValue,
  isStringValue,
  isTypeValue,
  isUintValue,
} from "../interpreter/values";
import { type Macro, ReceiverMacro } from "../parser";
import type { Extension } from "./extensions";
import { macroTargetMatchesNamespace } from "./utils";

/** Options for configuring the strings extension version. */
export type StringsOptions = { version?: number };

/**
 * Strings extension.
 * Provides string manipulation functions: charAt, indexOf, lastIndexOf, split, substring, trim, etc.
 */
export class StringsExtension implements Extension {
  private readonly version: number;

  constructor(options: StringsOptions = {}) {
    this.version = options.version ?? Number.MAX_SAFE_INTEGER;
  }

  envOptions(): EnvOptions {
    const macros: Macro[] = [];

    const functions = [
      new CelFunction(
        "charAt",
        new MemberOverload(
          "string_char_at_int",
          [StringType, IntType],
          StringType,
          (lhs: Value, rhs: Value) => stringCharAt(lhs, rhs)
        )
      ),
      new CelFunction(
        "indexOf",
        new MemberOverload(
          "string_index_of_string",
          [StringType, StringType],
          IntType,
          (lhs: Value, rhs: Value) => stringIndexOf(lhs, rhs)
        ),
        new MemberOverload(
          "string_index_of_string_int",
          [StringType, StringType, IntType],
          IntType,
          (args: Value[]) => stringIndexOfOffset(args)
        )
      ),
      new CelFunction(
        "lastIndexOf",
        new MemberOverload(
          "string_last_index_of_string",
          [StringType, StringType],
          IntType,
          (lhs: Value, rhs: Value) => stringLastIndexOf(lhs, rhs)
        ),
        new MemberOverload(
          "string_last_index_of_string_int",
          [StringType, StringType, IntType],
          IntType,
          (args: Value[]) => stringLastIndexOfOffset(args)
        )
      ),
      new CelFunction(
        "lowerAscii",
        new MemberOverload("string_lower_ascii", [StringType], StringType, (arg: Value) => {
          if (!isStringValue(arg)) return ErrorValue.typeMismatch("string", arg);
          return StringValue.of(toLowerAscii(arg.value()));
        })
      ),
      new CelFunction(
        "replace",
        new MemberOverload(
          "string_replace_string_string",
          [StringType, StringType, StringType],
          StringType,
          (args: Value[]) => stringReplace(args)
        ),
        new MemberOverload(
          "string_replace_string_string_int",
          [StringType, StringType, StringType, IntType],
          StringType,
          (args: Value[]) => stringReplace(args)
        )
      ),
      new CelFunction(
        "split",
        new MemberOverload(
          "string_split_string",
          [StringType, StringType],
          new ListType(StringType),
          (lhs: Value, rhs: Value) => stringSplit(lhs, rhs)
        ),
        new MemberOverload(
          "string_split_string_int",
          [StringType, StringType, IntType],
          new ListType(StringType),
          (args: Value[]) => stringSplitN(args)
        )
      ),
      new CelFunction(
        "substring",
        new MemberOverload(
          "string_substring_int",
          [StringType, IntType],
          StringType,
          (lhs: Value, rhs: Value) => stringSubstring(lhs, rhs)
        ),
        new MemberOverload(
          "string_substring_int_int",
          [StringType, IntType, IntType],
          StringType,
          (args: Value[]) => stringSubstringRange(args)
        )
      ),
      new CelFunction(
        "trim",
        new MemberOverload("string_trim", [StringType], StringType, (arg: Value) => {
          if (!isStringValue(arg)) return ErrorValue.typeMismatch("string", arg);
          return StringValue.of(trimUnicodeSpaces(arg.value()));
        })
      ),
      new CelFunction(
        "upperAscii",
        new MemberOverload("string_upper_ascii", [StringType], StringType, (arg: Value) => {
          if (!isStringValue(arg)) return ErrorValue.typeMismatch("string", arg);
          return StringValue.of(toUpperAscii(arg.value()));
        })
      ),
    ];

    if (this.version >= 1) {
      macros.push(
        new ReceiverMacro("quote", 1, (helper, target, args) => {
          if (!macroTargetMatchesNamespace("strings", target)) {
            return undefined;
          }
          return helper.createCall("strings.quote", args[0]!);
        })
      );
      functions.push(
        new CelFunction(
          "format",
          new MemberOverload(
            "string_format",
            [StringType, new ListType(DynType)],
            StringType,
            (lhs: Value, rhs: Value) => stringFormatPair(lhs, rhs)
          )
        ),
        new CelFunction(
          "strings.quote",
          new Overload("strings_quote", [StringType], StringType, (arg: Value) => {
            if (!isStringValue(arg)) return ErrorValue.typeMismatch("string", arg);
            return StringValue.of(quoteString(arg.value()));
          })
        )
      );
    }

    if (this.version >= 2) {
      functions.push(
        new CelFunction(
          "join",
          new MemberOverload("list_join", [new ListType(StringType)], StringType, (arg: Value) =>
            listJoin(arg, "")
          ),
          new MemberOverload(
            "list_join_string",
            [new ListType(StringType), StringType],
            StringType,
            (lhs: Value, rhs: Value) => listJoin(lhs, rhs)
          )
        ),
        new CelFunction(
          "reverse",
          new MemberOverload("string_reverse", [StringType], StringType, (arg: Value) => {
            if (!isStringValue(arg)) return ErrorValue.typeMismatch("string", arg);
            const reversed = [...arg.value()].reverse().join("");
            return StringValue.of(reversed);
          })
        )
      );
    }

    return { functions, macros };
  }
}

function stringCharAt(target: Value, index: Value): Value {
  if (!isStringValue(target)) return ErrorValue.typeMismatch("string", target);
  if (!isIntValue(index)) return ErrorValue.typeMismatch("int", index);
  const idx = Number(index.value());
  const chars = toRunes(target.value());
  if (idx < 0 || idx > chars.length) {
    return ErrorValue.of(`index out of range: ${idx}`);
  }
  if (idx === chars.length) {
    return StringValue.Empty;
  }
  return StringValue.of(chars[idx]!);
}

function stringIndexOf(target: Value, search: Value): Value {
  if (!isStringValue(target) || !isStringValue(search)) {
    return ErrorValue.of("indexOf expects string arguments");
  }
  return IntValue.of(indexOfRunes(target.value(), search.value(), 0));
}

function stringIndexOfOffset(args: Value[]): Value {
  const target = args[0];
  const search = args[1];
  const offset = args[2];
  if (
    target === undefined ||
    search === undefined ||
    offset === undefined ||
    !isStringValue(target) ||
    !isStringValue(search) ||
    !isIntValue(offset)
  ) {
    return ErrorValue.of("indexOf expects string, string, int arguments");
  }
  const offsetNum = Number(offset.value());
  const targetRunes = toRunes(target.value());
  if (offsetNum < 0 || offsetNum > targetRunes.length) {
    return ErrorValue.of(`index out of range: ${offsetNum}`);
  }
  return IntValue.of(indexOfRunes(target.value(), search.value(), offsetNum));
}

function stringLastIndexOf(target: Value, search: Value): Value {
  if (!isStringValue(target) || !isStringValue(search)) {
    return ErrorValue.of("lastIndexOf expects string arguments");
  }
  const targetRunes = toRunes(target.value());
  const searchRunes = toRunes(search.value());
  return IntValue.of(lastIndexOfRunes(targetRunes, searchRunes, targetRunes.length));
}

function stringLastIndexOfOffset(args: Value[]): Value {
  const target = args[0];
  const search = args[1];
  const offset = args[2];
  if (
    target === undefined ||
    search === undefined ||
    offset === undefined ||
    !isStringValue(target) ||
    !isStringValue(search) ||
    !isIntValue(offset)
  ) {
    return ErrorValue.of("lastIndexOf expects string, string, int arguments");
  }
  const offsetNum = Number(offset.value());
  const targetRunes = toRunes(target.value());
  if (offsetNum < 0 || offsetNum > targetRunes.length) {
    return ErrorValue.of(`index out of range: ${offsetNum}`);
  }
  const searchRunes = toRunes(search.value());
  return IntValue.of(lastIndexOfRunes(targetRunes, searchRunes, offsetNum));
}

function stringReplace(args: Value[]): Value {
  const target = args[0];
  const oldValue = args[1];
  const newValue = args[2];
  const limit = args[3];
  if (
    target === undefined ||
    oldValue === undefined ||
    newValue === undefined ||
    !isStringValue(target) ||
    !isStringValue(oldValue) ||
    !isStringValue(newValue)
  ) {
    return ErrorValue.of("replace expects string arguments");
  }
  if (limit !== undefined) {
    if (!isIntValue(limit)) {
      return ErrorValue.typeMismatch("int", limit);
    }
    const count = Number(limit.value());
    if (count === 0) {
      return target;
    }
    if (count < 0) {
      return StringValue.of(target.value().split(oldValue.value()).join(newValue.value()));
    }
    return StringValue.of(replaceN(target.value(), oldValue.value(), newValue.value(), count));
  }
  return StringValue.of(target.value().split(oldValue.value()).join(newValue.value()));
}

function replaceN(source: string, search: string, replacement: string, count: number): string {
  if (count <= 0 || search === "") {
    return source;
  }
  let result = "";
  let remaining = source;
  let applied = 0;
  while (applied < count) {
    const index = remaining.indexOf(search);
    if (index < 0) {
      break;
    }
    result += remaining.slice(0, index) + replacement;
    remaining = remaining.slice(index + search.length);
    applied += 1;
  }
  return result + remaining;
}

function stringSplit(target: Value, separator: Value): Value {
  if (!isStringValue(target) || !isStringValue(separator)) {
    return ErrorValue.of("split expects string arguments");
  }
  const parts = target.value().split(separator.value());
  return ListValue.of(parts.map((part) => StringValue.of(part)));
}

function stringSplitN(args: Value[]): Value {
  const target = args[0];
  const separator = args[1];
  const limit = args[2];
  if (
    target === undefined ||
    separator === undefined ||
    limit === undefined ||
    !isStringValue(target) ||
    !isStringValue(separator) ||
    !isIntValue(limit)
  ) {
    return ErrorValue.of("split expects string, string, int arguments");
  }
  const count = Number(limit.value());
  if (count === 0) {
    return ListValue.Empty;
  }
  if (count === 1) {
    return ListValue.of([StringValue.of(target.value())]);
  }
  const parts = target.value().split(separator.value());
  if (count < 0 || parts.length <= count) {
    return ListValue.of(parts.map((part) => StringValue.of(part)));
  }
  const sliced = parts.slice(0, count);
  return ListValue.of(sliced.map((part) => StringValue.of(part)));
}

function stringSubstring(target: Value, offset: Value): Value {
  if (!isStringValue(target) || !isIntValue(offset)) {
    return ErrorValue.of("substring expects string, int arguments");
  }
  const start = Number(offset.value());
  const chars = toRunes(target.value());
  if (start < 0 || start > chars.length) {
    return ErrorValue.of(`index out of range: ${start}`);
  }
  return StringValue.of(chars.slice(start).join(""));
}

function stringSubstringRange(args: Value[]): Value {
  const target = args[0];
  const start = args[1];
  const end = args[2];
  if (
    target === undefined ||
    start === undefined ||
    end === undefined ||
    !isStringValue(target) ||
    !isIntValue(start) ||
    !isIntValue(end)
  ) {
    return ErrorValue.of("substring expects string, int, int arguments");
  }
  const startNum = Number(start.value());
  const endNum = Number(end.value());
  const chars = toRunes(target.value());
  if (startNum < 0 || endNum < 0) {
    return ErrorValue.of(`index out of range: ${startNum < 0 ? startNum : endNum}`);
  }
  if (startNum > endNum) {
    return ErrorValue.of(`invalid substring range. start: ${startNum}, end: ${endNum}`);
  }
  if (startNum > chars.length) {
    return ErrorValue.of(`index out of range: ${startNum}`);
  }
  if (endNum > chars.length) {
    return ErrorValue.of(`index out of range: ${endNum}`);
  }
  return StringValue.of(chars.slice(startNum, endNum).join(""));
}

function listJoin(list: Value, delimiter: Value | string): Value {
  if (!isListValue(list)) {
    return ErrorValue.typeMismatch("list", list);
  }
  let delim = "";
  if (typeof delimiter === "string") {
    delim = delimiter;
  } else {
    if (!isStringValue(delimiter)) {
      return ErrorValue.typeMismatch("string", delimiter);
    }
    delim = delimiter.value();
  }
  const parts: string[] = [];
  for (const elem of list.value()) {
    if (!isStringValue(elem)) {
      return ErrorValue.typeMismatch("string", elem);
    }
    parts.push(elem.value());
  }
  return StringValue.of(parts.join(delim));
}

function stringFormat(args: Value[]): Value {
  const format = args[0];
  const list = args[1];
  if (format === undefined || list === undefined || !isStringValue(format) || !isListValue(list)) {
    return ErrorValue.of("format expects string and list arguments");
  }
  const formatted = formatString(format.value(), list.value());
  if (typeof formatted !== "string") {
    return formatted;
  }
  return StringValue.of(formatted);
}

function stringFormatPair(lhs: Value, rhs: Value): Value {
  return stringFormat([lhs, rhs]);
}

function formatString(format: string, args: readonly Value[]): string | ErrorValue {
  let result = "";
  let argIndex = 0;
  for (let i = 0; i < format.length; i++) {
    const ch = format[i]!;
    if (ch !== "%") {
      result += ch;
      continue;
    }
    const next = format[i + 1];
    if (next === "%") {
      result += "%";
      i += 1;
      continue;
    }
    if (next === undefined) {
      return ErrorValue.of('could not parse formatting clause: unrecognized formatting clause "%"');
    }

    let precision: number | undefined = undefined;
    let cursor = i + 1;
    if (format[cursor] === ".") {
      cursor += 1;
      let digits = "";
      while (cursor < format.length && /\d/.test(format[cursor]!)) {
        digits += format[cursor]!;
        cursor += 1;
      }
      if (digits === "") {
        return ErrorValue.of(
          "could not parse formatting clause: precision must be a non-negative integer"
        );
      }
      precision = Number(digits);
    }

    const code = format[cursor];
    if (code === undefined) {
      return ErrorValue.of('could not parse formatting clause: unrecognized formatting clause "%"');
    }
    if (argIndex >= args.length) {
      return ErrorValue.of(`index ${argIndex} out of range`);
    }
    const arg = args[argIndex++]!;
    i = cursor;
    const formatted = formatArg(code, arg, precision);
    if (typeof formatted !== "string") {
      return formatted;
    }
    result += formatted;
  }
  return result;
}

function formatArg(code: string, value: Value, precision: number | undefined): string | ErrorValue {
  switch (code) {
    case "s":
      return wrapFormatError(formatStringValue(value));
    case "d":
      return wrapFormatError(formatDecimal(value));
    case "f":
      return wrapFormatError(formatFixed(value, precision ?? 6));
    case "b":
      return wrapFormatError(formatBinary(value));
    case "x":
      return wrapFormatError(formatHex(value, false));
    case "X":
      return wrapFormatError(formatHex(value, true));
    case "o":
      return wrapFormatError(formatOctal(value));
    case "e":
      return wrapFormatError(formatScientific(value, precision ?? 6));
    default:
      return ErrorValue.of(
        `could not parse formatting clause: unrecognized formatting clause "${code}"`
      );
  }
}

function formatStringValue(value: Value): string | ErrorValue {
  switch (value.kind) {
    case "string":
      return isStringValue(value) ? value.value() : "";
    case "bool":
      return isBoolValue(value) && value.value() ? "true" : "false";
    case "bytes": {
      const decoder = new TextDecoder();
      return isBytesValue(value) ? decoder.decode(value.value()) : "";
    }
    case "int":
      return isIntValue(value) ? value.value().toString() : "";
    case "uint":
      return isUintValue(value) ? value.value().toString() : "";
    case "double": {
      const num = isDoubleValue(value) ? value.value() : Number.NaN;
      if (Number.isNaN(num)) return "NaN";
      if (num === Number.POSITIVE_INFINITY) return "Infinity";
      if (num === Number.NEGATIVE_INFINITY) return "-Infinity";
      return String(num);
    }
    case "null":
      return "null";
    case "duration":
    case "timestamp":
      return value.toString();
    case "type":
      return isTypeValue(value) ? value.value() : "";
    case "list": {
      const parts: string[] = [];
      for (const elem of isListValue(value) ? value.value() : []) {
        const formatted = formatStringValue(elem);
        if (typeof formatted !== "string") {
          return formatted;
        }
        parts.push(formatted);
      }
      return `[${parts.join(", ")}]`;
    }
    case "map": {
      const entries = (isMapValue(value) ? value.value() : []).map((entry) => {
        const key = formatStringValue(entry.key);
        if (typeof key !== "string") {
          return key;
        }
        const val = formatStringValue(entry.value);
        if (typeof val !== "string") {
          return val;
        }
        return { key, val };
      });
      for (const entry of entries) {
        if (
          typeof entry !== "object" ||
          entry === null ||
          ("kind" in entry && entry.kind === "error")
        ) {
          return entry;
        }
      }
      const rendered = entries as { key: string; val: string }[];
      rendered.sort((a, b) => a.key.localeCompare(b.key));
      const pairs = rendered.map((entry) => `${entry.key}: ${entry.val}`);
      return `{${pairs.join(", ")}}`;
    }
    default:
      break;
  }
  return ErrorValue.of(
    `string clause can only be used on strings, bools, bytes, ints, doubles, maps, lists, types, durations, and timestamps, was given ${value.type()}`
  );
}

function formatDecimal(value: Value): string | ErrorValue {
  if (isIntValue(value)) return value.value().toString();
  if (isUintValue(value)) return value.value().toString();
  if (isDoubleValue(value)) {
    const num = value.value();
    if (Number.isNaN(num)) return "NaN";
    if (num === Number.POSITIVE_INFINITY) return "Infinity";
    if (num === Number.NEGATIVE_INFINITY) return "-Infinity";
    return ErrorValue.of("decimal clause can only be used on integers, was given double");
  }
  return ErrorValue.of(`decimal clause can only be used on integers, was given ${value.type()}`);
}

function formatFixed(value: Value, precision: number): string | ErrorValue {
  if (isIntValue(value)) {
    return formatFixedNumber(Number(value.value()), precision);
  }
  if (isUintValue(value)) {
    return formatFixedNumber(Number(value.value()), precision);
  }
  if (isDoubleValue(value)) {
    return formatFixedNumber(value.value(), precision);
  }
  return ErrorValue.of(`fixed-point clause can only be used on doubles, was given ${value.type()}`);
}

function formatScientific(value: Value, precision: number): string | ErrorValue {
  let num: number;
  if (isIntValue(value)) num = Number(value.value());
  else if (isUintValue(value)) num = Number(value.value());
  else if (isDoubleValue(value)) num = value.value();
  else
    return ErrorValue.of(
      `scientific clause can only be used on doubles, was given ${value.type()}`
    );

  if (Number.isNaN(num)) return "NaN";
  if (num === Number.POSITIVE_INFINITY) return "Infinity";
  if (num === Number.NEGATIVE_INFINITY) return "-Infinity";
  const raw = num.toExponential(precision);
  const [mantissa, expRaw] = raw.split("e");
  const expPart = expRaw ?? "+0";
  const sign = expPart.startsWith("-") ? "-" : "+";
  const exp = expPart.replace(/[+-]/, "");
  return `${mantissa}e${sign}${exp.padStart(2, "0")}`;
}

function formatBinary(value: Value): string | ErrorValue {
  if (isIntValue(value)) return value.value().toString(2);
  if (isUintValue(value)) return value.value().toString(2);
  if (isBoolValue(value)) return value.value() ? "1" : "0";
  return ErrorValue.of(
    `only integers and bools can be formatted as binary, was given ${value.type()}`
  );
}

function formatOctal(value: Value): string | ErrorValue {
  if (isIntValue(value)) return value.value().toString(8);
  if (isUintValue(value)) return value.value().toString(8);
  return ErrorValue.of(`octal clause can only be used on integers, was given ${value.type()}`);
}

function formatHex(value: Value, upper: boolean): string | ErrorValue {
  let hex = "";
  if (isIntValue(value)) {
    hex = value.value().toString(16);
  } else if (isUintValue(value)) {
    hex = value.value().toString(16);
  } else if (isStringValue(value)) {
    const bytes = new TextEncoder().encode(value.value());
    hex = bytesToHex(bytes);
  } else if (isBytesValue(value)) {
    hex = bytesToHex(value.value());
  } else {
    return ErrorValue.of(
      `only integers, byte buffers, and strings can be formatted as hex, was given ${value.type()}`
    );
  }
  return upper ? hex.toUpperCase() : hex.toLowerCase();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatFixedNumber(value: number, precision: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  const factor = 10 ** precision;
  const scaled = value * factor;
  const rounded = roundHalfToEven(scaled);
  const sign = rounded < 0 ? "-" : "";
  const absRounded = Math.abs(rounded);
  const intPart = Math.floor(absRounded / factor);
  const fracPart = Math.floor(absRounded % factor);
  if (precision === 0) {
    return `${sign}${intPart}`;
  }
  const frac = fracPart.toString().padStart(precision, "0");
  return `${sign}${intPart}.${frac}`;
}

function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  const epsilon = 1e-12;
  if (diff > 0.5 + epsilon) {
    return floor + 1;
  }
  if (diff < 0.5 - epsilon) {
    return floor;
  }
  const isEven = Math.abs(floor) % 2 === 0;
  return isEven ? floor : floor + 1;
}

function wrapFormatError(result: string | ErrorValue): string | ErrorValue {
  if (typeof result === "string") {
    return result;
  }
  return ErrorValue.of(`error during formatting: ${result.getMessage()}`);
}

function toRunes(value: string): string[] {
  return [...value];
}

function indexOfRunes(target: string, search: string, offset: number): number {
  const targetRunes = toRunes(target);
  const searchRunes = toRunes(search);
  if (searchRunes.length === 0) {
    return offset;
  }
  if (offset >= targetRunes.length) {
    return -1;
  }
  for (let i = offset; i <= targetRunes.length - searchRunes.length; i++) {
    let match = true;
    for (let j = 0; j < searchRunes.length; j++) {
      if (targetRunes[i + j] !== searchRunes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1;
}

function lastIndexOfRunes(targetRunes: string[], searchRunes: string[], offset: number): number {
  if (searchRunes.length === 0) {
    return offset;
  }
  const maxStart = Math.min(offset, targetRunes.length - searchRunes.length);
  for (let i = maxStart; i >= 0; i--) {
    let match = true;
    for (let j = 0; j < searchRunes.length; j++) {
      if (targetRunes[i + j] !== searchRunes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1;
}

function toLowerAscii(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      out += String.fromCharCode(code + 32);
    } else {
      out += ch;
    }
  }
  return out;
}

function toUpperAscii(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 97 && code <= 122) {
      out += String.fromCharCode(code - 32);
    } else {
      out += ch;
    }
  }
  return out;
}

const trimSpaceCodePoints = new Set<number>([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002,
  0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x3000,
]);

function trimUnicodeSpaces(value: string): string {
  const runes = toRunes(value);
  let start = 0;
  let end = runes.length;
  while (start < end && trimSpaceCodePoints.has(runes[start]!.codePointAt(0)!)) {
    start += 1;
  }
  while (end > start && trimSpaceCodePoints.has(runes[end - 1]!.codePointAt(0)!)) {
    end -= 1;
  }
  return runes.slice(start, end).join("");
}

function quoteString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\v":
        out += "\\v";
        break;
      case "\u0007":
        out += "\\a";
        break;
      default:
        if (code < 0x20 || code === 0x7f) {
          out += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
        break;
    }
  }
  out += '"';
  return out;
}

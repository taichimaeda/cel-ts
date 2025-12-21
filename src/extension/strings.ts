import {
  Function,
  DynType,
  IntType,
  MemberOverload,
  Overload,
  StringType,
  type EnvOptions,
} from "../cel";
import { ListType } from "../checker/type";
import {
  BoolValue,
  ErrorValue,
  IntValue,
  ListValue,
  StringValue,
  type Value,
} from "../interpreter/value";

type StringsConfig = { version: number };
export type StringsOption = (config: StringsConfig) => void;

export function StringsVersion(version: number): StringsOption {
  return (config) => {
    config.version = version;
  };
}

export function Strings(...options: StringsOption[]): EnvOptions {
  const config: StringsConfig = { version: Number.MAX_SAFE_INTEGER };
  for (const option of options) {
    option(config);
  }

  const functions = [
    new Function(
      "charAt",
      new MemberOverload(
        "string_char_at_int",
        [StringType, IntType],
        StringType,
        (lhs: Value, rhs: Value) => stringCharAt(lhs, rhs)
      )
    ),
    new Function(
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
    new Function(
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
    new Function(
      "lowerAscii",
      new MemberOverload("string_lower_ascii", [StringType], StringType, (arg: Value) => {
        if (!(arg instanceof StringValue)) return ErrorValue.typeMismatch("string", arg);
        return StringValue.of(arg.value().toLowerCase());
      })
    ),
    new Function(
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
    new Function(
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
    new Function(
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
    new Function(
      "trim",
      new MemberOverload("string_trim", [StringType], StringType, (arg: Value) => {
        if (!(arg instanceof StringValue)) return ErrorValue.typeMismatch("string", arg);
        return StringValue.of(arg.value().trim());
      })
    ),
    new Function(
      "upperAscii",
      new MemberOverload("string_upper_ascii", [StringType], StringType, (arg: Value) => {
        if (!(arg instanceof StringValue)) return ErrorValue.typeMismatch("string", arg);
        return StringValue.of(arg.value().toUpperCase());
      })
    ),
  ];

  if (config.version >= 1) {
    functions.push(
      new Function(
      "format",
      new MemberOverload(
        "string_format",
          [StringType, new ListType(DynType)],
          StringType,
          (args: Value[]) => stringFormat(args)
        )
      ),
      new Function(
        "strings.quote",
        new Overload("strings_quote", [StringType], StringType, (arg: Value) => {
          if (!(arg instanceof StringValue)) return ErrorValue.typeMismatch("string", arg);
          return StringValue.of(JSON.stringify(arg.value()));
        })
      )
    );
  }

  if (config.version >= 2) {
    functions.push(
      new Function(
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
      new Function(
        "reverse",
        new MemberOverload("string_reverse", [StringType], StringType, (arg: Value) => {
          if (!(arg instanceof StringValue)) return ErrorValue.typeMismatch("string", arg);
          const reversed = [...arg.value()].reverse().join("");
          return StringValue.of(reversed);
        })
      )
    );
  }

  return { functions };
}

function stringCharAt(target: Value, index: Value): Value {
  if (!(target instanceof StringValue)) return ErrorValue.typeMismatch("string", target);
  if (!(index instanceof IntValue)) return ErrorValue.typeMismatch("int", index);
  const idx = Number(index.value());
  if (idx < 0) {
    return ErrorValue.indexOutOfBounds(idx, target.value().length);
  }
  const chars = [...target.value()];
  if (idx >= chars.length) {
    return StringValue.Empty;
  }
  return StringValue.of(chars[idx]!);
}

function stringIndexOf(target: Value, search: Value): Value {
  if (!(target instanceof StringValue) || !(search instanceof StringValue)) {
    return ErrorValue.create("indexOf expects string arguments");
  }
  return IntValue.of(target.value().indexOf(search.value()));
}

function stringIndexOfOffset(args: Value[]): Value {
  const target = args[0];
  const search = args[1];
  const offset = args[2];
  if (!(target instanceof StringValue) || !(search instanceof StringValue) || !(offset instanceof IntValue)) {
    return ErrorValue.create("indexOf expects string, string, int arguments");
  }
  const offsetNum = Number(offset.value());
  if (offsetNum < 0) {
    return ErrorValue.create("indexOf offset must be non-negative");
  }
  return IntValue.of(target.value().indexOf(search.value(), offsetNum));
}

function stringLastIndexOf(target: Value, search: Value): Value {
  if (!(target instanceof StringValue) || !(search instanceof StringValue)) {
    return ErrorValue.create("lastIndexOf expects string arguments");
  }
  return IntValue.of(target.value().lastIndexOf(search.value()));
}

function stringLastIndexOfOffset(args: Value[]): Value {
  const target = args[0];
  const search = args[1];
  const offset = args[2];
  if (!(target instanceof StringValue) || !(search instanceof StringValue) || !(offset instanceof IntValue)) {
    return ErrorValue.create("lastIndexOf expects string, string, int arguments");
  }
  const offsetNum = Number(offset.value());
  if (offsetNum < 0) {
    return ErrorValue.create("lastIndexOf offset must be non-negative");
  }
  return IntValue.of(target.value().lastIndexOf(search.value(), offsetNum));
}

function stringReplace(args: Value[]): Value {
  const target = args[0];
  const oldValue = args[1];
  const newValue = args[2];
  const limit = args[3];
  if (!(target instanceof StringValue) || !(oldValue instanceof StringValue) || !(newValue instanceof StringValue)) {
    return ErrorValue.create("replace expects string arguments");
  }
  if (limit !== undefined) {
    if (!(limit instanceof IntValue)) {
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
  if (!(target instanceof StringValue) || !(separator instanceof StringValue)) {
    return ErrorValue.create("split expects string arguments");
  }
  const parts = target.value().split(separator.value());
  return ListValue.of(parts.map((part) => StringValue.of(part)));
}

function stringSplitN(args: Value[]): Value {
  const target = args[0];
  const separator = args[1];
  const limit = args[2];
  if (!(target instanceof StringValue) || !(separator instanceof StringValue) || !(limit instanceof IntValue)) {
    return ErrorValue.create("split expects string, string, int arguments");
  }
  const count = Number(limit.value());
  if (count === 0) {
    return ListValue.Empty;
  }
  const parts = target.value().split(separator.value());
  if (count < 0 || parts.length <= count) {
    return ListValue.of(parts.map((part) => StringValue.of(part)));
  }
  const sliced = parts.slice(0, count);
  return ListValue.of(sliced.map((part) => StringValue.of(part)));
}

function stringSubstring(target: Value, offset: Value): Value {
  if (!(target instanceof StringValue) || !(offset instanceof IntValue)) {
    return ErrorValue.create("substring expects string, int arguments");
  }
  const start = Number(offset.value());
  if (start < 0) {
    return ErrorValue.create("substring offset must be non-negative");
  }
  return StringValue.of([...target.value()].slice(start).join(""));
}

function stringSubstringRange(args: Value[]): Value {
  const target = args[0];
  const start = args[1];
  const end = args[2];
  if (!(target instanceof StringValue) || !(start instanceof IntValue) || !(end instanceof IntValue)) {
    return ErrorValue.create("substring expects string, int, int arguments");
  }
  const startNum = Number(start.value());
  const endNum = Number(end.value());
  if (startNum < 0 || endNum < 0 || startNum > endNum) {
    return ErrorValue.create("substring indices are invalid");
  }
  const chars = [...target.value()];
  if (endNum > chars.length) {
    return ErrorValue.create("substring end exceeds string length");
  }
  return StringValue.of(chars.slice(startNum, endNum).join(""));
}

function listJoin(list: Value, delimiter: Value | string): Value {
  if (!(list instanceof ListValue)) {
    return ErrorValue.typeMismatch("list", list);
  }
  let delim = "";
  if (typeof delimiter === "string") {
    delim = delimiter;
  } else {
    if (!(delimiter instanceof StringValue)) {
      return ErrorValue.typeMismatch("string", delimiter);
    }
    delim = delimiter.value();
  }
  const parts: string[] = [];
  for (const elem of list.value()) {
    if (!(elem instanceof StringValue)) {
      return ErrorValue.typeMismatch("string", elem);
    }
    parts.push(elem.value());
  }
  return StringValue.of(parts.join(delim));
}

function stringFormat(args: Value[]): Value {
  const format = args[0];
  const list = args[1];
  if (!(format instanceof StringValue) || !(list instanceof ListValue)) {
    return ErrorValue.create("format expects string and list arguments");
  }
  const formatted = formatString(format.value(), list.value());
  if (formatted instanceof ErrorValue) {
    return formatted;
  }
  return StringValue.of(formatted);
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
    if (argIndex >= args.length) {
      return ErrorValue.create("format() missing arguments");
    }
    const arg = args[argIndex++]!;
    if (!next) {
      return ErrorValue.create("format() invalid format string");
    }
    i += 1;
    const formatted = formatArg(next, arg);
    if (formatted instanceof ErrorValue) {
      return formatted;
    }
    result += formatted;
  }
  return result;
}

function formatArg(code: string, value: Value): string | ErrorValue {
  switch (code) {
    case "s":
      if (value instanceof StringValue) return value.value();
      return value.toString();
    case "d":
      if (value instanceof IntValue) return value.value().toString();
      if (value instanceof StringValue) return value.value();
      if (value instanceof BoolValue) return value.value() ? "1" : "0";
      return value.toString();
    case "f":
      if (value instanceof IntValue) return Number(value.value()).toFixed(6);
      if (value instanceof StringValue) return value.value();
      if (value instanceof BoolValue) return value.value() ? "1.000000" : "0.000000";
      return value.toString();
    case "b":
      if (value instanceof IntValue) return value.value().toString(2);
      if (value instanceof BoolValue) return value.value() ? "1" : "0";
      return ErrorValue.create("format() %b requires int or bool");
    case "x":
    case "X":
      if (value instanceof IntValue) {
        const hex = value.value().toString(16);
        return code === "X" ? hex.toUpperCase() : hex;
      }
      if (value instanceof StringValue) {
        const hex = Array.from(value.value())
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("");
        return code === "X" ? hex.toUpperCase() : hex;
      }
      return ErrorValue.create("format() %x requires int or string");
    case "o":
      if (value instanceof IntValue) return value.value().toString(8);
      return ErrorValue.create("format() %o requires int");
    case "e":
      if (value instanceof IntValue) return Number(value.value()).toExponential(6);
      return value.toString();
    default:
      return ErrorValue.create(`format() unsupported format %${code}`);
  }
}

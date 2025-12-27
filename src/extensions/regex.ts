import { Function as CelFunction, type EnvOptions, IntType, Overload, StringType } from "../api";
import { ListType, OptionalType } from "../checker/types";
import {
  ErrorValue,
  ListValue,
  OptionalValue,
  StringValue,
  type Value,
  isIntValue,
  isStringValue,
} from "../interpreter/values";
import type { Extension } from "./extensions";

/**
 * Regex extension.
 * Provides regex.extract(), regex.extractAll(), and regex.replace() functions.
 */
export class RegexExtension implements Extension {
  envOptions(): EnvOptions {
    return {
      functions: [
        new CelFunction(
          "regex.extract",
          new Overload(
            "regex_extract_string_string",
            [StringType, StringType],
            new OptionalType(StringType),
            (lhs: Value, rhs: Value) => extractOne(lhs, rhs)
          )
        ),
        new CelFunction(
          "regex.extractAll",
          new Overload(
            "regex_extractAll_string_string",
            [StringType, StringType],
            new ListType(StringType),
            (lhs: Value, rhs: Value) => extractAll(lhs, rhs)
          )
        ),
        new CelFunction(
          "regex.replace",
          new Overload(
            "regex_replace_string_string_string",
            [StringType, StringType, StringType],
            StringType,
            (args: Value[]) => replaceRegex(args)
          ),
          new Overload(
            "regex_replace_string_string_string_int",
            [StringType, StringType, StringType, IntType],
            StringType,
            (args: Value[]) => replaceRegex(args)
          )
        ),
      ],
    };
  }
}

function extractOne(target: Value, pattern: Value): Value {
  if (!isStringValue(target) || !isStringValue(pattern)) {
    return ErrorValue.of("regex.extract expects string arguments");
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern.value());
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid regex";
    return ErrorValue.of(`invalid regex string: ${message}`);
  }
  const match = regex.exec(target.value());
  if (match === null) {
    return OptionalValue.none();
  }
  if (match.length > 2) {
    return ErrorValue.of("multiple capture groups are not supported");
  }
  const out = match.length === 2 ? match[1] : match[0];
  return OptionalValue.of(StringValue.of(out ?? ""));
}

function extractAll(target: Value, pattern: Value): Value {
  if (!isStringValue(target) || !isStringValue(pattern)) {
    return ErrorValue.of("regex.extractAll expects string arguments");
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern.value(), "g");
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid regex";
    return ErrorValue.of(`invalid regex string: ${message}`);
  }

  const results: Value[] = [];
  let match: RegExpExecArray | null;
  while (true) {
    match = regex.exec(target.value());
    if (match === null) {
      break;
    }
    if (match.length > 2) {
      return ErrorValue.of("multiple capture groups are not supported");
    }
    const out = match.length === 2 ? match[1] : match[0];
    results.push(StringValue.of(out ?? ""));
    if (!regex.global) {
      break;
    }
  }
  return ListValue.of(results);
}

function replaceRegex(args: Value[]): Value {
  const target = args[0];
  const pattern = args[1];
  const replacement = args[2];
  const count = args[3];
  if (
    target === undefined ||
    pattern === undefined ||
    replacement === undefined ||
    !isStringValue(target) ||
    !isStringValue(pattern) ||
    !isStringValue(replacement)
  ) {
    return ErrorValue.of("regex.replace expects string arguments");
  }
  let limit = -1;
  if (count !== undefined) {
    if (!isIntValue(count)) {
      return ErrorValue.typeMismatch("int", count);
    }
    limit = Number(count.value());
    if (limit === 0) {
      return target;
    }
  }

  let regex: RegExp;
  let replacementRegex: RegExp;
  try {
    regex = new RegExp(pattern.value(), "g");
    replacementRegex = new RegExp(pattern.value());
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid regex";
    return ErrorValue.of(`invalid regex string: ${message}`);
  }

  const replacementJs = replacement.value().replace(/\\([0-9])/g, "$$$1");
  if (limit < 0) {
    return StringValue.of(target.value().replace(regex, replacementJs));
  }

  let result = "";
  let lastIndex = 0;
  let applied = 0;
  let match: RegExpExecArray | null;
  while (true) {
    match = regex.exec(target.value());
    if (match === null) {
      break;
    }
    result += target.value().slice(lastIndex, match.index);
    result += match[0].replace(replacementRegex, replacementJs);
    lastIndex = match.index + match[0].length;
    applied += 1;
    if (applied >= limit) {
      break;
    }
  }
  result += target.value().slice(lastIndex);
  return StringValue.of(result);
}

import {
  Function,
  IntType,
  Overload,
  StringType,
  type EnvOptions,
} from "../cel";
import { ListType, OptionalType } from "../checker/types";
import {
  ErrorValue,
  IntValue,
  ListValue,
  OptionalValue,
  StringValue,
  type Value,
} from "../interpreter/values";
import type { Extension } from "./extensions";

export class RegexExtension implements Extension {
  envOptions(): EnvOptions {
    return {
      functions: [
        new Function(
          "regex.extract",
          new Overload(
            "regex_extract_string_string",
            [StringType, StringType],
            new OptionalType(StringType),
            (lhs: Value, rhs: Value) => extractOne(lhs, rhs)
          )
        ),
        new Function(
          "regex.extractAll",
          new Overload(
            "regex_extractAll_string_string",
            [StringType, StringType],
            new ListType(StringType),
            (lhs: Value, rhs: Value) => extractAll(lhs, rhs)
          )
        ),
        new Function(
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
  if (!(target instanceof StringValue) || !(pattern instanceof StringValue)) {
    return ErrorValue.create("regex.extract expects string arguments");
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern.value());
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid regex";
    return ErrorValue.create(`invalid regex string: ${message}`);
  }
  const match = regex.exec(target.value());
  if (!match) {
    return OptionalValue.none();
  }
  if (match.length > 2) {
    return ErrorValue.create("multiple capture groups are not supported");
  }
  const out = match.length === 2 ? match[1] : match[0];
  return OptionalValue.of(StringValue.of(out ?? ""));
}

function extractAll(target: Value, pattern: Value): Value {
  if (!(target instanceof StringValue) || !(pattern instanceof StringValue)) {
    return ErrorValue.create("regex.extractAll expects string arguments");
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern.value(), "g");
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid regex";
    return ErrorValue.create(`invalid regex string: ${message}`);
  }

  const results: Value[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(target.value())) !== null) {
    if (match.length > 2) {
      return ErrorValue.create("multiple capture groups are not supported");
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
  if (!(target instanceof StringValue) || !(pattern instanceof StringValue) || !(replacement instanceof StringValue)) {
    return ErrorValue.create("regex.replace expects string arguments");
  }
  let limit = -1;
  if (count !== undefined) {
    if (!(count instanceof IntValue)) {
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
    return ErrorValue.create(`invalid regex string: ${message}`);
  }

  const replacementJs = replacement.value().replace(/\\([0-9])/g, "$$$1");
  if (limit < 0) {
    return StringValue.of(target.value().replace(regex, replacementJs));
  }

  let result = "";
  let lastIndex = 0;
  let applied = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(target.value())) !== null) {
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

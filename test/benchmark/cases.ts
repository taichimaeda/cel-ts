import { applyExtensions, StringsExtension } from "../../src";
import { type Env, type Program, PrimitiveTypes, Types, Variable } from "../../src/cel";

export type BenchCase = {
  name: string;
  expr: string;
  env: ConstructorParameters<typeof Env>[0];
  activation: Record<string, unknown>;
  program?: Program;
};

export const cases: BenchCase[] = [
  {
    name: "string_eq",
    expr: "string_value == 'value'",
    env: {
      variables: [new Variable("string_value", PrimitiveTypes.String)],
    },
    activation: { string_value: "value" },
  },
  {
    name: "string_neq",
    expr: "string_value != 'value'",
    env: {
      variables: [new Variable("string_value", PrimitiveTypes.String)],
    },
    activation: { string_value: "value" },
  },
  {
    name: "value_in_list_value",
    expr: "'value' in list_value",
    env: {
      variables: [new Variable("list_value", Types.list(PrimitiveTypes.String))],
    },
    activation: { list_value: ["a", "b", "c", "value"] },
  },
  {
    name: "value_not_in_list_value",
    expr: "!('value' in list_value)",
    env: {
      variables: [new Variable("list_value", Types.list(PrimitiveTypes.String))],
    },
    activation: { list_value: ["a", "b", "c", "d"] },
  },
  {
    name: "x_in_literal_list",
    expr: "x in ['a', 'b', 'c', 'd']",
    env: {
      variables: [new Variable("x", PrimitiveTypes.String)],
    },
    activation: { x: "c" },
  },
  {
    name: "x_not_in_literal_list",
    expr: "!(x in ['a', 'b', 'c', 'd'])",
    env: {
      variables: [new Variable("x", PrimitiveTypes.String)],
    },
    activation: { x: "e" },
  },
  {
    name: "x_in_list_value",
    expr: "x in list_value",
    env: {
      variables: [
        new Variable("x", PrimitiveTypes.String),
        new Variable("list_value", Types.list(PrimitiveTypes.String)),
      ],
    },
    activation: { x: "c", list_value: ["a", "b", "c", "d"] },
  },
  {
    name: "x_not_in_list_value",
    expr: "!(x in list_value)",
    env: {
      variables: [
        new Variable("x", PrimitiveTypes.String),
        new Variable("list_value", Types.list(PrimitiveTypes.String)),
      ],
    },
    activation: { x: "e", list_value: ["a", "b", "c", "d"] },
  },
  {
    name: "list_exists_contains",
    expr: "list_value.exists(e, e.contains('cd'))",
    env: {
      variables: [new Variable("list_value", Types.list(PrimitiveTypes.String))],
    },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
  {
    name: "list_exists_starts",
    expr: "list_value.exists(e, e.startsWith('cd'))",
    env: {
      variables: [new Variable("list_value", Types.list(PrimitiveTypes.String))],
    },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
  {
    name: "list_exists_matches",
    expr: "list_value.exists(e, e.matches('cd*'))",
    env: {
      variables: [new Variable("list_value", Types.list(PrimitiveTypes.String))],
    },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
  {
    name: "list_filter_matches",
    expr: "list_value.filter(e, e.matches('^cd+')) == ['cde']",
    env: {
      variables: [new Variable("list_value", Types.list(PrimitiveTypes.String))],
    },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
  {
    name: "string_format",
    expr: "'formatted list: %s, size: %d'.format([['abc', 'cde'], 2])",
    env: applyExtensions({}, new StringsExtension()),
    activation: {},
  },
];

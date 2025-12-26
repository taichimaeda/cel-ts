export type ProfileCase = {
  name: string;
  expr: string;
  environment?: Record<string, unknown>;
  activation: Record<string, unknown>;
};

const record = (entries: [string, unknown][]): Record<string, unknown> =>
  Object.fromEntries(entries);

export const cases: ProfileCase[] = [
  {
    name: "string_eq",
    expr: "string_value == 'value'",
    environment: record([["string_value", "string"]]),
    activation: record([["string_value", "value"]]),
  },
  {
    name: "string_neq",
    expr: "string_value != 'value'",
    environment: record([["string_value", "string"]]),
    activation: record([["string_value", "value"]]),
  },
  {
    name: "value_in_list_value",
    expr: "'value' in list_value",
    environment: record([["list_value", record([["list", "string"]])]]),
    activation: record([["list_value", ["a", "b", "c", "value"]]]),
  },
  {
    name: "value_not_in_list_value",
    expr: "!('value' in list_value)",
    environment: record([["list_value", record([["list", "string"]])]]),
    activation: record([["list_value", ["a", "b", "c", "d"]]]),
  },
  {
    name: "x_in_literal_list",
    expr: "x in ['a', 'b', 'c', 'd']",
    environment: record([["x", "string"]]),
    activation: record([["x", "c"]]),
  },
  {
    name: "x_not_in_literal_list",
    expr: "!(x in ['a', 'b', 'c', 'd'])",
    environment: record([["x", "string"]]),
    activation: record([["x", "e"]]),
  },
  {
    name: "x_in_list_value",
    expr: "x in list_value",
    environment: record([
      ["x", "string"],
      ["list_value", record([["list", "string"]])],
    ]),
    activation: record([
      ["x", "c"],
      ["list_value", ["a", "b", "c", "d"]],
    ]),
  },
  {
    name: "x_not_in_list_value",
    expr: "!(x in list_value)",
    environment: record([
      ["x", "string"],
      ["list_value", record([["list", "string"]])],
    ]),
    activation: record([
      ["x", "e"],
      ["list_value", ["a", "b", "c", "d"]],
    ]),
  },
  {
    name: "list_exists_contains",
    expr: "list_value.exists(e, e.contains('cd'))",
    environment: record([["list_value", record([["list", "string"]])]]),
    activation: record([["list_value", ["abc", "bcd", "cde", "def"]]]),
  },
  {
    name: "list_exists_starts",
    expr: "list_value.exists(e, e.startsWith('cd'))",
    environment: record([["list_value", record([["list", "string"]])]]),
    activation: record([["list_value", ["abc", "bcd", "cde", "def"]]]),
  },
  {
    name: "list_exists_matches",
    expr: "list_value.exists(e, e.matches('cd*'))",
    environment: record([["list_value", record([["list", "string"]])]]),
    activation: record([["list_value", ["abc", "bcd", "cde", "def"]]]),
  },
  {
    name: "list_filter_matches",
    expr: "list_value.filter(e, e.matches('^cd+')) == ['cde']",
    environment: record([["list_value", record([["list", "string"]])]]),
    activation: record([["list_value", ["abc", "bcd", "cde", "def"]]]),
  },
];

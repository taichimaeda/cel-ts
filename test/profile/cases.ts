export type ProfileCase = {
  name: string;
  expr: string;
  environment?: Record<string, unknown>;
  activation: Record<string, unknown>;
};

export const cases: ProfileCase[] = [
  {
    name: "string_eq",
    expr: "string_value == 'value'",
    environment: { string_value: "string" },
    activation: { string_value: "value" },
  },
  {
    name: "string_neq",
    expr: "string_value != 'value'",
    environment: { string_value: "string" },
    activation: { string_value: "value" },
  },
  {
    name: "value_in_list_value",
    expr: "'value' in list_value",
    environment: { list_value: { list: "string" } },
    activation: { list_value: ["a", "b", "c", "value"] },
  },
  {
    name: "value_not_in_list_value",
    expr: "!('value' in list_value)",
    environment: { list_value: { list: "string" } },
    activation: { list_value: ["a", "b", "c", "d"] },
  },
  {
    name: "x_in_literal_list",
    expr: "x in ['a', 'b', 'c', 'd']",
    environment: { x: "string" },
    activation: { x: "c" },
  },
  {
    name: "x_not_in_literal_list",
    expr: "!(x in ['a', 'b', 'c', 'd'])",
    environment: { x: "string" },
    activation: { x: "e" },
  },
  {
    name: "x_in_list_value",
    expr: "x in list_value",
    environment: { x: "string", list_value: { list: "string" } },
    activation: { x: "c", list_value: ["a", "b", "c", "d"] },
  },
  {
    name: "x_not_in_list_value",
    expr: "!(x in list_value)",
    environment: { x: "string", list_value: { list: "string" } },
    activation: { x: "e", list_value: ["a", "b", "c", "d"] },
  },
  {
    name: "list_exists_contains",
    expr: "list_value.exists(e, e.contains('cd'))",
    environment: { list_value: { list: "string" } },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
  {
    name: "list_exists_starts",
    expr: "list_value.exists(e, e.startsWith('cd'))",
    environment: { list_value: { list: "string" } },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
  {
    name: "list_exists_matches",
    expr: "list_value.exists(e, e.matches('cd*'))",
    environment: { list_value: { list: "string" } },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
  {
    name: "list_filter_matches",
    expr: "list_value.filter(e, e.matches('^cd+')) == ['cde']",
    environment: { list_value: { list: "string" } },
    activation: { list_value: ["abc", "bcd", "cde", "def"] },
  },
];

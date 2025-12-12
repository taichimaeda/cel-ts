# Examples

TypeScript translations of the `cel-go/examples` snippets are available under
this directory. Each example can be executed with `bun` (which ships with this
repo) or any TypeScript runner such as `tsx`/`ts-node`.

```
bun run examples/cel-eval.ts
```

## Available Examples

| File | Description |
| ---- | ----------- |
| `cel-eval.ts` | Basic expression compilation and evaluation using a string variable. |
| `cel-member-overload.ts` | Declares a custom member function via `MemberOverload` and invokes it as `i.greet(you)`. |
| `cel-global-overload.ts` | Defines a custom global function via `GlobalOverload` to demonstrate user defined CEL functions. |

These examples mirror the original Go versions in
[cel-go/examples](https://github.com/google/cel-go/tree/master/examples).

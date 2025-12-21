# Conformance Tests

This directory hosts CEL conformance suites based on the `cel-spec` repo.

## Running

```bash
pnpm conformance
```

The runner uses `protoc` to encode textproto fixtures before decoding them
with `protobufjs`, then executes supported tests against `cel-ts`.

## Notes

- The `test/conformance/cel-spec` submodule provides the CEL proto and testdata.
- The `test/conformance/cel-go` submodule supplies proto2/proto3 fixtures.
- The `test/conformance/protobuf` submodule provides Google well-known types.
- Some suites are skipped until protobuf-backed struct and enum support lands.
- Tests requiring error/unknown result matching are currently skipped.

## Sources

- `cel-spec/test/simple/testdata`: https://github.com/google/cel-spec/tree/master/test/simple/testdata
- `cel-spec/proto/cel/expr`: https://github.com/google/cel-spec/tree/master/proto/cel/expr
- `cel-go/test/proto2pb`: https://github.com/google/cel-go/tree/master/test/proto2pb
- `cel-go/test/proto3pb`: https://github.com/google/cel-go/tree/master/test/proto3pb
- `protobuf/src/google/protobuf`: https://github.com/protocolbuffers/protobuf/tree/main/src/google/protobuf

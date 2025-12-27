import { BytesType, Function as CelFunction, type EnvOptions, Overload, StringType } from "../api";
import {
  BytesValue,
  ErrorValue,
  StringValue,
  type Value,
  isBytesValue,
  isStringValue,
} from "../interpreter/values";
import { type Macro, ReceiverMacro } from "../parser";
import type { Extension } from "./extensions";
import { macroTargetMatchesNamespace } from "./utils";

/**
 * Encoders extension.
 * Provides base64.encode() and base64.decode() functions.
 */
export class EncodersExtension implements Extension {
  envOptions(): EnvOptions {
    const macros: Macro[] = [
      new ReceiverMacro("decode", 1, (helper, target, args) => {
        if (!macroTargetMatchesNamespace("base64", target)) {
          return undefined;
        }
        const [arg] = args;
        if (!arg) {
          return undefined;
        }
        return helper.createCall("base64.decode", arg);
      }),
      new ReceiverMacro("encode", 1, (helper, target, args) => {
        if (!macroTargetMatchesNamespace("base64", target)) {
          return undefined;
        }
        const [arg] = args;
        if (!arg) {
          return undefined;
        }
        return helper.createCall("base64.encode", arg);
      }),
    ];

    return {
      macros,
      functions: [
        new CelFunction(
          "base64.decode",
          new Overload("base64_decode_string", [StringType], BytesType, (arg: Value) => {
            if (!isStringValue(arg)) {
              return ErrorValue.typeMismatch("string", arg);
            }
            const decoded = decodeBase64(arg.value());
            return decoded;
          })
        ),
        new CelFunction(
          "base64.encode",
          new Overload("base64_encode_bytes", [BytesType], StringType, (arg: Value) => {
            if (!isBytesValue(arg)) {
              return ErrorValue.typeMismatch("bytes", arg);
            }
            const encoded = encodeBase64(arg.value());
            if (typeof encoded !== "string") {
              return encoded;
            }
            return StringValue.of(encoded);
          })
        ),
      ],
    };
  }
}

function decodeBase64(value: string): BytesValue | ErrorValue {
  try {
    if (typeof Buffer !== "undefined") {
      return BytesValue.of(new Uint8Array(Buffer.from(value, "base64")));
    }
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return BytesValue.of(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid base64 input";
    return ErrorValue.of(`base64.decode: ${message}`);
  }
}

function encodeBase64(value: Uint8Array): string | ErrorValue {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value).toString("base64");
    }
    let str = "";
    for (const byte of value) {
      str += String.fromCharCode(byte);
    }
    return btoa(str);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid bytes input";
    return ErrorValue.of(`base64.encode: ${message}`);
  }
}

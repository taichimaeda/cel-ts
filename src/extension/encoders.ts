import { BytesType, Function, Overload, StringType, type EnvOptions } from "../cel";
import { BytesValue, ErrorValue, StringValue, type Value } from "../interpreter/value";

type EncodersConfig = { version: number };
export type EncodersOption = (config: EncodersConfig) => void;

export function EncodersVersion(version: number): EncodersOption {
  return (config) => {
    config.version = version;
  };
}

export function Encoders(...options: EncodersOption[]): EnvOptions {
  const config: EncodersConfig = { version: Number.MAX_SAFE_INTEGER };
  for (const option of options) {
    option(config);
  }

  return {
    functions: [
      new Function(
        "base64.decode",
        new Overload("base64_decode_string", [StringType], BytesType, (arg: Value) => {
          if (!(arg instanceof StringValue)) {
            return ErrorValue.typeMismatch("string", arg);
          }
          const decoded = decodeBase64(arg.value());
          if (decoded instanceof ErrorValue) {
            return decoded;
          }
          return BytesValue.of(decoded);
        })
      ),
      new Function(
        "base64.encode",
        new Overload("base64_encode_bytes", [BytesType], StringType, (arg: Value) => {
          if (!(arg instanceof BytesValue)) {
            return ErrorValue.typeMismatch("bytes", arg);
          }
          const encoded = encodeBase64(arg.value());
          if (encoded instanceof ErrorValue) {
            return encoded;
          }
          return StringValue.of(encoded);
        })
      ),
    ],
  };
}

function decodeBase64(value: string): Uint8Array | ErrorValue {
  try {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(value, "base64"));
    }
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid base64 input";
    return ErrorValue.create(`base64.decode: ${message}`);
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
    return ErrorValue.create(`base64.encode: ${message}`);
  }
}

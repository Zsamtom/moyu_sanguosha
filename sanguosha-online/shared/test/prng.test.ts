import { describe, expect, it } from "vitest";

import { chacha20Block, randomInteger } from "../src/prng.js";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("ChaCha20 random stream", () => {
  it("matches the RFC 8439 block-function test vector", () => {
    const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    const nonce = "000000090000004a00000000";
    expect(toHex(chacha20Block(key, 1, nonce))).toBe(
      "10f1e7e4d13b5915500fdd1fa32071c4" +
        "c7d1f4c733c068030422aa9ac3d46c4e" +
        "d2826446079faa0914c2d705d98b02a2" +
        "b5129cd1de164eb9cbd083e8a2503c4e",
    );
  });

  it("is deterministic and advances the block counter", () => {
    const initial = { key: "ab".repeat(32), counter: 0 };
    const first = randomInteger(initial, 10);
    const repeated = randomInteger(initial, 10);
    const second = randomInteger(first.state, 10);

    expect(first).toEqual(repeated);
    expect(first.state.counter).toBeGreaterThan(initial.counter);
    expect(second.state.counter).toBeGreaterThan(first.state.counter);
  });
});

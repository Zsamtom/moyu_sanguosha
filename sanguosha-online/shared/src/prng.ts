const KEY_HEX_LENGTH = 64;
const NONCE_HEX_LENGTH = 24;
const ZERO_NONCE = "0".repeat(NONCE_HEX_LENGTH);
const MAX_COUNTER = 0xffff_ffff;

export interface ChaCha20State {
  /** 256-bit key encoded as exactly 64 lowercase hexadecimal characters. */
  readonly key: string;
  /** Next ChaCha20 block counter. */
  readonly counter: number;
}

function assertHex(value: string, expectedLength: number, label: string): void {
  if (value.length !== expectedLength || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error(`${label} must be exactly ${expectedLength} hexadecimal characters.`);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function add(left: number, right: number): number {
  return (left + right) >>> 0;
}

function quarterRound(state: number[], a: number, b: number, c: number, d: number): void {
  state[a] = add(state[a]!, state[b]!);
  state[d] = rotateLeft((state[d]! ^ state[a]!) >>> 0, 16);
  state[c] = add(state[c]!, state[d]!);
  state[b] = rotateLeft((state[b]! ^ state[c]!) >>> 0, 12);
  state[a] = add(state[a]!, state[b]!);
  state[d] = rotateLeft((state[d]! ^ state[a]!) >>> 0, 8);
  state[c] = add(state[c]!, state[d]!);
  state[b] = rotateLeft((state[b]! ^ state[c]!) >>> 0, 7);
}

/**
 * Returns one RFC 8439 ChaCha20 block. This low-level export exists so the
 * implementation can be checked against published test vectors.
 */
export function chacha20Block(
  keyHex: string,
  counter: number,
  nonceHex = ZERO_NONCE,
): Uint8Array {
  assertHex(keyHex, KEY_HEX_LENGTH, "ChaCha20 key");
  assertHex(nonceHex, NONCE_HEX_LENGTH, "ChaCha20 nonce");
  if (!Number.isSafeInteger(counter) || counter < 0 || counter > MAX_COUNTER) {
    throw new Error("ChaCha20 counter must be an unsigned 32-bit integer.");
  }

  const key = hexToBytes(keyHex);
  const nonce = hexToBytes(nonceHex);
  const initial = [
    0x6170_7865,
    0x3320_646e,
    0x7962_2d32,
    0x6b20_6574,
    ...Array.from({ length: 8 }, (_, index) => readUint32Le(key, index * 4)),
    counter,
    readUint32Le(nonce, 0),
    readUint32Le(nonce, 4),
    readUint32Le(nonce, 8),
  ];
  const working = [...initial];

  for (let round = 0; round < 10; round += 1) {
    quarterRound(working, 0, 4, 8, 12);
    quarterRound(working, 1, 5, 9, 13);
    quarterRound(working, 2, 6, 10, 14);
    quarterRound(working, 3, 7, 11, 15);
    quarterRound(working, 0, 5, 10, 15);
    quarterRound(working, 1, 6, 11, 12);
    quarterRound(working, 2, 7, 8, 13);
    quarterRound(working, 3, 4, 9, 14);
  }

  const output = new Uint8Array(64);
  for (let index = 0; index < 16; index += 1) {
    writeUint32Le(output, index * 4, add(working[index]!, initial[index]!));
  }
  return output;
}

export function normalizeChaCha20Key(seed: string): string {
  assertHex(seed, KEY_HEX_LENGTH, "Game seed");
  return seed.toLowerCase();
}

function nextUint32(state: ChaCha20State): { value: number; state: ChaCha20State } {
  if (state.counter > MAX_COUNTER) {
    throw new Error("ChaCha20 random stream exhausted.");
  }
  const block = chacha20Block(state.key, state.counter);
  return {
    value: readUint32Le(block, 0),
    state: { key: state.key, counter: state.counter + 1 },
  };
}

/** Draws an unbiased integer in [0, upperExclusive). */
export function randomInteger(
  state: ChaCha20State,
  upperExclusive: number,
): { value: number; state: ChaCha20State } {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0 || upperExclusive > 0x1_0000_0000) {
    throw new Error("Random integer upper bound is invalid.");
  }
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / upperExclusive) * upperExclusive;
  let current = state;
  while (true) {
    const generated = nextUint32(current);
    current = generated.state;
    if (generated.value < limit) {
      return { value: generated.value % upperExclusive, state: current };
    }
  }
}

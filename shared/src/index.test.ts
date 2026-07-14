import { describe, expect, it } from "vitest";
import { DEFAULT_PORT, PROTOCOL_VERSION } from "./index";

describe("protocol constants", () => {
  it("exposes a stable default port", () => {
    expect(DEFAULT_PORT).toBe(4823);
  });

  it("exposes a positive integer protocol version", () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});

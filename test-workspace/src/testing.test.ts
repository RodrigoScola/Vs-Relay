import { describe, expect, it } from "vitest";

describe("Testing Suite", () => {
  it("returns true", () => {
    expect(true).toBe(true);
  });

  it("returns false", () => {
    expect(false).toBe(false);
  });

  it("adds two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  it("knows strings concatenate", () => {
    expect("foo" + "bar").toBe("foobar");
  });

  it("knows an empty array has length 0", () => {
    expect([].length).toBe(0);
  });
});

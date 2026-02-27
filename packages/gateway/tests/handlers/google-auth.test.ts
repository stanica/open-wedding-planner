import { describe, it, expect } from "vitest";

describe("google-auth handlers", () => {
  it("exports registerGoogleAuthHandlers function", async () => {
    const { registerGoogleAuthHandlers } = await import(
      "../../src/handlers/google-auth.js"
    );
    expect(typeof registerGoogleAuthHandlers).toBe("function");
  });
});

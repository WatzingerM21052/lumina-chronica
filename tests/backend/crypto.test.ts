import { describe, expect, it } from "vitest";
import { hmacSha256Hex, randomNumericCode } from "../../backend/src/utils/crypto";

describe("randomNumericCode", () => {
    // The rejection-sampling loop only exercises its retry branch on ~2.3%
    // of individual bytes, so a handful of calls could pass by luck even if
    // someone "simplified" the while into an if and silently started
    // returning short codes. Run enough iterations that a length regression
    // can't hide in the noise.
    it("always returns exactly `length` digits, even across many draws", () => {
        for (let i = 0; i < 2000; i++) {
            const code = randomNumericCode(6);
            expect(code).toMatch(/^\d{6}$/);
        }
    });

    it("supports a non-default length", () => {
        for (let i = 0; i < 200; i++) {
            expect(randomNumericCode(4)).toMatch(/^\d{4}$/);
        }
    });
});

describe("hmacSha256Hex", () => {
    it("throws on an empty secret rather than silently hashing with nothing", async () => {
        await expect(hmacSha256Hex("", "123456")).rejects.toThrow();
    });

    it("is deterministic for the same secret and value", async () => {
        const a = await hmacSha256Hex("secret", "123456");
        const b = await hmacSha256Hex("secret", "123456");
        expect(a).toBe(b);
    });

    it("differs when the secret differs", async () => {
        const a = await hmacSha256Hex("secret-a", "123456");
        const b = await hmacSha256Hex("secret-b", "123456");
        expect(a).not.toBe(b);
    });
});

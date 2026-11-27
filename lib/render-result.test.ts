import { describe, expect, it } from "vitest";
import { renderResult } from "./render-result.js";

describe("debugger result rendering", () => {
  it("caps oversized debugger output with explicit truncation metadata", () => {
    const rendered = JSON.parse(renderResult({ output: "x".repeat(300_000) })) as {
      truncated: boolean;
      originalCharacters: number;
      preview: string;
    };

    expect(rendered.truncated).toBe(true);
    expect(rendered.originalCharacters).toBeGreaterThan(300_000);
    expect(rendered.preview.length).toBe(256 * 1024);
  });
});

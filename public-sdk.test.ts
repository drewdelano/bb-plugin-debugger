import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

describe("public plugin SDK boundary", () => {
  it("uses only public Cloudroom APIs and declared dependencies", () => {
    const scan = experimental_scanPublicSdkOnly(process.cwd(), {
      allow: [
        /^@debugmcp\/mcp-debugger(?:\/.*)?$/,
        /^@modelcontextprotocol\/sdk(?:\/.*)?$/,
        /^vitest$/,
      ],
    });

    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });
});

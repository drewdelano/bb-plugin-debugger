import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const target = z
  .object({
    threadId: z.string().min(1),
    workspacePath: z.string().min(1),
    enginePath: z.string().min(1).nullable(),
  })
  .strict();

export const hostContract = defineRpcContract({
  doctor: {
    input: target,
    output: z
      .object({
        engineVersion: z.string(),
        tools: z.array(z.string()),
        languages: jsonValue,
      })
      .strict(),
  },
  callTool: {
    input: target.extend({
      tool: z.string().min(1),
      arguments: z.record(z.string(), jsonValue),
    }),
    output: jsonValue,
  },
  closeThread: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({ closed: z.boolean() }).strict(),
  },
});

export type DebuggerTarget = z.infer<typeof target>;

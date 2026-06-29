import { type CallToolResult, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"

export function jsonToolResult(value: unknown, isError = false): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
    isError,
  }
}

export function parseToolResult(value: unknown): CallToolResult {
  return CallToolResultSchema.parse(value)
}

export function firstText(result: CallToolResult): string {
  for (const item of result.content) {
    if (item.type === "text") {
      return item.text
    }
  }
  return ""
}

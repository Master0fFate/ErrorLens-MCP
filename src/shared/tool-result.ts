import { type CallToolResult, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"

export function jsonToolResult(value: unknown, isError = false): CallToolResult {
  const structuredContent = asStructuredContent(value)
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
    isError,
    ...(structuredContent === null ? {} : { structuredContent }),
  }
}

function asStructuredContent(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

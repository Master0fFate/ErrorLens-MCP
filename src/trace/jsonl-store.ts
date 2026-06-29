import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname } from "node:path"
import { type TraceRecord, TraceRecordSchema } from "./trace-model.js"

export class JsonlTraceStore {
  readonly path: string
  readonly enabled: boolean

  constructor(path: string, enabled: boolean) {
    this.path = path
    this.enabled = enabled
  }

  async append(record: TraceRecord): Promise<void> {
    if (!this.enabled) {
      return
    }
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, `${JSON.stringify(record)}\n`, "utf8")
  }

  async readAll(): Promise<readonly TraceRecord[]> {
    const content = await readTextIfExists(this.path)
    if (content.length === 0) {
      return []
    }
    const records: TraceRecord[] = []
    for (const line of content.split(/\r?\n/u)) {
      if (line.trim().length === 0) {
        continue
      }
      records.push(TraceRecordSchema.parse(JSON.parse(line)))
    }
    return records
  }

  async find(traceId: string): Promise<TraceRecord | null> {
    const records = await this.readAll()
    return records.find((record) => record.trace_id === traceId) ?? null
  }
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return ""
    }
    throw error
  }
}

function nodeErrorCode(error: unknown): string | null {
  if (error instanceof Error && "code" in error) {
    const code = error.code
    return typeof code === "string" ? code : null
  }
  return null
}

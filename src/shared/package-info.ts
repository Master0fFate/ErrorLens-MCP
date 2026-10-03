import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Implementation } from "@modelcontextprotocol/server"
import { z } from "zod"

export const PACKAGE_NAME = "mcp-errorlens"
export const PROJECT_URL = "https://github.com/Master0fFate/ErrorLens-MCP"

const PackageManifestSchema = z.object({
  name: z.literal(PACKAGE_NAME),
  version: z.string().min(1),
  description: z.string().default("Structured error recovery for MCP agents."),
  homepage: z.string().default(`${PROJECT_URL}#readme`),
})

export type PackageInfo = z.infer<typeof PackageManifestSchema>

const FALLBACK_INFO: PackageInfo = {
  name: PACKAGE_NAME,
  version: "0.0.0-unknown",
  description: "Structured error recovery for MCP agents.",
  homepage: `${PROJECT_URL}#readme`,
}

let cachedInfo: PackageInfo | undefined

/**
 * Package metadata read once from the nearest `package.json` that belongs to
 * this package. Works from `dist/`, from `dist-tests/`, and from a global
 * install, so server and client identities always report the real version.
 */
export function packageInfo(): PackageInfo {
  cachedInfo ??= readPackageInfo(dirname(fileURLToPath(import.meta.url)))
  return cachedInfo
}

export function readPackageInfo(startDirectory: string): PackageInfo {
  const manifest = parseManifest(join(startDirectory, "package.json"))
  if (manifest !== null) {
    return manifest
  }
  const parent = dirname(startDirectory)
  return parent === startDirectory ? FALLBACK_INFO : readPackageInfo(parent)
}

export function implementationInfo(name: string, description?: string): Implementation {
  const info = packageInfo()
  return {
    name,
    version: info.version,
    websiteUrl: info.homepage,
    description: description ?? info.description,
  }
}

function parseManifest(path: string): PackageInfo | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed = PackageManifestSchema.safeParse(JSON.parse(readFileSync(path, "utf8")))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

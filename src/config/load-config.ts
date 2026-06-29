import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { defaultConfig, type ErrorLensConfig, ErrorLensConfigSchema } from "./config-model.js"

const ENV_REF_PATTERN = /\$\{([A-Z0-9_]+)\}/giu

export async function loadConfig(configPath: string): Promise<ErrorLensConfig> {
  const raw = await readFile(configPath, "utf8")
  const interpolated = interpolateEnvRefs(raw)
  return ErrorLensConfigSchema.parse(parseYaml(interpolated))
}

export async function writeDefaultConfig(targetDir: string): Promise<string> {
  await mkdir(targetDir, { recursive: true })
  await mkdir(resolve(targetDir, "rules"), { recursive: true })
  const tracePath = resolve(targetDir, "traces.jsonl")
  const configPath = resolve(targetDir, "config.yaml")
  const config = defaultConfig(tracePath)
  await writeFile(configPath, stringifyYaml(config), "utf8")
  await writeFile(tracePath, "", { flag: "a", encoding: "utf8" })
  return configPath
}

export function resolveConfigRelative(configPath: string, maybeRelativePath: string): string {
  return resolve(dirname(configPath), maybeRelativePath)
}

function interpolateEnvRefs(content: string): string {
  return content.replace(ENV_REF_PATTERN, (_match, name: string) => process.env[name] ?? "")
}

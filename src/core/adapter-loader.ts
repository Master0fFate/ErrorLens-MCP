import { readFile } from "node:fs/promises"
import type { ErrorLensConfig } from "../config/config-model.js"
import { resolveConfigRelative } from "../config/load-config.js"
import { type AdapterRule, parseAdapterRules } from "./adapters.js"

export async function loadConfiguredAdapterRules(
  configPath: string,
  config: ErrorLensConfig,
): Promise<readonly AdapterRule[]> {
  const configuredPaths = [
    ...config.rules.custom_paths,
    ...Object.values(config.servers).flatMap((server) => server.adapter_rules),
  ]
  const rules: AdapterRule[] = []

  for (const configuredPath of configuredPaths) {
    const rulePath = resolveConfigRelative(configPath, configuredPath)
    const content = await readFile(rulePath, "utf8")
    rules.push(...parseAdapterRules(content))
  }

  return rules
}

import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { delimiter, isAbsolute, join, resolve } from "node:path"

type CommandEnvironment = Readonly<Record<string, string | undefined>>

export async function commandAvailable(
  command: string,
  environment: CommandEnvironment = process.env,
): Promise<boolean> {
  for (const candidate of commandCandidates(command, environment)) {
    if (await canExecute(candidate)) {
      return true
    }
  }
  return false
}

export function commandCandidates(
  command: string,
  environment: CommandEnvironment = process.env,
): readonly string[] {
  if (isPathLike(command)) {
    const commandPath = isAbsolute(command) ? command : resolve(command)
    return executableVariants(commandPath, environment)
  }

  const pathValue = environmentValue(environment, "PATH") ?? ""
  return pathValue
    .split(delimiter)
    .filter((directory) => directory.length > 0)
    .flatMap((directory) => executableVariants(join(directory, command), environment))
}

function executableVariants(
  commandPath: string,
  environment: CommandEnvironment,
): readonly string[] {
  if (process.platform !== "win32") {
    return [commandPath]
  }

  const extensions = windowsPathExtensions(environment)
  const loweredPath = commandPath.toLowerCase()
  if (extensions.some((extension) => loweredPath.endsWith(extension.toLowerCase()))) {
    return [commandPath]
  }
  return extensions.map((extension) => `${commandPath}${extension.toLowerCase()}`)
}

function windowsPathExtensions(environment: CommandEnvironment): readonly string[] {
  const pathExtValue = environmentValue(environment, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD"
  return pathExtValue
    .split(";")
    .map((extension) => extension.trim())
    .filter((extension) => extension.length > 0)
}

function environmentValue(environment: CommandEnvironment, key: string): string | undefined {
  const exact = environment[key]
  if (exact !== undefined) {
    return exact
  }
  const loweredKey = key.toLowerCase()
  for (const [name, value] of Object.entries(environment)) {
    if (name.toLowerCase() === loweredKey) {
      return value
    }
  }
  return undefined
}

function isPathLike(command: string): boolean {
  return command.includes("/") || command.includes("\\")
}

async function canExecute(commandPath: string): Promise<boolean> {
  try {
    await access(commandPath, constants.X_OK)
    return true
  } catch (error) {
    if (error instanceof Error) {
      return false
    }
    throw error
  }
}

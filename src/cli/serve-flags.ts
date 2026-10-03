import type { Command } from "commander"
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PATH,
  DEFAULT_HTTP_PORT,
  type RawServeOptions,
  resolveServeOptions,
  type ServeOptions,
} from "../shared/serve-options.js"

/** Adds the shared `--transport/--host/--port/--path` flags to a server command. */
export function addServeFlags(command: Command): Command {
  return command
    .option("--transport <transport>", "stdio or http", "stdio")
    .option("--host <host>", "bind address for the http transport", DEFAULT_HTTP_HOST)
    .option(
      "--port <port>",
      "port for the http transport; 0 picks a free port",
      String(DEFAULT_HTTP_PORT),
    )
    .option("--path <path>", "endpoint path for the http transport", DEFAULT_HTTP_PATH)
    .option("--allowed-host <host...>", "extra Host header values accepted over http")
    .option("--allowed-origin <origin...>", "browser origins accepted over http")
}

export function serveOptionsFromFlags(flags: RawServeOptions): ServeOptions {
  return resolveServeOptions(flags)
}

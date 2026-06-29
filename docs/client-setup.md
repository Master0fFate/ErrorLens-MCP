# Client Setup

Use absolute paths in MCP client configuration.

```json
{
  "mcpServers": {
    "errorlens": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-errorlens/dist/companion/diagnostic-server.js"]
    }
  }
}
```

For proxy mode, point the client at:

```json
{
  "mcpServers": {
    "errorlens-proxy": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-errorlens/dist/proxy/proxy-server.js",
        "--config",
        "/absolute/path/to/.errorlens/config.yaml"
      ]
    }
  }
}
```

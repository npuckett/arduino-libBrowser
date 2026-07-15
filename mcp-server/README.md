# arduino-libraries-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that lets AI
agents search the **Arduino Library Manager** catalog (~9,600 libraries).

Agents call the `search_libraries` tool with a natural-language query and get back a
ranked list of candidate libraries — each with version, category, architectures, GitHub
stars, dependencies, and a ready-to-paste install snippet:

```
• U8g2 (v2.35.31) — Display · ⭐ 5210 · esp32, avr, samd, ...
  Monochrome LCD, OLED and eInk support for both 8-bit and 32-bit processors.
  Install: arduino-cli lib install "U8g2"
```

The server fetches the enriched library index from
[thearduinolibrary.com](https://thearduinolibrary.com/output/libraries.json) (updated
hourly) and caches it in memory for one hour, so it runs on any machine without a local
copy of the data pipeline.

## Tools

### `search_libraries`

| Parameter       | Type   | Required | Description                                                                 |
| --------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `query`         | string | yes      | Search terms, e.g. `"oled display"`, `"wifi"`, `"stepper motor"`            |
| `category`      | string | no       | Exact category, e.g. `Sensors`, `Display`, `Communication`                  |
| `architecture`  | string | no       | Platform, e.g. `esp32`, `avr`, `rp2040`, `samd`                             |
| `min_stars`     | number | no       | Minimum GitHub stars — surface popular, well-maintained libraries           |
| `limit`         | number | no       | Max results (default 20, capped at 100)                                     |

## Develop

```bash
pnpm install
pnpm --filter arduino-libraries-mcp build      # compile to dist/
pnpm --filter arduino-libraries-mcp dev         # run via tsx (no build needed)
```

### Pointing at a different data source

By default the server fetches the live site. Override via environment variables — useful
for developing against a local instance of the site (`node scripts/serve.mjs`):

| Variable            | Default                                              | Purpose                                  |
| ------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `ARDUINO_LIB_URL`   | `https://thearduinolibrary.com/output/libraries.json` | Fetch from this URL instead              |
| `ARDUINO_LIB_FILE`  | _(unset)_                                            | Load from a local file path instead      |
| `ARDUINO_LIB_TTL`   | `3600`                                               | Cache TTL in seconds                     |

## Configure your client

### ZCode

Add to your MCP servers config (user or workspace scope):

```json
{
  "mcpServers": {
    "arduino-libraries": {
      "command": "node",
      "args": ["/absolute/path/to/arduino-libBrowser/mcp-server/dist/index.js"]
    }
  }
}
```

For local development without building:

```json
{
  "mcpServers": {
    "arduino-libraries": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/arduino-libBrowser/mcp-server/src/index.ts"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arduino-libraries": {
      "command": "node",
      "args": ["/absolute/path/to/arduino-libBrowser/mcp-server/dist/index.js"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` (or via *Settings → MCP*):

```json
{
  "mcpServers": {
    "arduino-libraries": {
      "command": "node",
      "args": ["/absolute/path/to/arduino-libBrowser/mcp-server/dist/index.js"]
    }
  }
}
```

## Data source

The index is the enriched `libraries.json` produced by the
[arduino-libBrowser](https://github.com/npmac/arduino-libBrowser) pipeline, which
ingests Arduino's official registry, enriches entries with GitHub metadata, and republishes
hourly. See the main project's `docs/ARCHITECTURE.md` for the full pipeline.

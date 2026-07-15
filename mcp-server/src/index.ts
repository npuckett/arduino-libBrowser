#!/usr/bin/env node
/**
 * Arduino Libraries MCP Server
 *
 * Exposes a `search_libraries` tool so any MCP-compatible agent (ZCode, Claude
 * Desktop, Cursor, …) can search the Arduino Library Manager catalog and get a
 * ranked, concise list of candidate libraries — each with a ready-to-paste
 * `arduino-cli lib install` snippet.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadLibraries } from './data.js';
import { searchLibraries, didYouMean } from './search.js';
import type { Library } from './types.js';

const server = new McpServer({
  name: 'arduino-libraries',
  version: '0.1.0',
});

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

function formatResult(lib: Library): string {
  const stars = lib.github_stars != null ? ` · ⭐ ${lib.github_stars}` : '';
  const archs = lib.architectures?.length ? ` · ${lib.architectures.join(', ')}` : '';
  const desc = lib.sentence?.trim() || lib.paragraph?.trim() || '(no description)';
  const lines = [
    `• ${lib.name} (v${lib.version}) — ${lib.category}${stars}${archs}`,
    `  ${desc}`,
    `  Install: arduino-cli lib install "${lib.name}"`,
  ];
  if (lib.depends?.length) {
    lines.push(`  Depends on: ${lib.depends.join(', ')}`);
  }
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* Tool: search_libraries                                                     */
/* -------------------------------------------------------------------------- */

server.registerTool(
  'search_libraries',
  {
    title: 'Search Arduino libraries',
    description: [
      'Search the Arduino Library Manager catalog (~9,600 libraries) for libraries',
      'matching a text query across name, description, and category. Returns a ranked',
      'list with version, category, architectures, stars, an install snippet, and any',
      'dependencies. Supports optional filters by category, architecture, and minimum',
      'GitHub stars.',
    ].join(' '),
    inputSchema: {
      query: z.string().describe('Search terms, e.g. "oled display", "wifi", "stepper motor"'),
      category: z
        .string()
        .optional()
        .describe('Exact category filter, e.g. "Sensors", "Display", "Communication"'),
      architecture: z
        .string()
        .optional()
        .describe('Platform filter, e.g. "esp32", "avr", "rp2040", "samd"'),
      min_stars: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Minimum GitHub stars; use to surface popular, well-maintained libraries'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results to return (default 20)'),
    },
  },
  async (args) => {
    const { query, category, architecture, min_stars, limit } = args;

    let libraries: Library[];
    try {
      libraries = await loadLibraries();
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Could not load the Arduino libraries index: ${(err as Error).message}`,
          },
        ],
      };
    }

    const results = searchLibraries(libraries, {
      query,
      category,
      architecture,
      minStars: min_stars,
      limit,
    });

    if (results.length === 0) {
      const suggestion = didYouMean(query, libraries);
      const hint = suggestion
        ? `Did you mean "${suggestion}"? `
        : '';
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `No libraries matched "${query}".` +
              (hint ? ` ${hint}` : '') +
              ` Try broader terms, fewer filters, or browse categories like ` +
              `Sensors, Display, Communication, Device Control, or Data Storage.`,
          },
        ],
      };
    }

    const header =
      `Found ${results.length} librar${results.length === 1 ? 'y' : 'ies'} ` +
      `for "${query}"` +
      (category ? ` in ${category}` : '') +
      (architecture ? ` on ${architecture}` : '') +
      `:\n\n`;
    const body = results.map(formatResult).join('\n\n');
    return { content: [{ type: 'text' as const, text: header + body }] };
  }
);

/* -------------------------------------------------------------------------- */
/* Startup                                                                     */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // MCP servers must log errors to stderr — stdout is reserved for the protocol.
  console.error('Fatal error starting arduino-libraries MCP server:', err);
  process.exit(1);
});

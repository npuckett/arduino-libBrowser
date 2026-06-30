import pino from 'pino';

const logger = pino({ name: 'library-properties', level: 'info' });

const KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export interface ParseLibraryPropertiesOptions {
  logger?: pino.Logger;
}

export function parseLibraryProperties(
  text: string,
  options: ParseLibraryPropertiesOptions = {}
): Record<string, string> {
  const log = options.logger ?? logger;
  const result: Record<string, string> = {};

  if (!text) {
    return result;
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');

  const joinedLines: string[] = [];
  let buffer = '';
  for (const line of rawLines) {
    if (line.endsWith('\\')) {
      buffer += line.slice(0, -1) + '\n';
    } else {
      buffer += line;
      joinedLines.push(buffer);
      buffer = '';
    }
  }
  if (buffer.length > 0) {
    joinedLines.push(buffer);
  }

  for (const rawLine of joinedLines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    if (line.startsWith('#')) {
      continue;
    }

    const eq = line.indexOf('=');
    if (eq <= 0) {
      log.warn(
        { line: rawLine },
        'skipping line without key=value assignment'
      );
      continue;
    }

    const rawKey = line.slice(0, eq).trim();
    if (!KEY_PATTERN.test(rawKey)) {
      log.warn(
        { key: rawKey, line: rawLine },
        'rejecting malformed key (must match /^[a-zA-Z_][a-zA-Z0-9_-]*$/)'
      );
      continue;
    }

    let value = line.slice(eq + 1);
    value = stripQuotedValue(value);
    value = value.trim();

    result[rawKey] = value;
  }

  return result;
}

function stripQuotedValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (first === '"' && last === '"') {
    return trimmed.slice(1, -1);
  }
  if (first === "'" && last === "'") {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
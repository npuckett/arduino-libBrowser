import { gunzipSync } from 'node:zlib';

export interface ConditionalGetOptions {
  etag?: string;
  lastModified?: string;
  token?: string;
  acceptEncoding?: string;
  timeoutMs?: number;
}

export interface ConditionalGetResult {
  status: 200 | 304 | 404;
  headers: Record<string, string>;
  body?: Uint8Array;
  etag?: string;
  lastModified?: string;
}

function headerMap(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export async function conditionalGet(
  url: string,
  options: ConditionalGetOptions = {}
): Promise<ConditionalGetResult> {
  const {
    etag,
    lastModified,
    token,
    acceptEncoding,
    timeoutMs = 15000,
  } = options;

  const headers: Record<string, string> = {
    'User-Agent': 'arduino-libBrowser-pipeline/2.0',
    Accept: 'application/json',
  };

  if (acceptEncoding) {
    headers['Accept-Encoding'] = acceptEncoding;
  }

  if (etag) {
    headers['If-None-Match'] = etag;
  }
  if (lastModified) {
    headers['If-Modified-Since'] = lastModified;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const responseHeaders = headerMap(response.headers);
  const responseEtag = responseHeaders['etag'];
  const responseLastModified = responseHeaders['last-modified'];

  if (response.status === 304) {
    return {
      status: 304,
      headers: responseHeaders,
      etag: responseEtag ?? etag,
      lastModified: responseLastModified ?? lastModified,
    };
  }

  if (response.status === 404) {
    return {
      status: 404,
      headers: responseHeaders,
      etag: responseEtag,
      lastModified: responseLastModified,
    };
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${url}`
    );
  }

  const buffer = new Uint8Array(await response.arrayBuffer());

  return {
    status: 200,
    headers: responseHeaders,
    body: buffer,
    etag: responseEtag,
    lastModified: responseLastModified,
  };
}

export async function fetchArduinoIndexGz(
  url: string,
  options: ConditionalGetOptions = {}
): Promise<ConditionalGetResult> {
  const merged: ConditionalGetOptions = {
    ...options,
    acceptEncoding: 'gzip, identity',
  };

  const result = await conditionalGet(url, merged);

  if (result.status !== 200 || !result.body) {
    return result;
  }

  const contentEncoding = result.headers['content-encoding'];
  const isGzipped =
    contentEncoding?.toLowerCase() === 'gzip' ||
    url.endsWith('.gz') ||
    (result.body.length >= 2 && result.body[0] === 0x1f && result.body[1] === 0x8b);

  if (!isGzipped) {
    return result;
  }

  try {
    const decompressed = gunzipSync(result.body);
    return {
      ...result,
      body: new Uint8Array(decompressed),
      headers: {
        ...result.headers,
        'content-encoding': 'identity',
        'content-length': String(decompressed.length),
      },
    };
  } catch (err) {
    throw new Error(
      `Failed to decompress gzip response from ${url}: ${(err as Error).message}`
    );
  }
}

export function parseJsonBody<T>(body: Uint8Array | undefined): T {
  if (!body) {
    throw new Error('Cannot parse empty body');
  }
  const text = new TextDecoder('utf-8').decode(body);
  return JSON.parse(text) as T;
}
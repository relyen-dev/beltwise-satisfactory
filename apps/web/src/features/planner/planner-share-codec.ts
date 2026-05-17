export const BELTWISE_PLAN_SHARE_CODE_PREFIX = 'bw1.';
export const BELTWISE_PLAN_SHARE_FRAGMENT_KEY = 'plan';

const SHARE_COMPRESSION_FORMAT = 'deflate';

export class PlannerShareCodeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PlannerShareCodeError';
  }
}

export async function encodePlannerShareCode(payload: unknown): Promise<string> {
  const json = JSON.stringify(payload);
  const compressed = await compressBytes(new TextEncoder().encode(json));
  return `${BELTWISE_PLAN_SHARE_CODE_PREFIX}${bytesToBase64Url(compressed)}`;
}

export async function decodePlannerShareCode(value: string): Promise<unknown> {
  const code = normalizePlannerShareCode(value);
  if (!code.startsWith(BELTWISE_PLAN_SHARE_CODE_PREFIX)) {
    throw new PlannerShareCodeError('Paste a Beltwise plan link or code.');
  }

  const encodedPayload = code.slice(BELTWISE_PLAN_SHARE_CODE_PREFIX.length);
  if (!encodedPayload) {
    throw new PlannerShareCodeError('That Beltwise plan code is empty.');
  }

  let json: string;
  try {
    const compressed = base64UrlToBytes(encodedPayload);
    json = new TextDecoder().decode(await decompressBytes(compressed));
  } catch {
    throw new PlannerShareCodeError('That Beltwise plan code could not be decoded.');
  }

  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new PlannerShareCodeError('That Beltwise plan code does not contain valid JSON.');
  }
}

export function createPlannerShareUrl(code: string, href = globalThis.location?.href ?? ''): string {
  const url = new URL(href);
  const params = readHashParams(url.hash);
  params.set(BELTWISE_PLAN_SHARE_FRAGMENT_KEY, code);
  url.hash = params.toString();
  return url.toString();
}

export function readPlannerShareCodeFromLocation(
  location: Location | undefined = globalThis.location,
): string | null {
  if (!location) {
    return null;
  }
  return readPlannerShareCodeFromHash(location.hash);
}

export function clearPlannerShareCodeFromLocation(
  location: Location | undefined = globalThis.location,
  history: History | undefined = globalThis.history,
): void {
  if (!location || !history || !readPlannerShareCodeFromHash(location.hash)) {
    return;
  }

  const url = new URL(location.href);
  const params = readHashParams(url.hash);
  params.delete(BELTWISE_PLAN_SHARE_FRAGMENT_KEY);
  url.hash = params.toString();
  history.replaceState(history.state, '', url.toString());
}

function normalizePlannerShareCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const urlCode = readPlannerShareCodeFromUrl(trimmed);
  return urlCode ?? trimmed;
}

function readPlannerShareCodeFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return readPlannerShareCodeFromHash(url.hash) ?? url.searchParams.get(BELTWISE_PLAN_SHARE_FRAGMENT_KEY);
  } catch {
    return null;
  }
}

function readPlannerShareCodeFromHash(hash: string): string | null {
  const params = readHashParams(hash);
  return params.get(BELTWISE_PLAN_SHARE_FRAGMENT_KEY);
}

function readHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

async function compressBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (!('CompressionStream' in globalThis)) {
    throw new PlannerShareCodeError('This browser does not support compressed plan links.');
  }

  return transformBytes(bytes, new CompressionStream(SHARE_COMPRESSION_FORMAT));
}

async function decompressBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (!('DecompressionStream' in globalThis)) {
    throw new PlannerShareCodeError('This browser does not support compressed plan links.');
  }

  return transformBytes(bytes, new DecompressionStream(SHARE_COMPRESSION_FORMAT));
}

async function transformBytes(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const transformed = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(transformed).arrayBuffer());
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '=',
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

const APPLICATION_UPDATE_ERROR_PATTERNS: readonly RegExp[] = [
  /\bChunkLoadError\b/i,
  /\bLoading chunk [\w.-]+ failed\b/i,
  /\bFailed to fetch dynamically imported module\b/i,
  /\berror loading dynamically imported module\b/i,
  /\bImporting a module script failed\b/i,
  /\bFailed to load module script\b/i,
  /\bdynamically imported module\b/i,
  /\bUnable to preload CSS\b/i,
];

const ERROR_TEXT_FIELDS = ['name', 'message', 'code', 'type', 'src', 'href', 'request'] as const;
const NESTED_ERROR_FIELDS = ['cause', 'error', 'originalError', 'reason', 'rejection'] as const;

type UnknownRecord = Record<string, unknown>;

export function isApplicationUpdateError(error: unknown): boolean {
  const texts = collectErrorText(error, new Set<UnknownRecord>());

  return texts.some((text) => {
    return (
      APPLICATION_UPDATE_ERROR_PATTERNS.some((pattern) => pattern.test(text)) ||
      isScriptLoadFailureText(text)
    );
  });
}

function collectErrorText(error: unknown, visited: Set<UnknownRecord>): string[] {
  if (typeof error === 'string') {
    return [error];
  }
  if (!isRecord(error) || visited.has(error)) {
    return [];
  }

  visited.add(error);
  const texts: string[] = [];
  for (const field of ERROR_TEXT_FIELDS) {
    const value = error[field];
    if (typeof value === 'string' && value.trim()) {
      texts.push(value);
    }
  }

  const stringified = String(error);
  if (stringified !== '[object Object]') {
    texts.push(stringified);
  }

  appendEventTargetText(error, texts);

  for (const field of NESTED_ERROR_FIELDS) {
    texts.push(...collectErrorText(error[field], visited));
  }

  return texts;
}

function appendEventTargetText(error: UnknownRecord, texts: string[]): void {
  const target = error['target'];
  if (!isRecord(target)) {
    return;
  }

  const source = stringField(target, 'src') ?? stringField(target, 'href');
  if (!source) {
    return;
  }

  const eventTargetText = [stringField(error, 'type'), stringField(target, 'tagName'), source]
    .filter(isPresentString)
    .join(' ');
  if (eventTargetText) {
    texts.push(eventTargetText);
  }
}

function isScriptLoadFailureText(text: string): boolean {
  return (
    /\.[cm]?js(?:[?#\s]|$)/i.test(text) &&
    /\b(404|chunk|error|failed|fetch|import|load|module|script)\b/i.test(text)
  );
}

function stringField(record: UnknownRecord, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function isPresentString(value: string | null): value is string {
  return value !== null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

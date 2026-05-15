export type UnrealTupleValue =
  | string
  | number
  | boolean
  | null
  | UnrealTupleValue[]
  | { readonly [key: string]: UnrealTupleValue };

interface ParsedEntry {
  key?: string;
  value: UnrealTupleValue;
}

export class UnrealTupleParseError extends Error {
  public constructor(
    message: string,
    public readonly offset: number,
  ) {
    super(`${message} at offset ${offset}`);
  }
}

export function parseUnrealTupleString(source: string): UnrealTupleValue {
  const parser = new UnrealTupleParser(source);
  const value = parser.parseValue();
  parser.skipWhitespace();
  if (!parser.isAtEnd()) {
    throw parser.error('Unexpected trailing text');
  }
  return value;
}

export function parseUnrealTupleArray(source: string): UnrealTupleValue[] {
  const value = parseUnrealTupleString(source);
  if (!Array.isArray(value)) {
    throw new UnrealTupleParseError('Expected an Unreal tuple array', 0);
  }
  return value;
}

export function extractClassNameFromReference(reference: string): string {
  const trimmed = reference.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  const dotMatch = /\.([A-Za-z0-9_]+)'?$/.exec(trimmed);
  if (dotMatch?.[1]) {
    return dotMatch[1];
  }

  const slashParts = trimmed.split('/');
  const lastPart = slashParts.at(-1)?.replace(/'$/g, '');
  if (!lastPart) {
    return trimmed;
  }

  return lastPart.includes('.') ? lastPart.split('.').at(-1) ?? lastPart : lastPart;
}

export function tupleValueAsRecords(value: UnrealTupleValue): ReadonlyArray<Record<string, UnrealTupleValue>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

export function tupleValueAsStrings(value: UnrealTupleValue): string[] {
  if (!Array.isArray(value)) {
    return typeof value === 'string' && value.length > 0 ? [value] : [];
  }

  return value.flatMap((entry) => (typeof entry === 'string' && entry.length > 0 ? [entry] : []));
}

function isRecord(value: UnrealTupleValue): value is Record<string, UnrealTupleValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class UnrealTupleParser {
  private offset = 0;

  public constructor(private readonly source: string) {}

  public parseValue(): UnrealTupleValue {
    this.skipWhitespace();
    const char = this.peek();

    if (char === '(') {
      return this.parseGroup();
    }

    if (char === '"') {
      return this.parseQuotedString();
    }

    return this.parseAtom();
  }

  public skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.source[this.offset] ?? '')) {
      this.offset += 1;
    }
  }

  public isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  public error(message: string): UnrealTupleParseError {
    return new UnrealTupleParseError(message, this.offset);
  }

  private parseGroup(): UnrealTupleValue {
    this.expect('(');
    const entries: ParsedEntry[] = [];
    this.skipWhitespace();

    while (this.peek() !== ')') {
      entries.push(this.parseEntry());
      this.skipWhitespace();

      if (this.peek() === ',') {
        this.offset += 1;
        this.skipWhitespace();
        continue;
      }

      if (this.peek() !== ')') {
        throw this.error('Expected comma or closing parenthesis');
      }
    }

    this.expect(')');
    const hasKeys = entries.some((entry) => entry.key !== undefined);
    if (!hasKeys) {
      return entries.map((entry) => entry.value);
    }

    const result: Record<string, UnrealTupleValue> = {};
    for (const entry of entries) {
      if (entry.key === undefined) {
        throw this.error('Cannot mix keyed and positional tuple entries');
      }
      result[entry.key] = entry.value;
    }
    return result;
  }

  private parseEntry(): ParsedEntry {
    this.skipWhitespace();
    const startOffset = this.offset;
    const key = this.tryParseIdentifier();

    if (key.length > 0) {
      this.skipWhitespace();
      if (this.peek() === '=') {
        this.offset += 1;
        return { key, value: this.parseValue() };
      }
    }

    this.offset = startOffset;
    return { value: this.parseValue() };
  }

  private parseQuotedString(): string {
    this.expect('"');
    let value = '';

    while (!this.isAtEnd()) {
      const char = this.source[this.offset];
      this.offset += 1;

      if (char === '"') {
        return value;
      }

      if (char === '\\') {
        const escaped = this.source[this.offset];
        if (escaped === undefined) {
          throw this.error('Unterminated escape sequence');
        }
        this.offset += 1;
        value += escaped;
        continue;
      }

      value += char;
    }

    throw this.error('Unterminated quoted string');
  }

  private parseAtom(): UnrealTupleValue {
    const startOffset = this.offset;
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ',' || char === ')') {
        break;
      }
      this.offset += 1;
    }

    const raw = this.source.slice(startOffset, this.offset).trim();
    if (raw.length === 0) {
      throw this.error('Expected value');
    }

    if (raw === 'None' || raw === 'null') {
      return null;
    }
    if (raw === 'True' || raw === 'true') {
      return true;
    }
    if (raw === 'False' || raw === 'false') {
      return false;
    }

    const numeric = Number(raw);
    return Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(raw) ? numeric : raw;
  }

  private tryParseIdentifier(): string {
    const startOffset = this.offset;
    const first = this.source[this.offset] ?? '';
    if (!/[A-Za-z_]/.test(first)) {
      return '';
    }

    this.offset += 1;
    while (!this.isAtEnd() && /[A-Za-z0-9_]/.test(this.source[this.offset] ?? '')) {
      this.offset += 1;
    }

    return this.source.slice(startOffset, this.offset);
  }

  private expect(expected: string): void {
    if (this.peek() !== expected) {
      throw this.error(`Expected "${expected}"`);
    }
    this.offset += 1;
  }

  private peek(): string {
    return this.source[this.offset] ?? '';
  }
}

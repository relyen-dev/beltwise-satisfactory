#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { normalizeDocs, parseRawDocsJson, stableStringify } from '@beltwise/game-data';

interface CliOptions {
  inputPath: string;
  outputPath: string;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const invocationCwd = process.env['INIT_CWD'] ?? process.cwd();
  const inputPath = resolve(invocationCwd, options.inputPath);
  const outputPath = resolve(invocationCwd, options.outputPath);
  const rawText = decodeDocsText(await readFile(inputPath));
  const inputStats = await stat(inputPath);
  const dataset = normalizeDocs(parseRawDocsJson(rawText), rawText, {
    docsFileName: basename(inputPath),
    docsLastModified: inputStats.mtime.toISOString(),
    gameVersionLabel: process.env['SATISFACTORY_GAME_VERSION'] ?? 'unknown'
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stableStringify(dataset), 'utf8');
  console.log(
    `Wrote ${Object.keys(dataset.items).length} items, ${Object.keys(dataset.recipes).length} recipes, and ${Object.keys(dataset.machines).length} machines to ${outputPath}`,
  );
}

function decodeDocsText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString('utf16le');
  }

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString('utf8');
  }

  return bytes.toString('utf8');
}

function parseCliOptions(args: string[]): CliOptions {
  const inputPath = readFlag(args, '--input') ?? process.env['SATISFACTORY_DOCS_PATH'];
  const outputPath = readFlag(args, '--output') ?? 'apps/web/public/data/satisfactory-current.json';

  if (!inputPath) {
    throw new Error(
      'Missing --input <path>. You can also set SATISFACTORY_DOCS_PATH to the Satisfactory en-US.json location.',
    );
  }

  return { inputPath, outputPath };
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Expected a value after ${name}`);
  }
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

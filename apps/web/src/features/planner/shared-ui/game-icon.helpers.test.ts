import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type GameDataset, gameDatasetSchema } from '@beltwise/game-data';
import {
  gameIconDescriptorIdForMachineId,
  gameIconPathForItemId,
  gameIconPathForMachineId,
} from './game-icon.helpers';
import { plannerRelevantMachineIds } from './planner-domain.helpers';

const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const CURRENT_DATASET_PATH = join(REPO_ROOT, 'data/generated/satisfactory-current.json');
const PUBLIC_GAME_ICONS_DIR = join(REPO_ROOT, 'apps/web/public/game-icons');
const GAME_ICON_PATH_PREFIX = '/game-icons/';
const APP_REFERENCED_MACHINE_ICON_IDS = [
  'Build_GeneratorBiomass_Automated_C',
  'Build_GeneratorCoal_C',
  'Build_GeneratorFuel_C',
  'Build_GeneratorNuclear_C',
] as const;

describe('game icon helpers', () => {
  it('builds deterministic item icon paths from item ids', () => {
    expect(gameIconPathForItemId('Desc_IronPlate_C')).toBe('/game-icons/Desc_IronPlate_C.png');
  });

  it('maps common build ids to descriptor icon ids for machine icons', () => {
    expect(gameIconDescriptorIdForMachineId('Build_AssemblerMk1_C')).toBe('Desc_AssemblerMk1_C');
    expect(gameIconPathForMachineId('Build_ConstructorMk1_C')).toBe(
      '/game-icons/Desc_ConstructorMk1_C.png',
    );
  });

  it('keeps non-build ids deterministic instead of inventing a mapping', () => {
    expect(gameIconDescriptorIdForMachineId('Desc_CustomMachine_C')).toBe('Desc_CustomMachine_C');
    expect(gameIconPathForMachineId('Desc_CustomMachine_C')).toBe(
      '/game-icons/Desc_CustomMachine_C.png',
    );
  });

  it('refuses to build icon URLs from unsafe imported ids', () => {
    const unsafeItemId = '../evil.svg#x' as Parameters<typeof gameIconPathForItemId>[0];
    const unsafeMachineId = 'javascript:alert(1)' as Parameters<typeof gameIconPathForMachineId>[0];
    const unsafePrototypeItemId = '__proto__' as Parameters<typeof gameIconPathForItemId>[0];

    expect(gameIconPathForItemId(unsafeItemId)).toBe('');
    expect(gameIconPathForItemId(unsafePrototypeItemId)).toBe('');
    expect(gameIconPathForMachineId(unsafeMachineId)).toBe('');
  });

  it('has a public PNG for every current dataset item and planner machine icon path', () => {
    const missingIconFiles = Array.from(requiredCurrentDatasetIconFileNames()).filter(
      (iconFileName) => !existsSync(join(PUBLIC_GAME_ICONS_DIR, iconFileName)),
    );

    expect(missingIconFiles).toEqual([]);
  });

  it('keeps the public icon folder limited to the current dataset icon manifest', () => {
    const requiredIconFileNames = requiredCurrentDatasetIconFileNames();
    const extraIconFiles = readdirSync(PUBLIC_GAME_ICONS_DIR)
      .filter((fileName) => fileName.endsWith('.png'))
      .filter((fileName) => !requiredIconFileNames.has(fileName))
      .sort();

    expect(extraIconFiles).toEqual([]);
  });
});

function requiredCurrentDatasetIconFileNames(): Set<string> {
  const dataset = readCurrentDataset();
  const iconFileNames = new Set<string>();

  for (const itemId of Object.keys(dataset.items)) {
    iconFileNames.add(iconFileNameFromPath(gameIconPathForItemId(itemId)));
  }
  for (const machineId of plannerRelevantMachineIds(dataset)) {
    iconFileNames.add(iconFileNameFromPath(gameIconPathForMachineId(machineId)));
  }
  for (const machineId of APP_REFERENCED_MACHINE_ICON_IDS) {
    iconFileNames.add(iconFileNameFromPath(gameIconPathForMachineId(machineId)));
  }

  return iconFileNames;
}

function readCurrentDataset(): GameDataset {
  return gameDatasetSchema.parse(JSON.parse(readFileSync(CURRENT_DATASET_PATH, 'utf8')));
}

function iconFileNameFromPath(iconPath: string): string {
  if (!iconPath.startsWith(GAME_ICON_PATH_PREFIX) || !iconPath.endsWith('.png')) {
    throw new Error(`Unexpected game icon path: ${iconPath}`);
  }

  return iconPath.slice(GAME_ICON_PATH_PREFIX.length);
}

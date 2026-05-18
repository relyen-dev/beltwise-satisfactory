import type { ItemId, MachineId } from '@beltwise/game-data';

const GAME_ICON_BASE_PATH = '/game-icons';
const GAME_ICON_DESCRIPTOR_ID_PATTERN = /^[A-Za-z0-9_]+$/;
const UNSAFE_GAME_ICON_DESCRIPTOR_IDS = new Set(['__proto__', 'prototype', 'constructor']);

export function gameIconPathForItemId(itemId: ItemId): string {
  return gameIconPathForDescriptorId(itemId);
}

export function gameIconPathForMachineId(machineId: MachineId): string {
  return gameIconPathForDescriptorId(gameIconDescriptorIdForMachineId(machineId));
}

export function gameIconDescriptorIdForMachineId(machineId: MachineId): string {
  return machineId.startsWith('Build_') ? `Desc_${machineId.slice('Build_'.length)}` : machineId;
}

function gameIconPathForDescriptorId(descriptorId: string): string {
  if (
    !GAME_ICON_DESCRIPTOR_ID_PATTERN.test(descriptorId) ||
    UNSAFE_GAME_ICON_DESCRIPTOR_IDS.has(descriptorId)
  ) {
    return '';
  }
  return `${GAME_ICON_BASE_PATH}/${descriptorId}.png`;
}

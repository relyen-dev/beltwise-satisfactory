import type { ItemId, MachineId } from '@beltwise/game-data';

const GAME_ICON_BASE_PATH = '/game-icons';

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
  return `${GAME_ICON_BASE_PATH}/${descriptorId}.png`;
}

import { describe, expect, it } from 'vitest';
import {
  gameIconDescriptorIdForMachineId,
  gameIconPathForItemId,
  gameIconPathForMachineId,
} from './game-icon.helpers';

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
});

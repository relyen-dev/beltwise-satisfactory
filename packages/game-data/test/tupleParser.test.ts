import { describe, expect, it } from 'vitest';
import {
  extractClassNameFromReference,
  parseUnrealTupleString,
  tupleValueAsRecords,
  tupleValueAsStrings
} from '@beltwise/game-data';

describe('Unreal tuple parser', () => {
  it('parses recipe ingredient tuples into keyed records', () => {
    const parsed = parseUnrealTupleString(
      '((ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/Parts/Desc_IronPlate.Desc_IronPlate_C\'",Amount=2),(ItemClass="/Script/Engine.BlueprintGeneratedClass\'/Game/Parts/Desc_Screw.Desc_Screw_C\'",Amount=12))',
    );

    const records = tupleValueAsRecords(parsed);

    expect(records).toHaveLength(2);
    expect(records[0]?.['Amount']).toBe(2);
    expect(extractClassNameFromReference(String(records[1]?.['ItemClass']))).toBe('Desc_Screw_C');
  });

  it('parses produced-in references as positional values', () => {
    const parsed = parseUnrealTupleString(
      '(/Script/Engine.BlueprintGeneratedClass\'/Game/Factory/Build_ConstructorMk1.Build_ConstructorMk1_C\',/Script/Engine.BlueprintGeneratedClass\'/Game/Factory/Build_SmelterMk1.Build_SmelterMk1_C\')',
    );

    expect(tupleValueAsStrings(parsed).map(extractClassNameFromReference)).toEqual([
      'Build_ConstructorMk1_C',
      'Build_SmelterMk1_C'
    ]);
  });

  it('parses nested gameplay tag tuples', () => {
    const parsed = parseUnrealTupleString(
      '(GameplayTags=((TagName="Recipe.Part"),(TagName="Recipe.Alternate")))'
    );

    expect(parsed).toEqual({
      GameplayTags: [{ TagName: 'Recipe.Part' }, { TagName: 'Recipe.Alternate' }]
    });
  });

  it('extracts class names from quoted object paths', () => {
    expect(
      extractClassNameFromReference(
        '"/Script/Engine.BlueprintGeneratedClass\'/Game/FactoryGame/Buildable/Factory/Build_AssemblerMk1.Build_AssemblerMk1_C\'"',
      ),
    ).toBe('Build_AssemblerMk1_C');
  });
});

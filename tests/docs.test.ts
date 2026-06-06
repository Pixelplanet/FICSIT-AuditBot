import { describe, expect, it } from 'vitest';
import { buildIndex } from '../src/data/docs/index.js';
import {
  decodeDocsBuffer,
  extractClassNames,
  extractItemAmounts,
  shortClassName,
} from '../src/data/docs/unreal.js';

describe('unreal helpers', () => {
  it('extracts short class names without _C', () => {
    expect(shortClassName('/Game/FactoryGame/Recipes/Recipe_IronPlate.Recipe_IronPlate_C')).toBe(
      'Recipe_IronPlate',
    );
    expect(shortClassName('Schematic_3-1_C')).toBe('Schematic_3-1');
  });

  it('extracts class names from an Unreal list string', () => {
    const value =
      '("/Game/FactoryGame/Recipes/Recipe_A.Recipe_A_C","/Game/FactoryGame/Recipes/Recipe_B.Recipe_B_C")';
    expect(extractClassNames(value)).toEqual(['Recipe_A', 'Recipe_B']);
  });

  it('extracts item/amount pairs from a struct-array string', () => {
    const value =
      '((ItemClass="/Game/.../Desc_Caterium.Desc_Caterium_C",Amount=10),(ItemClass="/Game/.../Desc_Quickwire.Desc_Quickwire_C",Amount=5))';
    expect(extractItemAmounts(value)).toEqual([
      { itemId: 'Desc_Caterium', amount: 10 },
      { itemId: 'Desc_Quickwire', amount: 5 },
    ]);
  });

  it('decodes UTF-16LE buffers with a BOM', () => {
    const json = '[{"NativeClass":"x","Classes":[]}]';
    const buf = Buffer.from('\uFEFF' + json, 'utf16le');
    expect(decodeDocsBuffer(buf)).toBe(json);
  });
});

const FIXTURE = [
  {
    NativeClass: "Class'/Script/FactoryGame.FGItemDescriptor'",
    Classes: [
      { ClassName: 'Desc_Quickwire_C', mDisplayName: 'Quickwire' },
      { ClassName: 'Desc_CateriumIngot_C', mDisplayName: 'Caterium Ingot' },
    ],
  },
  {
    NativeClass: "Class'/Script/FactoryGame.FGRecipe'",
    Classes: [
      {
        ClassName: 'Recipe_Quickwire_C',
        mDisplayName: 'Quickwire',
        mIngredients: '((ItemClass="/Game/.../Desc_CateriumIngot.Desc_CateriumIngot_C",Amount=1))',
        mProduct: '((ItemClass="/Game/.../Desc_Quickwire.Desc_Quickwire_C",Amount=5))',
        mProducedIn: '("/Game/.../Build_ConstructorMk1.Build_ConstructorMk1_C")',
        mManufactoringDuration: '12.000000',
      },
      {
        ClassName: 'Recipe_CateriumIngot_C',
        mDisplayName: 'Caterium Ingot',
        mProduct: '((ItemClass="/Game/.../Desc_CateriumIngot.Desc_CateriumIngot_C",Amount=1))',
      },
    ],
  },
  {
    NativeClass: "Class'/Script/FactoryGame.FGBuildableManufacturer'",
    Classes: [{ ClassName: 'Build_ConstructorMk1_C', mDisplayName: 'Constructor' }],
  },
  {
    NativeClass: "Class'/Script/FactoryGame.FGSchematic'",
    Classes: [
      {
        ClassName: 'Research_Caterium_3_C',
        mType: 'EST_MAM',
        mTechTier: '4',
        mDisplayName: 'Caterium Electronics',
        mCost: '((ItemClass="/Game/.../Desc_CateriumIngot.Desc_CateriumIngot_C",Amount=20))',
        mUnlocks: [
          {
            mRecipes:
              '("/Game/.../Recipe_Quickwire.Recipe_Quickwire_C","/Game/.../Recipe_CateriumIngot.Recipe_CateriumIngot_C")',
          },
          { mNumInventorySlotsToUnlock: '0' },
        ],
      },
    ],
  },
];

describe('buildIndex', () => {
  it('indexes items, recipes and schematics by id without _C', () => {
    const index = buildIndex(FIXTURE);
    const stats = index.stats();
    expect(stats.items).toBe(3); // 2 item descriptors + 1 buildable (Constructor)
    expect(stats.recipes).toBe(2);
    expect(stats.schematics).toBe(1);

    expect(index.itemName('Desc_Quickwire')).toBe('Quickwire');
    expect(index.recipeName('Recipe_CateriumIngot')).toBe('Caterium Ingot');

    const schematic = index.getSchematic('Research_Caterium_3');
    expect(schematic?.displayName).toBe('Caterium Electronics');
    expect(schematic?.techTier).toBe(4);
    expect(schematic?.unlocks.recipes).toEqual(['Recipe_Quickwire', 'Recipe_CateriumIngot']);
  });

  it('describes what a schematic unlocks using display names', () => {
    const index = buildIndex(FIXTURE);
    const desc = index.describeUnlocks('Research_Caterium_3');
    expect(desc).toContain('Unlocks');
    expect(desc).toContain('Quickwire');
    expect(desc).toContain('Caterium Ingot');
  });

  it('renders a recipe formula with ingredients, products and building', () => {
    const index = buildIndex(FIXTURE);
    const formula = index.recipeFormula('Recipe_Quickwire');
    expect(formula).toBe('1× Caterium Ingot → 5× Quickwire @ Constructor (12s)');
  });

  it('describes the build cost of a schematic', () => {
    const index = buildIndex(FIXTURE);
    expect(index.describeCost('Research_Caterium_3')).toBe('Cost: 20× Caterium Ingot');
  });
});


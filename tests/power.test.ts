import { describe, expect, it } from 'vitest';
import { extractBuildings } from '../src/extract/buildings.js';

function ref(pathName: string) {
  return { pathName };
}

function obj(typePath: string, instanceName: string, properties: Record<string, any> = {}) {
  return { typePath, instanceName, properties } as any;
}

describe('extractBuildings power accounting', () => {
  it('counts only power info components attached to a circuit', () => {
    const connectedGeneratorRoot = 'Persistent_Level:PersistentLevel.Build_GeneratorCoal_C_1';
    const connectedConsumerRoot = 'Persistent_Level:PersistentLevel.Build_AssemblerMk1_C_1';
    const disconnectedConsumerRoot = 'Persistent_Level:PersistentLevel.BP_DropPod_1';

    const objects = [
      obj('/Game/FactoryGame/Buildable/Factory/GeneratorCoal/Build_GeneratorCoal.Build_GeneratorCoal_C', `${connectedGeneratorRoot}.SomeComponent`),
      obj('/Game/FactoryGame/Buildable/Factory/AssemblerMk1/Build_AssemblerMk1.Build_AssemblerMk1_C', `${connectedConsumerRoot}.SomeComponent`),
      obj('/Script/FactoryGame.FGPowerCircuit', 'Persistent_Level:PersistentLevel.CircuitSubsystem.FGPowerCircuit_1', {
        mComponents: { values: [ref(`${connectedGeneratorRoot}.PowerConnection2`), ref(`${connectedConsumerRoot}.PowerInput`)] },
      }),
      obj('/Script/FactoryGame.FGPowerCircuit', 'Persistent_Level:PersistentLevel.CircuitSubsystem.FGPowerCircuit_2', {
        mComponents: { values: [] },
      }),
      obj('/Script/FactoryGame.FGPowerInfoComponent', `${connectedGeneratorRoot}.PowerInfo2`, {
        mDynamicProductionCapacity: { value: 75 },
      }),
      obj('/Script/FactoryGame.FGPowerInfoComponent', `${connectedConsumerRoot}.PowerInfo2`, {
        mTargetConsumption: { value: 50 },
      }),
      obj('/Script/FactoryGame.FGPowerInfoComponent', `${disconnectedConsumerRoot}.PowerInfo2`, {
        mTargetConsumption: { value: 500 },
      }),
    ];

    const info = extractBuildings(objects);
    expect(info.power.maxProductionMW).toBe(75);
    expect(info.power.maxConsumptionMW).toBe(50);
    expect(info.power.circuitCount).toBe(2);
  });
});

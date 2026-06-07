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

  it('counts railroad tracks and vehicle paths as logistics buildings', () => {
    const objects = [
      obj('/Game/FactoryGame/Buildable/Factory/Train/Track/Build_RailroadTrack.Build_RailroadTrack_C', 'Persistent_Level:PersistentLevel.Build_RailroadTrack_C_1'),
      obj('/Game/FactoryGame/Buildable/Factory/Train/Track/Build_RailroadTrackIntegrated.Build_RailroadTrackIntegrated_C', 'Persistent_Level:PersistentLevel.Build_RailroadTrackIntegrated_C_1'),
      obj('/Game/FactoryGame/Buildable/Factory/Train/Station/Build_TrainStation.Build_TrainStation_C', 'Persistent_Level:PersistentLevel.Build_TrainStation_C_1'),
      obj('/Game/FactoryGame/Buildable/Vehicle/VehiclePath/Build_VehiclePath_Universal.Build_VehiclePath_Universal_C', 'Persistent_Level:PersistentLevel.Build_VehiclePath_Universal_C_1'),
      obj('/Game/FactoryGame/Buildable/Vehicle/Truck/Build_VehiclePath_Truck.Build_VehiclePath_Truck_C', 'Persistent_Level:PersistentLevel.Build_VehiclePath_Truck_C_1'),
      obj('/Game/FactoryGame/Buildable/Vehicle/Tractor/Build_VehiclePath_Tractor.Build_VehiclePath_Tractor_C', 'Persistent_Level:PersistentLevel.Build_VehiclePath_Tractor_C_1'),
      obj('/Game/FactoryGame/Buildable/Vehicle/Explorer/Build_VehiclePath_Explorer.Build_VehiclePath_Explorer_C', 'Persistent_Level:PersistentLevel.Build_VehiclePath_Explorer_C_1'),
      obj('/Game/FactoryGame/Buildable/Vehicle/Golfcart/Build_VehiclePath_FactoryCart.Build_VehiclePath_FactoryCart_C', 'Persistent_Level:PersistentLevel.Build_VehiclePath_FactoryCart_C_1'),
    ];

    const info = extractBuildings(objects);
    expect(info.logistics.railroadTracks).toBe(2);
    expect(info.logistics.trainStations).toBe(1);
    expect(info.logistics.vehiclePathUniversal).toBe(1);
    expect(info.logistics.vehiclePathTruck).toBe(1);
    expect(info.logistics.vehiclePathTractor).toBe(1);
    expect(info.logistics.vehiclePathExplorer).toBe(1);
    expect(info.logistics.vehiclePathFactoryCart).toBe(1);
  });
});

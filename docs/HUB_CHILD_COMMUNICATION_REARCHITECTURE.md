# Hub/Child Communication Rearchitecture Plan

## Overview
This document outlines the rearchitecture from shoulder-based hubs to right-side-based hubs, where all right-side devices (hand, forearm, shoulder) function as hubs that receive data from their corresponding left-side devices via ESP-NOW.

## Architecture Changes

### Current Architecture
- **Hubs**: `LEFT_HUB` (shoulder), `RIGHT_HUB` (shoulder)
- **Children**: `LEFT_HAND`, `LEFT_FOREARM`, `RIGHT_HAND`, `RIGHT_FOREARM`
- **Data Flow**: Left children → Left hub, Right children → Right hub
- **Phone Connections**: All devices connect to phone

### New Architecture
- **Hubs**: `RIGHT_HAND`, `RIGHT_FOREARM`, `RIGHT_SHOULDER` (all right-side devices)
- **Children**: `LEFT_HAND`, `LEFT_FOREARM`, `LEFT_SHOULDER` (all left-side devices)
- **Data Flow**: 
  - `LEFT_HAND` → `RIGHT_HAND` (via ESP-NOW)
  - `LEFT_FOREARM` → `RIGHT_FOREARM` (via ESP-NOW)
  - `LEFT_SHOULDER` → `RIGHT_SHOULDER` (via ESP-NOW)
  - `CHEST` → Phone (direct, unchanged)
- **Phone Connections**: Only right-side devices and chest connect to phone

## Key Changes Summary

1. **Role Renaming**: `LEFT_HUB` → `LEFT_SHOULDER`, `RIGHT_HUB` → `RIGHT_SHOULDER`
2. **Hub Definition**: All right-side devices are hubs
3. **BLE Characteristics**: 
   - MAIN characteristics (device's own data) - existing UUIDs
   - LEFT characteristics (child data from left side) - new UUIDs
4. **MAC Address Storage**: ⏭️ Skipped - Not needed for simulator (roles assigned via API)
5. **Connection Logic**: Phone only connects to right devices and chest

## Implementation Phases

### Phase 1: Core Data Model Changes ✅ COMPLETE

**Status**: Complete - All core data model changes implemented

### Phase 2: Hub MAC Address Management ⏭️ SKIPPED

**Status**: Skipped - Not needed for simulator

**Reason**: The simulator does not assign roles locally. Roles are:
- Read from devices via ROLE_CONFIG characteristic
- Saved to the API via POST/PUT requests
- ESP-NOW pairing is handled by device firmware, not the simulator

MAC address storage for role assignment is only needed if roles are assigned locally. Since the simulator only makes API calls to save device configurations, Phase 2 can be skipped.

### Phase 3: BLE Characteristic Management ✅ COMPLETE

**Status**: Complete - All BLE characteristic management updated for new architecture

**Summary**:
- ✅ All old HAND/FOREARM characteristics removed
- ✅ LEFT characteristics fully implemented
- ✅ Subscription methods (`subscribeToLeftQuaternion()`, `subscribeToLeftRawData()`) added
- ✅ Handler methods (`handleLeftQuaternionData()`, `handleLeftRawData()`) implemented
- ✅ Child device setup updated for new architecture
- ✅ Helper methods (`getLeftChildRoleForHub()`, `getChildTypeName()`, `isRightSideHub()`) added
- ✅ Stream cleanup properly handles LEFT streams
- ✅ All characteristic subscriptions work correctly for right-side hubs

#### 3.1 Update EidonTrackerManager Characteristic Storage ✅ COMPLETE
**File**: `src/core/EidonTrackerManager.ts`

- [x] Remove old hub-specific characteristic storage:
  - `handQuaternionChar` references - Removed
  - `forearmQuaternionChar` references - Removed
  - `handRawDataChar` references - Removed
  - `forearmRawDataChar` references - Removed

- [x] Add new LEFT characteristic storage:
  - LEFT characteristics are accessed directly from `connectionState.characteristics.get(LEFT_QUATERNION_CHAR_UUID)`
  - No separate storage map needed

- [x] Remove old stream controllers:
  - `handRawDataStreams` - Removed
  - `forearmRawDataStreams` - Removed
  - `handRawDataControllers` - Removed
  - `forearmRawDataControllers` - Removed

- [x] Add new LEFT stream controllers:
  ```typescript
  private leftRawDataStreams = new Map<DeviceId, ReadableStream<RawMotionData>>();
  private leftRawDataControllers = new Map<DeviceId, ReadableStreamDefaultController<RawMotionData>>();
  ```

- [x] Add getters:
  ```typescript
  getLeftRawDataStream(deviceId: DeviceId): ReadableStream<RawMotionData> | undefined {
    return this.leftRawDataStreams.get(deviceId);
  }
  ```

- [x] Add availability checks:
  ```typescript
  hasLeftRawDataCharacteristic(deviceId: DeviceId): boolean {
    const connectionState = this.connectionStates.get(deviceId);
    return connectionState?.characteristics.has(LEFT_RAW_DATA_CHAR_UUID) ?? false;
  }
  ```

#### 3.2 Update Characteristic Setup Logic ✅ COMPLETE
**File**: `src/core/EidonTrackerManager.ts` - `performConnection()` and `setupChildDevicesForHub()`

- [x] Remove old LEFT/RIGHT hub characteristic subscriptions - Removed
- [x] Add LEFT characteristic subscriptions for right devices:
  - LEFT quaternion subscription done in `setupChildDevicesForHub()` via `subscribeToLeftQuaternion()`
  - LEFT raw data subscription done in `subscribeToRawData()` via `subscribeToLeftRawData()`

- [x] Add helper method:
  ```typescript
  private isRightSideHub(role: DeviceRole): boolean {
    return role === DeviceRole.RIGHT_HAND || 
           role === DeviceRole.RIGHT_FOREARM || 
           role === DeviceRole.RIGHT_SHOULDER;
  }
  ```

- [x] Update MAIN characteristic subscriptions:
  - MAIN quaternion (`QUATERNION_CHAR_UUID`) - available for all devices ✅
  - MAIN raw data (`HUB_RAW_DATA_CHAR_UUID`) - available for all devices ✅

#### 3.3 Add Subscription Methods ✅ COMPLETE
**File**: `src/core/EidonTrackerManager.ts`

- [x] Add `subscribeToLeftQuaternion()` method:
  - Implemented with parameters: `hubId`, `childId`, `childRole`
  - Subscribes to LEFT quaternion characteristic and routes data to child device

- [x] Add `subscribeToLeftRawData()` method:
  - Implemented and called from `subscribeToRawData()`
  - Only subscribes for right-side hubs

- [x] Add `handleLeftQuaternionData()` method:
  - Implemented - parses quaternion data and dispatches events with child device ID
  - Updates child device connection state

- [x] Add `handleLeftRawData()` method:
  - Implemented - parses raw motion data and routes to LEFT raw data stream

- [x] Update `disconnect()` and cleanup methods:
  - `cleanupRawDataStreams()` properly closes LEFT raw data streams
  - GATT server disconnect automatically stops all notifications (Web Bluetooth API)

#### 3.4 Update Child Device Setup ✅ COMPLETE
**File**: `src/core/EidonTrackerManager.ts` - `setupChildDevicesForHub()`

- [x] Update to work with new architecture:
  - `setupChildDevicesForHub()` fully updated for new architecture
  - Only handles right-side hubs (RIGHT_HAND, RIGHT_FOREARM, RIGHT_SHOULDER)
  - Creates single child device per hub (corresponding left device)
  - Subscribes to LEFT quaternion characteristic via `subscribeToLeftQuaternion()`

- [x] Add helper methods:
  - `getLeftChildRoleForHub()` - Maps right hub roles to corresponding left child roles ✅
  - `getChildTypeName()` - Gets display name from child role ✅
  - `isRightSideHub()` - Checks if role is a right-side hub ✅

- [x] Update `generateChildDeviceId()` to use role instead of type:
  - Uses `${hubId}_${childRole}` format ✅

- [x] Update `mapChildRoleToDeviceRole()` to include shoulder:
  - Includes `LEFT_SHOULDER` and `RIGHT_SHOULDER` cases ✅

### Phase 4: Device Role Service Updates

#### 4.1 Create/Update Device Role Service
**File**: `src/core/DeviceRoleService.ts` (create if doesn't exist, or update existing)

- [ ] Add `isPrimaryDevice()` method:
  ```typescript
  isPrimaryDevice(role: DeviceRole): boolean {
    return role === DeviceRole.RIGHT_HAND ||
           role === DeviceRole.RIGHT_FOREARM ||
           role === DeviceRole.RIGHT_SHOULDER ||
           role === DeviceRole.CHEST;
  }
  ```

- [ ] Add `isPrimaryDeviceFromString()` method:
  ```typescript
  isPrimaryDeviceFromString(roleString: string): boolean {
    return roleString === 'right_hand' || 
           roleString === 'right_forearm' || 
           roleString === 'right_shoulder' || 
           roleString === 'chest';
  }
  ```

- [ ] Add `getPrimaryRoles()` method:
  ```typescript
  getPrimaryRoles(): DeviceRole[] {
    return [
      DeviceRole.RIGHT_HAND,
      DeviceRole.RIGHT_FOREARM,
      DeviceRole.RIGHT_SHOULDER,
      DeviceRole.CHEST,
    ];
  }
  ```

- [ ] Add `getChildRoles()` method:
  ```typescript
  getChildRoles(): DeviceRole[] {
    return [
      DeviceRole.LEFT_HAND,
      DeviceRole.LEFT_FOREARM,
      DeviceRole.LEFT_SHOULDER,
    ];
  }
  ```

- [ ] Update display name helpers to include shoulders

### Phase 5: UI Component Updates

#### 5.1 Update Role Selector
**File**: `src/ui/components/device-modal/RoleSelector.ts`

- [ ] Update hub status display to show all three right devices
- [ ] Update `_isRoleEnabled()` to check for specific right device availability
- [ ] Update `_getHubInfo()` to show correct hub information

#### 5.2 Update Device Modal Data Display
**File**: `src/ui/components/device-modal/DeviceModal.ts`

- [ ] Update data stream setup to use LEFT characteristics:
  - Replace `HAND_QUATERNION_CHAR_UUID` → `LEFT_QUATERNION_CHAR_UUID`
  - Replace `FOREARM_QUATERNION_CHAR_UUID` → `LEFT_QUATERNION_CHAR_UUID`
  - Replace `HAND_RAW_DATA_CHAR_UUID` → `LEFT_RAW_DATA_CHAR_UUID`
  - Replace `FOREARM_RAW_DATA_CHAR_UUID` → `LEFT_RAW_DATA_CHAR_UUID`

- [ ] Update stream getters:
  - Replace `getHandRawDataStream()` → `getLeftRawDataStream()`
  - Remove `getForearmRawDataStream()` (use `getLeftRawDataStream()`)
  - Update characteristic checks to use new LEFT characteristic methods

- [ ] Update child device color mapping:
  - Map right devices to their corresponding left child device colors
  - Example: `right_hand` → looks for `left_hand` color in profile

- [ ] Update child device name display:
  - Show "Left Hand Data", "Left Forearm Data", "Left Shoulder Data" for right devices
  - Right devices display LEFT child data correctly

#### 5.3 Update Saved Device Connection Card
**File**: `src/ui/components/device-modal/SavedDeviceConnectionCard.ts`

- [ ] Update `renderDataContent()`:
  - For right-side hubs, show:
    - MAIN quaternion/raw data (device's own data)
    - LEFT quaternion/raw data (from corresponding left child)
  - For chest, show only MAIN data
  - Remove old hub/arm/hand/forearm data sections

- [ ] Update characteristic checks:
  - Replace `hasHandQuaternionCharacteristic` → `hasLeftQuaternionCharacteristic`
  - Remove `hasForearmQuaternionCharacteristic`
  - Replace `hasHandRawDataCharacteristic` → `hasLeftRawDataCharacteristic`
  - Remove `hasForearmRawDataCharacteristic`
  - Update stream references to use LEFT streams

#### 5.4 Update New Device Connection Card
**File**: `src/ui/components/device-modal/NewDeviceConnectionCard.ts`

- [ ] Apply same updates as SavedDeviceConnectionCard

#### 5.5 Update Child Device Connection Manager
**File**: `src/core/ChildDeviceConnectionManager.ts`

- [ ] Update `ChildDeviceType` to include 'shoulder':
  ```typescript
  export type ChildDeviceType = 'hand' | 'forearm' | 'shoulder';
  ```

- [ ] Update `ChildDeviceRole` to include shoulders:
  ```typescript
  export type ChildDeviceRole = 'left_hand' | 'right_hand' | 
                                 'left_forearm' | 'right_forearm' |
                                 'left_shoulder' | 'right_shoulder';
  ```

### Phase 6: State Management Updates

#### 6.1 Update Device Connection Provider
**File**: `src/core/DeviceConnectionStateManager.ts`

- [ ] Verify hub detection logic:
  - Uses `DeviceRole.fromString()` which correctly handles new role names
  - No hub-specific filtering needed (works with all roles)
  - Device connection state properly tracks all connected devices

#### 6.2 Update Other Providers
- [ ] Verify all state providers:
  - Device connection state uses `DeviceRole.fromString()` correctly
  - All providers verified to work with new architecture

#### 6.3 Holistic Verification
- [ ] All role enum references updated:
  - `LEFT_HUB` → `LEFT_SHOULDER` ✅
  - `RIGHT_HUB` → `RIGHT_SHOULDER` ✅
  
- [ ] All characteristic references verified:
  - LEFT characteristics properly defined and used ✅
  - MAIN characteristics properly defined and used ✅
  - Deprecated getters properly mapped for backward compatibility ✅
  
- [ ] Connection logic verified:
  - Only connects to right devices and chest ✅
  - Left devices properly filtered out ✅
  
- [ ] No linter errors found ✅


## Migration Notes

### Backward Compatibility
- Consider maintaining support for old `LEFT_HUB`/`RIGHT_HUB` role names during transition
- May need to handle devices with old firmware that still use hub roles

### Data Migration
- Existing saved devices with `LEFT_HUB`/`RIGHT_HUB` roles may need migration
- Consider migration script or automatic role conversion

## Risk Areas

1. ✅ **BLE Characteristic Discovery**: New LEFT characteristics properly implemented
2. ⏭️ **MAC Address Management**: Skipped (not needed for simulator)
3. ⏳ **UI Updates**: Pending Phase 5
4. ⏳ **State Management**: Pending Phase 6

## Implementation Progress

**Overall Status**: Phase 1 Complete ✅, Phase 2 Skipped ⏭️, Phase 3 Complete ✅, Phases 4-6 Pending

**Last Updated**: Phase 3 completed - All BLE characteristic management implemented

### ✅ Completed Phases
- ✅ **Phase 1**: Core Data Model Changes
  - DeviceRole enum updated (LEFT_HUB → LEFT_SHOULDER, RIGHT_HUB → RIGHT_SHOULDER)
  - BLE role constants updated
  - All string references updated throughout codebase
  - Hub detection logic updated to recognize right-side devices as hubs
  
- ⏭️ **Phase 2**: Hub MAC Address Management
  - **SKIPPED** - Not needed for simulator (roles assigned via API, not locally)
  
- ✅ **Phase 3**: BLE Characteristic Management
  - Old HAND/FOREARM characteristics completely removed
  - New LEFT characteristics implemented (`LEFT_QUATERNION_CHAR_UUID`, `LEFT_RAW_DATA_CHAR_UUID`)
  - LEFT stream controllers and getters added (`getLeftRawDataStream()`, `hasLeftRawDataCharacteristic()`)
  - Subscription methods implemented (`subscribeToLeftQuaternion()`, `subscribeToLeftRawData()`)
  - Handler methods implemented (`handleLeftQuaternionData()`, `handleLeftRawData()`)
  - Child device setup fully updated for new architecture
  - Helper methods added (`getLeftChildRoleForHub()`, `getChildTypeName()`, `isRightSideHub()`)
  - Stream cleanup properly handles LEFT streams
  - All backward compatibility code removed

### ⏳ Remaining Phases
- ⏳ **Phase 4**: Device Role Service Updates
- ⏳ **Phase 5**: UI Component Updates
- ⏳ **Phase 6**: State Management Updates

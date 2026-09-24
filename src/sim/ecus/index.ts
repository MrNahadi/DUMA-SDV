/** ECUs. Each one reads other ECUs only through its bus inbox. */

export { createBms, PRECHARGE_DONE_RATIO, type Bms, type BmsOptions, type BmsSensors } from './bms';
export { createIc, type ChargeDisplayModel, type DashboardModel, type Ic, type ThermalDisplayModel } from './ic';
export { createMcu, type Mcu, type McuSensors } from './mcu';
export {
  STARTUP_STEPS,
  createVcu,
  type DriverInputs,
  type Gear,
  type GearRefusal,
  type PowerState,
  type StartupFailReason,
  type StartupStepId,
  type StartupStepStatus,
  type Vcu,
} from './vcu';

import type { PortCall } from '../types/call';
import type { FishingPort } from '../types/port';
import type { FishingVessel } from '../types/vessel';

/** 渔船在某一自然月内的额度用量与剩余 */
export interface MonthQuotaUsage {
  /** 月度加冰额度 kg */
  iceQuotaKg: number;
  /** 月度加油额度 L */
  fuelQuotaL: number;
  /** 当月已用加冰 kg */
  iceUsedKg: number;
  /** 当月已用加油 L */
  fuelUsedL: number;
  /** 当月剩余加冰 kg（已用超过额度时为负数） */
  iceRemainingKg: number;
  /** 当月剩余加油 L（已用超过额度时为负数） */
  fuelRemainingL: number;
}

/** 判断 ISO 时间是否与 ref 处于同一自然月 */
export function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/**
 * 统计渔船在 ref 所在自然月的加冰 / 加油用量与剩余额度。
 * 已登记的流水（含历史演示数据）全部计入，额度随登记成功立即变化。
 */
export function monthQuotaUsage(
  vessel: Pick<FishingVessel, 'id' | 'monthlyIceQuotaKg' | 'monthlyFuelQuotaL'>,
  calls: PortCall[],
  ref: Date = new Date(),
): MonthQuotaUsage {
  const iceQuotaKg = Number(vessel.monthlyIceQuotaKg) || 0;
  const fuelQuotaL = Number(vessel.monthlyFuelQuotaL) || 0;
  let iceUsedKg = 0;
  let fuelUsedL = 0;
  for (const call of calls) {
    if (call.vesselId !== vessel.id) continue;
    if (!isSameMonth(call.time, ref)) continue;
    iceUsedKg += Number(call.iceKg) || 0;
    fuelUsedL += Number(call.fuelL) || 0;
  }
  return {
    iceQuotaKg,
    fuelQuotaL,
    iceUsedKg,
    fuelUsedL,
    iceRemainingKg: iceQuotaKg - iceUsedKg,
    fuelRemainingL: fuelQuotaL - fuelUsedL,
  };
}

/**
 * 保存进出港登记前的核对：渔港补给能力 + 该船当月剩余额度。
 * 返回问题列表（每条都指明具体项目与差额），空数组表示核对通过；
 * 调用方在列表非空时必须放弃保存，既不写流水也不改泊位。
 */
export function callSupplyProblems(
  port: FishingPort | undefined,
  vessel: FishingVessel | undefined,
  vesselCalls: PortCall[],
  iceKg: number,
  fuelL: number,
  ref: Date = new Date(),
): string[] {
  if (!port) return ['未找到所选渔港档案，无法核对补给能力'];
  if (!vessel) return ['未找到渔船档案，无法核对月度额度'];

  const problems: string[] = [];
  if (iceKg > 0 && !port.supply.ice) {
    problems.push(`加冰：${port.name}不具备加冰补给能力（本次申请 ${iceKg} kg）`);
  }
  if (fuelL > 0 && !port.supply.fuel) {
    problems.push(`加油：${port.name}不具备加油补给能力（本次申请 ${fuelL} L）`);
  }

  const usage = monthQuotaUsage(vessel, vesselCalls, ref);
  if (iceKg > 0 && iceKg > usage.iceRemainingKg) {
    problems.push(
      `加冰：当月剩余额度 ${usage.iceRemainingKg} kg，本次申请 ${iceKg} kg，超出 ${iceKg - usage.iceRemainingKg} kg`,
    );
  }
  if (fuelL > 0 && fuelL > usage.fuelRemainingL) {
    problems.push(
      `加油：当月剩余额度 ${usage.fuelRemainingL} L，本次申请 ${fuelL} L，超出 ${fuelL - usage.fuelRemainingL} L`,
    );
  }
  return problems;
}

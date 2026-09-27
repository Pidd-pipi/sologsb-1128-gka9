import type { CallDraft, PortCall } from '../types/call';
import type { FishingPort } from '../types/port';
import type { FishingVessel } from '../types/vessel';

/**
 * 渔船每月加冰 / 加油额度的统计与登记前核对（纯函数，不触碰存储）。
 */

/** 判断 ISO 时间是否落在 ref 所在的自然月（本地时区） */
export function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** 月份标签，如 2026年9月 */
export function monthLabel(ref: Date): string {
  return `${ref.getFullYear()}年${ref.getMonth() + 1}月`;
}

export interface MonthUsage {
  iceKg: number;
  fuelL: number;
}

/** 统计渔船在 ref 所在自然月的加冰 / 加油用量（含当月全部既有流水） */
export function monthSupplyUsage(calls: PortCall[], vesselId: string, ref: Date): MonthUsage {
  let iceKg = 0;
  let fuelL = 0;
  for (const call of calls) {
    if (call.vesselId !== vesselId) continue;
    if (!isSameMonth(call.time, ref)) continue;
    iceKg += Number(call.iceKg) || 0;
    fuelL += Number(call.fuelL) || 0;
  }
  return { iceKg, fuelL };
}

/** 登记核对不通过的项目（含具体差额说明） */
export interface SupplyViolation {
  /** 涉及项目：加冰 / 加油 */
  item: '加冰' | '加油';
  message: string;
}

function formatAmount(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

/** 登记时间解析失败时退回当前时间（与 registerCall 的落库口径一致） */
function resolveRefTime(time: string): Date {
  const d = new Date(time);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * 进出港登记前的补给核对：
 * 1. 渔港补给能力——港口不供应加冰 / 加油时，对应登记量必须为 0；
 * 2. 渔船月度额度——按登记时间所在自然月统计已用，本次申请不得超出剩余额度。
 * 返回全部违规项（说明具体项目与差额），空数组表示通过；调用方据此拒绝落库。
 */
export function checkCallSupply(
  draft: Pick<CallDraft, 'iceKg' | 'fuelL' | 'time'>,
  vessel: FishingVessel | null,
  port: FishingPort | null,
  calls: PortCall[],
): SupplyViolation[] {
  const violations: SupplyViolation[] = [];
  const iceKg = Number(draft.iceKg) || 0;
  const fuelL = Number(draft.fuelL) || 0;

  if (port) {
    if (iceKg > 0 && !port.supply.ice) {
      violations.push({
        item: '加冰',
        message: `${port.name}不供应加冰，本次登记加冰 ${formatAmount(iceKg)} kg 无法受理`,
      });
    }
    if (fuelL > 0 && !port.supply.fuel) {
      violations.push({
        item: '加油',
        message: `${port.name}不供应加油，本次登记加油 ${formatAmount(fuelL)} L 无法受理`,
      });
    }
  }

  if (vessel && (iceKg > 0 || fuelL > 0)) {
    const refTime = resolveRefTime(draft.time);
    const used = monthSupplyUsage(calls, vessel.id, refTime);
    const label = monthLabel(refTime);
    if (iceKg > 0) {
      const remaining = vessel.monthlyIceQuotaKg - used.iceKg;
      if (iceKg > remaining) {
        violations.push({
          item: '加冰',
          message:
            `加冰超出${label}剩余额度 ${formatAmount(iceKg - remaining)} kg` +
            `（月额度 ${formatAmount(vessel.monthlyIceQuotaKg)} kg，已用 ${formatAmount(used.iceKg)} kg，` +
            `剩余 ${formatAmount(remaining)} kg，本次申请 ${formatAmount(iceKg)} kg）`,
        });
      }
    }
    if (fuelL > 0) {
      const remaining = vessel.monthlyFuelQuotaL - used.fuelL;
      if (fuelL > remaining) {
        violations.push({
          item: '加油',
          message:
            `加油超出${label}剩余额度 ${formatAmount(fuelL - remaining)} L` +
            `（月额度 ${formatAmount(vessel.monthlyFuelQuotaL)} L，已用 ${formatAmount(used.fuelL)} L，` +
            `剩余 ${formatAmount(remaining)} L，本次申请 ${formatAmount(fuelL)} L）`,
        });
      }
    }
  }
  return violations;
}

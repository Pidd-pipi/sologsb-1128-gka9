/** 作业类型 */
export type OperationType = '拖网' | '围网' | '刺网' | '钓具';

export const OPERATION_TYPES: OperationType[] = ['拖网', '围网', '刺网', '钓具'];

/** 船体材质 */
export type HullMaterial = '钢质' | '木质' | '玻璃钢' | '铝合金';

export const HULL_MATERIALS: HullMaterial[] = ['钢质', '木质', '玻璃钢', '铝合金'];

/** 合作社默认月度加冰额度 kg（旧档案迁移与新建档案的初始值） */
export const DEFAULT_MONTHLY_ICE_QUOTA_KG = 10000;

/** 合作社默认月度加油额度 L（旧档案迁移与新建档案的初始值） */
export const DEFAULT_MONTHLY_FUEL_QUOTA_L = 10000;

/** 渔船技术档案 */
export interface FishingVessel {
  id: string;
  /** 船名 */
  name: string;
  /** 渔船编号 */
  vesselNo: string;
  /** 船籍港 */
  homePort: string;
  /** 船长 m */
  length: number;
  /** 型宽 m */
  beam: number;
  /** 总吨位 */
  grossTonnage: number;
  /** 主机功率 kW */
  enginePower: number;
  /** 作业类型 */
  operationType: OperationType;
  /** 船体材质 */
  hullMaterial: HullMaterial;
  /** 船主 */
  owner: string;
  /** 证书有效期（YYYY-MM-DD） */
  certificateExpiry: string;
  /** 合作社月度加冰额度 kg */
  monthlyIceQuotaKg: number;
  /** 合作社月度加油额度 L */
  monthlyFuelQuotaL: number;
  createdAt: string;
}

/** 渔船检索条件（作业类型 + 功率区间 + 吨位 + 船籍港组合查询） */
export interface VesselQuery {
  operationType: OperationType | '';
  powerMin: number | null;
  powerMax: number | null;
  tonnageMin: number | null;
  tonnageMax: number | null;
  homePort: string;
}

export function emptyVesselQuery(): VesselQuery {
  return {
    operationType: '',
    powerMin: null,
    powerMax: null,
    tonnageMin: null,
    tonnageMax: null,
    homePort: '',
  };
}

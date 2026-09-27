import Dexie, { type Table } from 'dexie';
import type { FishingPort } from '../types/port';
import { DEFAULT_MONTHLY_FUEL_QUOTA_L, DEFAULT_MONTHLY_ICE_QUOTA_KG, type FishingVessel } from '../types/vessel';
import type { PortCall } from '../types/call';
import type { Berth } from '../types/berth';
import { buildBerthRecords } from './berth';

/**
 * gbfishport-db：库名固定为 gbfishport-db
 * v1 建 ports / vessels；v2 新增 calls 表与 vesselId 索引；v3 新增 berths 表并按泊位数生成初始记录；
 * v4 为既有渔船档案补齐合作社月度加冰 / 加油额度。
 */
export class FishPortDatabase extends Dexie {
  ports!: Table<FishingPort, string>;
  vessels!: Table<FishingVessel, string>;
  calls!: Table<PortCall, string>;
  berths!: Table<Berth, string>;

  constructor() {
    super('gbfishport-db');

    this.version(1).stores({
      ports: 'id, name, level, shelterLevel',
      vessels: 'id, vesselNo, homePort, operationType, enginePower, grossTonnage',
    });

    this.version(2)
      .stores({
        calls: 'id, vesselId, type, time',
      })
      .upgrade(async (tx) => {
        // v2 迁移：新增 calls 表与 vesselId 索引，回填历史记录的冗余字段
        await tx
          .table<PortCall, string>('calls')
          .toCollection()
          .modify((call) => {
            if (!call.vesselName) call.vesselName = '';
            if (!call.visaStatus) call.visaStatus = '待签证';
          });
      });

    this.version(3)
      .stores({
        berths: 'id, portId, berthNo, status, vesselId',
      })
      .upgrade(async (tx) => {
        // v3 迁移：新增 berths 表，并按每个渔港登记的泊位数生成初始泊位记录
        const ports = await tx.table<FishingPort, string>('ports').toArray();
        const berthTable = tx.table<Berth, string>('berths');
        for (const port of ports) {
          const existing = await berthTable.where('portId').equals(port.id).count();
          if (existing === 0) {
            await berthTable.bulkPut(buildBerthRecords(port));
          }
        }
      });

    this.version(4).upgrade(async (tx) => {
      // v4 迁移：为旧渔船档案回填合作社月度补给额度，旧档案与本月已有流水一起参与额度核算
      await tx
        .table<FishingVessel, string>('vessels')
        .toCollection()
        .modify((vessel) => {
          if (typeof vessel.monthlyIceQuotaKg !== 'number') vessel.monthlyIceQuotaKg = DEFAULT_MONTHLY_ICE_QUOTA_KG;
          if (typeof vessel.monthlyFuelQuotaL !== 'number') vessel.monthlyFuelQuotaL = DEFAULT_MONTHLY_FUEL_QUOTA_L;
        });
    });
  }
}

export const db = new FishPortDatabase();

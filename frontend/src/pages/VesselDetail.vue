<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useVesselStore } from '../stores/vesselStore';
import { usePortStore } from '../stores/portStore';
import VesselSpecTable from '../components/common/VesselSpecTable.vue';
import EmptyState from '../components/common/EmptyState.vue';
import type { PortCall } from '../types/call';
import { daysUntilExpiry, expiryText, powerTier, tonnageTier } from '../utils/tonnage';
import { formatDateTime, formatNumber } from '../utils/format';
import { monthLabel, monthSupplyUsage } from '../utils/quota';

const route = useRoute();
const router = useRouter();
const vesselStore = useVesselStore();
const portStore = usePortStore();

const vesselId = computed(() => String(route.params.id ?? ''));
const vessel = computed(() => vesselStore.vesselById(vesselId.value));
const loaded = ref(false);

const calls = computed<PortCall[]>(() => (vessel.value ? portStore.callsOfVessel(vessel.value.id) : []));

const occupancy = computed(() => {
  if (!vessel.value) return [] as Array<{ portName: string; berthNo: string; berthAt: string | null }>;
  return portStore.berths
    .filter((b) => b.vesselId === vessel.value!.id && b.status === '占用')
    .map((b) => ({
      portName: portStore.portById(b.portId)?.name ?? b.portId,
      berthNo: b.berthNo,
      berthAt: b.berthAt,
    }));
});

const expiryDays = computed(() => (vessel.value ? daysUntilExpiry(vessel.value.certificateExpiry) : Number.NaN));

const expiryTagType = computed(() => {
  const days = expiryDays.value;
  if (Number.isNaN(days)) return 'info';
  if (days < 0) return 'danger';
  if (days <= 90) return 'warning';
  return 'success';
});

const totals = computed(() => ({
  ice: calls.value.reduce((sum, c) => sum + c.iceKg, 0),
  fuel: calls.value.reduce((sum, c) => sum + c.fuelL, 0),
  unload: calls.value.reduce((sum, c) => sum + c.unloadKg, 0),
}));

/** 当月（自然月）额度使用情况：既有流水与旧档案一并统计 */
const currentMonthLabel = computed(() => monthLabel(new Date()));
const monthUsage = computed(() =>
  vessel.value ? monthSupplyUsage(portStore.calls, vessel.value.id, new Date()) : { iceKg: 0, fuelL: 0 },
);
const iceRemaining = computed(() => (vessel.value ? vessel.value.monthlyIceQuotaKg - monthUsage.value.iceKg : 0));
const fuelRemaining = computed(() => (vessel.value ? vessel.value.monthlyFuelQuotaL - monthUsage.value.fuelL : 0));

const quotaDialogVisible = ref(false);
const quotaSaving = ref(false);
const quotaForm = reactive({ monthlyIceQuotaKg: 0, monthlyFuelQuotaL: 0 });

function openQuotaDialog(): void {
  if (!vessel.value) return;
  quotaForm.monthlyIceQuotaKg = vessel.value.monthlyIceQuotaKg;
  quotaForm.monthlyFuelQuotaL = vessel.value.monthlyFuelQuotaL;
  quotaDialogVisible.value = true;
}

async function saveQuota(): Promise<void> {
  if (!vessel.value) return;
  quotaSaving.value = true;
  try {
    await vesselStore.updateVessel(vessel.value.id, {
      monthlyIceQuotaKg: Number(quotaForm.monthlyIceQuotaKg) || 0,
      monthlyFuelQuotaL: Number(quotaForm.monthlyFuelQuotaL) || 0,
    });
    quotaDialogVisible.value = false;
    ElMessage.success('已更新每月补给额度');
  } catch (error) {
    ElMessage.error(`保存失败：${(error as Error).message}`);
  } finally {
    quotaSaving.value = false;
  }
}

function timelineType(call: PortCall): 'primary' | 'success' {
  return call.type === '进港' ? 'primary' : 'success';
}

async function bootstrap(): Promise<void> {
  if (!vesselStore.vessels.length) await vesselStore.loadAll();
  if (!portStore.calls.length) await portStore.loadAll();
  loaded.value = true;
}

onMounted(bootstrap);
watch(vesselId, bootstrap);
</script>

<template>
  <section class="page">
    <el-breadcrumb separator="/">
      <el-breadcrumb-item :to="{ path: '/vessels' }">渔船检索</el-breadcrumb-item>
      <el-breadcrumb-item>{{ vessel ? vessel.name : '渔船档案' }}</el-breadcrumb-item>
    </el-breadcrumb>

    <template v-if="vessel">
      <header class="page__head">
        <div>
          <h1>{{ vessel.name }}</h1>
          <p class="page__sub">
            渔船编号 {{ vessel.vesselNo }} · 船籍港 {{ vessel.homePort }} · 船主 {{ vessel.owner }}
          </p>
        </div>
        <div class="page__head-actions">
          <el-tag effect="dark">{{ vessel.operationType }}</el-tag>
          <el-tag type="info" effect="plain">{{ vessel.hullMaterial }}</el-tag>
          <el-button type="primary" @click="router.push('/calls')">登记进出港</el-button>
        </div>
      </header>

      <el-row :gutter="16">
        <el-col :lg="16" :md="24">
          <VesselSpecTable :vessels="[vessel]" :clickable="false" />
        </el-col>
        <el-col :lg="8" :md="24">
          <el-card shadow="never" class="detail-card">
            <template #header><span class="card-title">档案要点</span></template>
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="总吨位">
                {{ formatNumber(vessel.grossTonnage) }} t（{{ tonnageTier(vessel.grossTonnage) }}）
              </el-descriptions-item>
              <el-descriptions-item label="主机功率">
                {{ formatNumber(vessel.enginePower, 0) }} kW（{{ powerTier(vessel.enginePower) }}）
              </el-descriptions-item>
              <el-descriptions-item label="证书有效期">
                {{ vessel.certificateExpiry }}
                <el-tag size="small" :type="expiryTagType" data-testid="expiry-tag">{{ expiryText(vessel.certificateExpiry) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="累计进出港">{{ calls.length }} 次</el-descriptions-item>
              <el-descriptions-item label="累计加冰 / 加油">
                {{ formatNumber(totals.ice, 0) }} kg / {{ formatNumber(totals.fuel, 0) }} L
              </el-descriptions-item>
              <el-descriptions-item label="累计卸货">{{ formatNumber(totals.unload, 0) }} kg</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card shadow="never" class="detail-card">
            <template #header>
              <div class="card-head">
                <span class="card-title">每月补给额度</span>
                <el-button text type="primary" size="small" data-testid="open-quota-dialog" @click="openQuotaDialog">维护额度</el-button>
              </div>
            </template>
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="加冰额度">{{ formatNumber(vessel.monthlyIceQuotaKg, 0) }} kg / 月</el-descriptions-item>
              <el-descriptions-item label="加油额度">{{ formatNumber(vessel.monthlyFuelQuotaL, 0) }} L / 月</el-descriptions-item>
              <el-descriptions-item :label="`${currentMonthLabel}已用`">
                加冰 {{ formatNumber(monthUsage.iceKg, 0) }} kg · 加油 {{ formatNumber(monthUsage.fuelL, 0) }} L
              </el-descriptions-item>
              <el-descriptions-item :label="`${currentMonthLabel}剩余`">
                <span :class="{ 'quota-danger': iceRemaining <= 0 }">加冰 {{ formatNumber(iceRemaining, 0) }} kg</span>
                ·
                <span :class="{ 'quota-danger': fuelRemaining <= 0 }">加油 {{ formatNumber(fuelRemaining, 0) }} L</span>
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card shadow="never" class="detail-card">
            <template #header><span class="card-title">当前泊位</span></template>
            <el-table :data="occupancy" size="small" border empty-text="该船当前不在港">
              <el-table-column prop="portName" label="渔港" min-width="130" />
              <el-table-column prop="berthNo" label="泊位号" width="90" />
              <el-table-column label="靠泊时间" min-width="150">
                <template #default="scope">{{ formatDateTime(scope.row.berthAt) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="detail-card">
        <template #header><span class="card-title">进出港记录时间线（{{ calls.length }} 条）</span></template>
        <el-timeline v-if="calls.length" data-testid="call-timeline">
          <el-timeline-item
            v-for="call in calls"
            :key="call.id"
            :timestamp="formatDateTime(call.time)"
            :type="timelineType(call)"
            placement="top"
          >
            <div class="timeline-row">
              <el-tag size="small" :type="call.type === '进港' ? 'primary' : 'success'">{{ call.type }}</el-tag>
              <span>泊位 {{ call.berthNo }}</span>
              <span>加冰 {{ formatNumber(call.iceKg, 0) }} kg</span>
              <span>加油 {{ formatNumber(call.fuelL, 0) }} L</span>
              <span>卸货 {{ formatNumber(call.unloadKg, 0) }} kg</span>
              <el-tag size="small" type="info" effect="plain">{{ call.visaStatus }}</el-tag>
            </div>
          </el-timeline-item>
        </el-timeline>
        <EmptyState v-else title="暂无进出港记录" description="该渔船尚未登记进出港流水，可前往登记页补录。">
          <el-button type="primary" @click="router.push('/calls')">登记进出港</el-button>
        </EmptyState>
      </el-card>
    </template>

    <EmptyState v-else-if="loaded" title="未找到该渔船" description="该渔船档案可能尚未建立，返回检索页建档后再查看。">
      <el-button type="primary" @click="router.push('/vessels')">返回渔船检索</el-button>
    </EmptyState>

    <el-dialog v-model="quotaDialogVisible" title="维护每月补给额度" width="440px" data-testid="quota-dialog">
      <el-form label-width="140px">
        <el-form-item label="每月加冰额度 kg">
          <el-input-number id="quota-ice" v-model="quotaForm.monthlyIceQuotaKg" :min="0" :max="100000" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="每月加油额度 L">
          <el-input-number id="quota-fuel" v-model="quotaForm.monthlyFuelQuotaL" :min="0" :max="100000" :step="100" style="width: 100%" />
        </el-form-item>
      </el-form>
      <p class="quota-dialog-hint">额度由合作社按月核定，保存后立即生效；当月已用额度不受影响。</p>
      <template #footer>
        <el-button @click="quotaDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="quotaSaving" data-testid="submit-quota" @click="saveQuota">保存额度</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page__head h1 {
  margin: 0;
  font-size: 22px;
  color: #17324d;
}
.page__sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: #6b7c8c;
}
.page__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-card {
  border-radius: 10px;
  margin-bottom: 16px;
}
.card-title {
  font-weight: 600;
  color: #17324d;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.quota-danger {
  color: #c45656;
  font-weight: 600;
}
.quota-dialog-hint {
  margin: 0;
  font-size: 12px;
  color: #7b8a99;
}
.timeline-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #4b5c6d;
}
</style>

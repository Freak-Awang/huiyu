<template>
  <div class="release-manage">
    <el-card>
      <div class="toolbar">
        <el-select v-model="filters.channel" clearable placeholder="发布通道" style="width: 130px">
          <el-option label="正式版" value="stable" />
          <el-option label="测试版" value="beta" />
        </el-select>
        <el-select v-model="filters.status" clearable placeholder="状态" style="width: 140px">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="loadReleases">查询</el-button>
      </div>

      <el-alert
        title="版本草稿由受保护流水线导入；本页只审批策略。版本、URL、清单、摘要、安装包和签名信息始终只读。"
        type="info" show-icon :closable="false" class="release-alert"
      />

      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="version" label="版本" width="120" />
        <el-table-column label="通道" width="90"><template #default="{ row }">{{ row.channel === 'beta' ? '测试版' : '正式版' }}</template></el-table-column>
        <el-table-column prop="releaseName" label="更新标题" min-width="180" />
        <el-table-column label="灰度" width="90"><template #default="{ row }">{{ row.rolloutPercentage }}%</template></el-table-column>
        <el-table-column label="更新类型" width="100"><template #default="{ row }"><el-tag :type="row.forceUpdate ? 'danger' : 'success'">{{ row.forceUpdate ? '强制' : '普通' }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="artifactVerifiedAt" label="产物验证时间" min-width="170" />
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">查看/策略</el-button>
            <el-button v-if="row.status === 'DRAFT' || row.status === 'PAUSED'" link type="success" @click="publish(row)">发布</el-button>
            <el-button v-if="row.status === 'PUBLISHED'" link type="warning" @click="pause(row)">暂停</el-button>
            <el-button link @click="showStatistics(row)">统计</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total, sizes, prev, pager, next" @current-change="loadReleases" @size-change="loadReleases" /></div>
    </el-card>

    <el-dialog v-model="dialogVisible" title="发布策略与产物证据" width="820px" :close-on-click-modal="false">
      <el-form :model="form" label-width="130px">
        <el-divider content-position="left">只读产物身份</el-divider>
        <div class="form-grid">
          <el-form-item label="版本"><el-input v-model="form.version" disabled /></el-form-item>
          <el-form-item label="通道"><el-input v-model="form.channel" disabled /></el-form-item>
          <el-form-item label="平台"><el-input v-model="form.platform" disabled /></el-form-item>
          <el-form-item label="架构"><el-input v-model="form.arch" disabled /></el-form-item>
          <el-form-item label="清单"><el-input v-model="form.manifestName" disabled /></el-form-item>
          <el-form-item label="安装包"><el-input v-model="form.installerName" disabled /></el-form-item>
        </div>
        <el-form-item label="不可变 URL"><el-input v-model="form.updateBaseUrl" disabled /></el-form-item>
        <el-form-item label="构建提交"><el-input v-model="form.sourceCommit" disabled /></el-form-item>
        <el-form-item label="清单 SHA-256"><el-input v-model="form.manifestDigest" disabled /></el-form-item>
        <el-form-item label="安装包 SHA-512"><el-input v-model="form.installerSha512" disabled /></el-form-item>
        <el-form-item label="签名证书指纹"><el-input v-model="form.signerThumbprint" disabled /></el-form-item>
        <div class="form-grid">
          <el-form-item label="安装包字节数"><el-input v-model="form.installerSize" disabled /></el-form-item>
          <el-form-item label="验证时间"><el-input v-model="form.artifactVerifiedAt" disabled /></el-form-item>
        </div>

        <el-divider content-position="left">可审批策略</el-divider>
        <div class="form-grid">
          <el-form-item label="最低支持版本"><el-input v-model="form.minimumVersion" :disabled="!policyEditable" placeholder="盘点后填写" /></el-form-item>
          <el-form-item label="灰度比例"><el-input-number v-model="form.rolloutPercentage" :disabled="!policyEditable" :min="0" :max="100" /></el-form-item>
        </div>
        <el-form-item label="更新标题" required><el-input v-model="form.releaseName" :disabled="!policyEditable" /></el-form-item>
        <el-form-item label="更新日志"><el-input v-model="form.releaseNotesText" :disabled="!policyEditable" type="textarea" :rows="4" placeholder="每行一条用户可见说明" /></el-form-item>
        <el-form-item label="强制更新"><el-switch v-model="form.forceUpdate" :disabled="!policyEditable" /><span class="form-note">首次正式发布必须关闭</span></el-form-item>
        <el-form-item v-if="form.forceUpdate || form.minimumVersion" label="确认版本号" required><el-input v-model="form.confirmationVersion" :disabled="!policyEditable" :placeholder="form.version" /></el-form-item>

        <el-divider content-position="left">定向规则（逗号或换行分隔）</el-divider>
        <div class="target-grid">
          <el-form-item label="设备白名单"><el-input v-model="form.allowDevices" :disabled="!policyEditable" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="设备黑名单"><el-input v-model="form.denyDevices" :disabled="!policyEditable" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="用户白名单"><el-input v-model="form.allowUsers" :disabled="!policyEditable" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="用户黑名单"><el-input v-model="form.denyUsers" :disabled="!policyEditable" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="部门白名单"><el-input v-model="form.allowDepts" :disabled="!policyEditable" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="部门黑名单"><el-input v-model="form.denyDepts" :disabled="!policyEditable" type="textarea" :rows="2" /></el-form-item>
        </div>
        <el-form-item label="变更原因" required><el-input v-model="form.reason" :disabled="!policyEditable" type="textarea" :rows="2" maxlength="500" show-word-limit /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">关闭</el-button>
        <el-button v-if="policyEditable" type="primary" :loading="saving" @click="submit">保存策略</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statsVisible" title="版本更新统计" width="620px">
      <div v-if="statistics" class="stats-summary">
        <el-statistic title="下载成功率" :value="statistics.downloadSuccessRate || 0" suffix="%" :precision="1" />
        <el-statistic title="安装后启动率" :value="statistics.installStartRate || 0" suffix="%" :precision="1" />
      </div>
      <el-table :data="statistics?.events || []" border><el-table-column prop="eventType" label="事件" /><el-table-column prop="eventCount" label="次数" /><el-table-column prop="deviceCount" label="设备数" /></el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRelease, getReleasePage, getReleaseStatistics, pauseRelease, publishRelease, updateReleasePolicy,
  type ClientRelease, type TargetRule,
} from '../api/release'
import { validateReleaseApproval } from '../utils/releasePolicy'

const loading = ref(false)
const saving = ref(false)
const rows = ref<ClientRelease[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ channel: '', status: '' })
const dialogVisible = ref(false)
const editingStatus = ref<ClientRelease['status']>('DRAFT')
const statsVisible = ref(false)
const statistics = ref<any>(null)
const statusOptions = [
  { label: '草稿', value: 'DRAFT' }, { label: '已发布', value: 'PUBLISHED' },
  { label: '已暂停', value: 'PAUSED' }, { label: '已替代', value: 'REPLACED' },
]

const emptyForm = () => ({
  id: 0, version: '', channel: 'stable' as 'stable' | 'beta', platform: 'win32', arch: 'x64',
  releaseName: '', releaseNotesText: '', minimumVersion: '', forceUpdate: false, rolloutPercentage: 0,
  updateBaseUrl: '', manifestName: '', manifestDigest: '', installerName: '', installerSize: '',
  installerSha512: '', sourceCommit: '', signerThumbprint: '', artifactVerifiedAt: '',
  allowDevices: '', denyDevices: '', allowUsers: '', denyUsers: '', allowDepts: '', denyDepts: '',
  reason: '', confirmationVersion: '',
})
const form = reactive(emptyForm())
const policyEditable = computed(() => editingStatus.value !== 'REPLACED')

function statusLabel(value: string) { return statusOptions.find((item) => item.value === value)?.label || value }
function statusType(value: string) { return value === 'PUBLISHED' ? 'success' : value === 'PAUSED' ? 'warning' : value === 'REPLACED' ? 'info' : 'primary' }
function splitValues(value: string) { return value.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean) }
function rules(value: string, targetType: TargetRule['targetType'], mode: TargetRule['mode']): TargetRule[] { return splitValues(value).map((targetValue) => ({ targetType, targetValue, mode })) }
function errorText(error: any) { return error?.response?.data?.message || error?.message || '操作失败，请检查服务端验证日志' }
function canceled(error: unknown) { return error === 'cancel' || error === 'close' }

async function loadReleases() {
  loading.value = true
  try {
    const { data } = await getReleasePage({ channel: filters.channel || undefined, status: filters.status || undefined, page: page.value, pageSize: pageSize.value })
    rows.value = data.records || []
    total.value = data.total || 0
  } catch (error) { ElMessage.error(errorText(error)) }
  finally { loading.value = false }
}

async function openEdit(row: ClientRelease) {
  try {
    const { data } = await getRelease(row.id)
    const release = data.release as ClientRelease
    const targets = data.targets as TargetRule[]
    Object.assign(form, emptyForm(), release, {
      installerSize: String(release.installerSize || ''),
      releaseNotesText: release.releaseNotes || '',
    })
    for (const target of targets) {
      const key = `${target.mode === 'ALLOW' ? 'allow' : 'deny'}${target.targetType === 'DEVICE' ? 'Devices' : target.targetType === 'USER' ? 'Users' : 'Depts'}`
      ;(form as any)[key] = [(form as any)[key], target.targetValue].filter(Boolean).join('\n')
    }
    editingStatus.value = release.status
    dialogVisible.value = true
  } catch (error) { ElMessage.error(errorText(error)) }
}

async function submit() {
  const validation = validateReleaseApproval(form.version, form.reason, form.forceUpdate, form.minimumVersion, form.confirmationVersion)
  if (!form.releaseName) return void ElMessage.warning('请填写更新标题')
  if (validation) return void ElMessage.warning(validation)
  saving.value = true
  try {
    await updateReleasePolicy(form.id, {
      releaseName: form.releaseName,
      releaseNotes: form.releaseNotesText.split('\n').map((item) => item.trim()).filter(Boolean),
      minimumVersion: form.minimumVersion || undefined,
      forceUpdate: form.forceUpdate,
      rolloutPercentage: form.rolloutPercentage,
      confirmationVersion: form.forceUpdate || form.minimumVersion ? form.confirmationVersion : undefined,
      reason: form.reason.trim(),
      targets: [
        ...rules(form.allowDevices, 'DEVICE', 'ALLOW'), ...rules(form.denyDevices, 'DEVICE', 'DENY'),
        ...rules(form.allowUsers, 'USER', 'ALLOW'), ...rules(form.denyUsers, 'USER', 'DENY'),
        ...rules(form.allowDepts, 'DEPT', 'ALLOW'), ...rules(form.denyDepts, 'DEPT', 'DENY'),
      ],
    })
    ElMessage.success('发布策略已保存并写入审计记录')
    dialogVisible.value = false
    await loadReleases()
  } catch (error) { ElMessage.error(errorText(error)) }
  finally { saving.value = false }
}

async function publish(row: ClientRelease) {
  try {
    const reasonResult = await ElMessageBox.prompt('填写本次发布原因。后端将重新回读并校验 manifest、EXE 和 blockmap。', `发布 ${row.version}`, { inputType: 'textarea', inputValidator: (value) => !!value.trim() || '必须填写原因', type: 'warning' })
    let confirmationVersion: string | undefined
    if (row.forceUpdate || row.minimumVersion) {
      const result = await ElMessageBox.prompt(`这是强制更新。请输入版本号 ${row.version} 二次确认。`, '强制更新确认', { inputValidator: (value) => value === row.version || '版本号不匹配', type: 'error' })
      confirmationVersion = result.value
    }
    await publishRelease(row.id, { reason: reasonResult.value.trim(), confirmationVersion })
    ElMessage.success('版本已发布')
    await loadReleases()
  } catch (error) { if (!canceled(error)) ElMessage.error(errorText(error)) }
}

async function pause(row: ClientRelease) {
  try {
    const result = await ElMessageBox.prompt(`暂停 ${row.version} 后，客户端安装前复核将拒绝该发布。请填写原因。`, '暂停确认', { inputType: 'textarea', inputValidator: (value) => !!value.trim() || '必须填写原因', type: 'warning' })
    await pauseRelease(row.id, { reason: result.value.trim() })
    ElMessage.success('版本已暂停')
    await loadReleases()
  } catch (error) { if (!canceled(error)) ElMessage.error(errorText(error)) }
}

async function showStatistics(row: ClientRelease) {
  try {
    statistics.value = (await getReleaseStatistics(row.id)).data
    statsVisible.value = true
  } catch (error) { ElMessage.error(errorText(error)) }
}

void loadReleases()
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 14px; }
.release-alert { margin-bottom: 16px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.form-grid, .target-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
.form-note { margin-left: 12px; color: #909399; font-size: 12px; }
.stats-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
</style>

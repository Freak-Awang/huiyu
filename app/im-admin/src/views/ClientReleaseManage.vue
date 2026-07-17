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
        <el-button type="primary" @click="openCreate">创建版本</el-button>
      </div>

      <el-alert title="安装包、blockmap 和更新清单由 Self-hosted Runner 签名并原子发布；本页面只管理策略、灰度和暂停。" type="info" show-icon :closable="false" class="release-alert" />

      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="version" label="版本" width="110" />
        <el-table-column label="通道" width="90"><template #default="{ row }">{{ row.channel === 'beta' ? '测试版' : '正式版' }}</template></el-table-column>
        <el-table-column prop="releaseName" label="更新标题" min-width="180" />
        <el-table-column label="灰度" width="90"><template #default="{ row }">{{ row.rolloutPercentage }}%</template></el-table-column>
        <el-table-column label="更新类型" width="100"><template #default="{ row }"><el-tag :type="row.forceUpdate ? 'danger' : 'success'">{{ row.forceUpdate ? '强制' : '普通' }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="publishedAt" label="发布时间" min-width="170" />
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status === 'DRAFT' || row.status === 'PAUSED'" link type="success" @click="publish(row)">发布</el-button>
            <el-button v-if="row.status === 'PUBLISHED'" link type="warning" @click="pause(row)">暂停</el-button>
            <el-button link @click="showStatistics(row)">统计</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total, sizes, prev, pager, next" @current-change="loadReleases" @size-change="loadReleases" /></div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑客户端版本' : '创建客户端版本'" width="760px" :close-on-click-modal="false">
      <el-form :model="form" label-width="120px">
        <div class="form-grid">
          <el-form-item label="版本号" required><el-input v-model="form.version" :disabled="immutable" placeholder="0.0.4" /></el-form-item>
          <el-form-item label="发布通道" required><el-select v-model="form.channel" :disabled="immutable"><el-option label="正式版" value="stable" /><el-option label="测试版" value="beta" /></el-select></el-form-item>
          <el-form-item label="平台"><el-input v-model="form.platform" :disabled="immutable" /></el-form-item>
          <el-form-item label="架构"><el-input v-model="form.arch" :disabled="immutable" /></el-form-item>
          <el-form-item label="最低支持版本"><el-input v-model="form.minimumVersion" placeholder="留空表示不限制" /></el-form-item>
          <el-form-item label="灰度比例"><el-input-number v-model="form.rolloutPercentage" :min="0" :max="100" /></el-form-item>
        </div>
        <el-form-item label="更新标题" required><el-input v-model="form.releaseName" /></el-form-item>
        <el-form-item label="更新日志"><el-input v-model="form.releaseNotesText" type="textarea" :rows="4" placeholder="每行一条用户可见更新说明" /></el-form-item>
        <el-form-item label="强制更新"><el-switch v-model="form.forceUpdate" /><span class="form-note">仅用于严重兼容或安全问题，发布前需二次确认</span></el-form-item>
        <el-divider content-position="left">流水线产物信息</el-divider>
        <el-form-item label="更新基础地址" required><el-input v-model="form.updateBaseUrl" :disabled="immutable" placeholder="http://172.16.59.253:88/downloads/arttalk/stable/win-x64/" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="安装包文件名" required><el-input v-model="form.installerName" :disabled="immutable" /></el-form-item>
          <el-form-item label="文件大小"><el-input-number v-model="form.installerSize" :disabled="immutable" :min="0" :controls="false" /></el-form-item>
        </div>
        <el-form-item label="安装包 SHA512" required><el-input v-model="form.installerSha512" :disabled="immutable" /></el-form-item>
        <el-divider content-position="left">定向规则（逗号或换行分隔）</el-divider>
        <div class="target-grid">
          <el-form-item label="设备白名单"><el-input v-model="form.allowDevices" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="设备黑名单"><el-input v-model="form.denyDevices" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="用户白名单"><el-input v-model="form.allowUsers" type="textarea" :rows="2" placeholder="用户 ID" /></el-form-item>
          <el-form-item label="用户黑名单"><el-input v-model="form.denyUsers" type="textarea" :rows="2" placeholder="用户 ID" /></el-form-item>
          <el-form-item label="部门白名单"><el-input v-model="form.allowDepts" type="textarea" :rows="2" placeholder="部门 ID" /></el-form-item>
          <el-form-item label="部门黑名单"><el-input v-model="form.denyDepts" type="textarea" :rows="2" placeholder="部门 ID" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submit">保存</el-button></template>
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
import { getRelease, getReleasePage, getReleaseStatistics, pauseRelease, publishRelease, saveRelease, type ClientRelease, type TargetRule } from '../api/release'

const loading = ref(false)
const saving = ref(false)
const rows = ref<ClientRelease[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ channel: '', status: '' })
const dialogVisible = ref(false)
const editingStatus = ref('DRAFT')
const statsVisible = ref(false)
const statistics = ref<any>(null)
const statusOptions = [
  { label: '草稿', value: 'DRAFT' }, { label: '已发布', value: 'PUBLISHED' },
  { label: '已暂停', value: 'PAUSED' }, { label: '已替代', value: 'REPLACED' },
]

const emptyForm = () => ({
  id: undefined as number | undefined, version: '', channel: 'stable' as 'stable' | 'beta', platform: 'win32', arch: 'x64',
  releaseName: '', releaseNotesText: '', minimumVersion: '', forceUpdate: false, rolloutPercentage: 10,
  updateBaseUrl: 'http://172.16.59.253:88/downloads/arttalk/stable/win-x64/', installerName: '', installerSize: 0,
  installerSha512: '', allowDevices: '', denyDevices: '', allowUsers: '', denyUsers: '', allowDepts: '', denyDepts: '',
})
const form = reactive(emptyForm())
const immutable = computed(() => editingStatus.value !== 'DRAFT')

function statusLabel(value: string) { return statusOptions.find((item) => item.value === value)?.label || value }
function statusType(value: string) { return value === 'PUBLISHED' ? 'success' : value === 'PAUSED' ? 'warning' : value === 'REPLACED' ? 'info' : 'primary' }
function splitValues(value: string) { return value.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean) }
function rules(value: string, targetType: TargetRule['targetType'], mode: TargetRule['mode']): TargetRule[] { return splitValues(value).map((targetValue) => ({ targetType, targetValue, mode })) }

async function loadReleases() {
  loading.value = true
  try {
    const { data } = await getReleasePage({ channel: filters.channel || undefined, status: filters.status || undefined, page: page.value, pageSize: pageSize.value })
    rows.value = data.records || []
    total.value = data.total || 0
  } finally { loading.value = false }
}

function openCreate() { Object.assign(form, emptyForm()); editingStatus.value = 'DRAFT'; dialogVisible.value = true }
async function openEdit(row: ClientRelease) {
  const { data } = await getRelease(row.id)
  const release = data.release as ClientRelease
  const targets = data.targets as TargetRule[]
  Object.assign(form, emptyForm(), release, { releaseNotesText: release.releaseNotes || '' })
  for (const target of targets) {
    const key = `${target.mode === 'ALLOW' ? 'allow' : 'deny'}${target.targetType === 'DEVICE' ? 'Devices' : target.targetType === 'USER' ? 'Users' : 'Depts'}` as keyof typeof form
    ;(form as any)[key] = [String((form as any)[key] || ''), target.targetValue].filter(Boolean).join('\n')
  }
  editingStatus.value = release.status
  dialogVisible.value = true
}

async function submit() {
  if (!form.version || !form.releaseName || !form.updateBaseUrl || !form.installerName || !form.installerSha512) {
    ElMessage.warning('请填写版本、标题和流水线产物信息')
    return
  }
  saving.value = true
  try {
    await saveRelease({
      id: form.id, version: form.version, channel: form.channel, platform: form.platform, arch: form.arch,
      releaseName: form.releaseName, releaseNotes: form.releaseNotesText.split('\n').map((item) => item.trim()).filter(Boolean),
      minimumVersion: form.minimumVersion || undefined, forceUpdate: form.forceUpdate, rolloutPercentage: form.rolloutPercentage,
      updateBaseUrl: form.updateBaseUrl, installerName: form.installerName, installerSize: form.installerSize || undefined,
      installerSha512: form.installerSha512,
      targets: [
        ...rules(form.allowDevices, 'DEVICE', 'ALLOW'), ...rules(form.denyDevices, 'DEVICE', 'DENY'),
        ...rules(form.allowUsers, 'USER', 'ALLOW'), ...rules(form.denyUsers, 'USER', 'DENY'),
        ...rules(form.allowDepts, 'DEPT', 'ALLOW'), ...rules(form.denyDepts, 'DEPT', 'DENY'),
      ],
    })
    ElMessage.success('版本已保存')
    dialogVisible.value = false
    await loadReleases()
  } finally { saving.value = false }
}

async function publish(row: ClientRelease) {
  await ElMessageBox.confirm(`发布 ${row.version} 后客户端将按灰度策略收到更新，确认流水线文件已完整发布？`, '发布确认', { type: 'warning' })
  await publishRelease(row.id); ElMessage.success('版本已发布'); await loadReleases()
}
async function pause(row: ClientRelease) {
  await ElMessageBox.confirm(`暂停 ${row.version} 后新设备将不再收到该版本。`, '暂停确认', { type: 'warning' })
  await pauseRelease(row.id); ElMessage.success('版本已暂停'); await loadReleases()
}
async function showStatistics(row: ClientRelease) { statistics.value = (await getReleaseStatistics(row.id)).data; statsVisible.value = true }

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

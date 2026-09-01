<!-- 客户端版本发布管理：版本列表、新版本发布（安装包上传）、灰度策略配置、更新统计 -->
<template>
  <div class="release-manage">
    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="已追踪设备" :value="statistics.trackedDevices || 0" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="安装成功" :value="statistics.installSuccessCount || 0" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="安装失败" :value="statistics.installFailedCount || 0" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="安装成功率" :value="statistics.installSuccessRate ?? '-'" suffix="%" />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>客户端版本</span>
          <div class="header-actions">
            <el-select v-model="query.channel" placeholder="全部渠道" clearable style="width: 140px" @change="loadVersions">
              <el-option label="stable" value="stable" />
              <el-option label="beta" value="beta" />
              <el-option label="alpha" value="alpha" />
            </el-select>
            <el-button type="primary" :icon="Upload" @click="openPublishDialog">发布新版本</el-button>
          </div>
        </div>
      </template>

      <el-table :data="versions" v-loading="loading" stripe>
        <el-table-column prop="version" label="版本号" width="110" />
        <el-table-column prop="buildNumber" label="构建号" width="110" />
        <el-table-column prop="channel" label="渠道" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ row.channel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="updateTypeTag(row.updateType)">{{ updateTypeLabel(row.updateType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="minVersion" label="最低兼容" width="100">
          <template #default="{ row }">{{ row.minVersion || '-' }}</template>
        </el-table-column>
        <el-table-column label="强制截止" width="160">
          <template #default="{ row }">{{ row.forceDeadline || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="160" />
        <el-table-column label="操作" min-width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== 1" link type="success" @click="changeStatus(row, 1)">发布</el-button>
            <el-button v-if="row.status === 1" link type="warning" @click="changeStatus(row, 2)">下架</el-button>
            <el-button link type="primary" @click="openGrayDialog(row)">灰度策略</el-button>
            <el-button link type="info" @click="openPackagesDrawer(row)">更新包</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pagination"
        background
        layout="total, prev, pager, next"
        :total="total"
        :current-page="query.page"
        :page-size="query.pageSize"
        @current-change="(page: number) => { query.page = page; loadVersions() }"
      />
    </el-card>

    <!-- 发布新版本对话框 -->
    <el-dialog v-model="publishDialogVisible" title="发布新版本" width="560px" :close-on-click-modal="false">
      <el-form :model="publishForm" label-width="110px">
        <el-form-item label="安装包" required>
          <input ref="fileInputRef" type="file" accept=".exe,.msi,.zip,.7z" @change="handleFileChange" />
          <div class="form-tip">支持 NSIS 安装包（.exe），上传后自动计算 SHA256 并签名，异步生成增量补丁</div>
        </el-form-item>
        <el-form-item label="版本号" required>
          <el-input v-model="publishForm.version" placeholder="如 3.2.5" style="width: 180px" />
        </el-form-item>
        <el-form-item label="构建号" required>
          <el-input-number v-model="publishForm.buildNumber" :min="1" style="width: 180px" />
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="publishForm.channel" style="width: 180px">
            <el-option label="stable" value="stable" />
            <el-option label="beta" value="beta" />
            <el-option label="alpha" value="alpha" />
          </el-select>
        </el-form-item>
        <el-form-item label="更新类型">
          <el-radio-group v-model="publishForm.updateType">
            <el-radio value="full">全量</el-radio>
            <el-radio value="force">强制</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="更新日志">
          <el-input
            v-model="publishForm.changelog"
            type="textarea"
            :rows="4"
            placeholder="每行一条更新说明"
          />
        </el-form-item>
        <el-form-item label="最低兼容版本">
          <el-input v-model="publishForm.minVersion" placeholder="低于此版本强制更新（可空）" style="width: 220px" />
        </el-form-item>
        <el-form-item label="强制截止时间">
          <el-date-picker
            v-model="publishForm.forceDeadline"
            type="datetime"
            placeholder="可空"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="立即发布">
          <el-switch v-model="publishForm.publish" active-text="发布" inactive-text="存为草稿" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="submitPublish">确认发布</el-button>
      </template>
    </el-dialog>

    <!-- 灰度策略对话框 -->
    <el-dialog v-model="grayDialogVisible" :title="`灰度策略 - ${grayTarget?.version || ''}`" width="520px" :close-on-click-modal="false">
      <el-form :model="grayForm" label-width="110px">
        <el-form-item label="策略类型">
          <el-radio-group v-model="grayForm.strategyType">
            <el-radio value="all">全量发布</el-radio>
            <el-radio value="gray">百分比灰度</el-radio>
            <el-radio value="whitelist">白名单</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="grayForm.strategyType === 'gray'" label="灰度百分比">
          <el-slider v-model="grayForm.grayPercent" :min="0" :max="100" show-input />
          <div class="form-tip">按设备 ID 一致性哈希，相同设备命中结果稳定</div>
        </el-form-item>
        <el-form-item v-if="grayForm.strategyType === 'whitelist'" label="白名单设备">
          <el-input
            v-model="grayWhitelistText"
            type="textarea"
            :rows="4"
            placeholder="每行一个设备 ID"
          />
        </el-form-item>
        <el-form-item label="生效时间">
          <el-date-picker v-model="grayForm.startTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker v-model="grayForm.endTime" type="datetime" placeholder="可空，长期有效" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grayDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingGray" @click="submitGray">保存策略</el-button>
      </template>
    </el-dialog>

    <!-- 更新包抽屉 -->
    <el-drawer v-model="packagesDrawerVisible" :title="`更新包 - ${packagesTarget?.version || ''}`" size="560px">
      <el-table :data="packages" v-loading="loadingPackages" stripe>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.packageType === 'patch' ? 'warning' : 'primary'">
              {{ row.packageType === 'patch' ? '补丁' : '全量' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="fromVersion" label="起始版本" width="90">
          <template #default="{ row }">{{ row.fromVersion || '-' }}</template>
        </el-table-column>
        <el-table-column prop="fileName" label="文件名" min-width="200" show-overflow-tooltip />
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
        </el-table-column>
        <el-table-column prop="downloadCount" label="下载次数" width="90" />
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 客户端版本发布管理页：统计概览、版本 CRUD、灰度配置、更新包查看。
 */
import { onMounted, reactive, ref } from 'vue'
import { Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
    getVersionsPage,
    publishVersion,
    updateVersionStatus,
    getVersionPackages,
    saveGrayStrategy,
    getUpdateStatistics,
    type ReleaseVersion,
    type ReleasePackage,
} from '../api/release'

const loading = ref(false)
const versions = ref<ReleaseVersion[]>([])
const total = ref(0)
const query = reactive({ channel: '', page: 1, pageSize: 20 })
const statistics = ref<Record<string, any>>({})

// ---- 发布新版本 ----
const publishDialogVisible = ref(false)
const publishing = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const publishForm = reactive({
    file: null as File | null,
    version: '',
    buildNumber: 1,
    channel: 'stable',
    updateType: 'full',
    changelog: '',
    minVersion: '',
    forceDeadline: '',
    publish: true,
})

// ---- 灰度策略 ----
const grayDialogVisible = ref(false)
const savingGray = ref(false)
const grayTarget = ref<ReleaseVersion | null>(null)
const grayWhitelistText = ref('')
const grayForm = reactive({
    strategyType: 'all' as 'all' | 'gray' | 'whitelist',
    grayPercent: 10,
    startTime: '',
    endTime: '',
})

// ---- 更新包 ----
const packagesDrawerVisible = ref(false)
const loadingPackages = ref(false)
const packages = ref<ReleasePackage[]>([])
const packagesTarget = ref<ReleaseVersion | null>(null)

onMounted(() => {
    loadVersions()
    loadStatistics()
})

async function loadVersions() {
    loading.value = true
    try {
        const res = await getVersionsPage({
            channel: query.channel || undefined,
            page: query.page,
            pageSize: query.pageSize,
        })
        const body = res.data as any
        versions.value = body.data || []
        total.value = body.total || 0
    } finally {
        loading.value = false
    }
}

async function loadStatistics() {
    try {
        const res = await getUpdateStatistics()
        statistics.value = (res.data as any) || {}
    } catch {
        // 统计失败不影响主页面
    }
}

function openPublishDialog() {
    publishForm.file = null
    publishForm.version = ''
    publishForm.buildNumber = 1
    publishForm.updateType = 'full'
    publishForm.changelog = ''
    publishForm.minVersion = ''
    publishForm.forceDeadline = ''
    publishForm.publish = true
    if (fileInputRef.value) fileInputRef.value.value = ''
    publishDialogVisible.value = true
}

function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    publishForm.file = input.files?.[0] || null
}

async function submitPublish() {
    if (!publishForm.file) {
        ElMessage.warning('请选择安装包文件')
        return
    }
    if (!/^\d+\.\d+\.\d+$/.test(publishForm.version)) {
        ElMessage.warning('版本号格式应为 x.y.z')
        return
    }
    publishing.value = true
    try {
        // 更新日志按行转换为 JSON 数组
        const changelogLines = publishForm.changelog
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        await publishVersion({
            file: publishForm.file,
            version: publishForm.version,
            buildNumber: publishForm.buildNumber,
            channel: publishForm.channel,
            updateType: publishForm.updateType,
            changelog: changelogLines.length ? JSON.stringify(changelogLines) : undefined,
            minVersion: publishForm.minVersion || undefined,
            forceDeadline: publishForm.forceDeadline || undefined,
            publish: publishForm.publish,
        })
        ElMessage.success('版本已创建，增量补丁正在后台生成')
        publishDialogVisible.value = false
        loadVersions()
    } finally {
        publishing.value = false
    }
}

async function changeStatus(row: ReleaseVersion, status: number) {
    const action = status === 1 ? '发布' : '下架'
    try {
        await ElMessageBox.confirm(`确定${action}版本 ${row.version} 吗？`, '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning',
        })
    } catch {
        return
    }
    await updateVersionStatus(row.id, status)
    ElMessage.success(`已${action}`)
    loadVersions()
}

function openGrayDialog(row: ReleaseVersion) {
    grayTarget.value = row
    grayForm.strategyType = 'all'
    grayForm.grayPercent = 10
    grayForm.startTime = ''
    grayForm.endTime = ''
    grayWhitelistText.value = ''
    grayDialogVisible.value = true
}

async function submitGray() {
    if (!grayTarget.value) return
    savingGray.value = true
    try {
        const whitelist = grayWhitelistText.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        await saveGrayStrategy(grayTarget.value.id, {
            strategyType: grayForm.strategyType,
            grayPercent: grayForm.grayPercent,
            whitelist: grayForm.strategyType === 'whitelist' ? whitelist : undefined,
            startTime: grayForm.startTime || undefined,
            endTime: grayForm.endTime || undefined,
        })
        ElMessage.success('灰度策略已保存')
        grayDialogVisible.value = false
    } finally {
        savingGray.value = false
    }
}

async function openPackagesDrawer(row: ReleaseVersion) {
    packagesTarget.value = row
    packagesDrawerVisible.value = true
    loadingPackages.value = true
    try {
        const res = await getVersionPackages(row.id)
        packages.value = ((res.data as any) || []) as ReleasePackage[]
    } finally {
        loadingPackages.value = false
    }
}

function updateTypeLabel(type: string) {
    return { none: '无', incremental: '增量', full: '全量', force: '强制' }[type] || type
}

function updateTypeTag(type: string) {
    return { force: 'danger', incremental: 'warning', full: 'primary', none: 'info' }[type] as any || 'info'
}

function statusLabel(status: number) {
    return { 0: '草稿', 1: '已发布', 2: '已下架' }[status] || '未知'
}

function statusTag(status: number) {
    return { 0: 'info', 1: 'success', 2: 'danger' }[status] as any || 'info'
}

function formatSize(bytes?: number) {
    const value = bytes || 0
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${value} B`
}
</script>

<style scoped>
.release-manage {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.header-actions {
    display: flex;
    gap: 12px;
}

.pagination {
    margin-top: 16px;
    justify-content: flex-end;
}

.form-tip {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
    margin-top: 4px;
}
</style>

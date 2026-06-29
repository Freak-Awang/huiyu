<template>
  <div class="user-manage">
    <el-card>
      <div class="search-bar">
        <el-input
          v-model="searchKeyword"
          placeholder="输入用户名/昵称/邮箱搜索"
          clearable
          style="width: 240px"
          @keyup.enter="handleSearch"
        />
        <el-select
          v-model="searchStatus"
          placeholder="状态筛选"
          clearable
          style="width: 140px"
        >
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="handleSearch">
          搜索
        </el-button>
        <el-button type="primary" :icon="Plus" @click="handleAdd">
          新增用户
        </el-button>
      </div>

      <el-table :data="tableData" v-loading="tableLoading" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="nickname" label="昵称" min-width="120" />
        <el-table-column prop="email" label="邮箱" min-width="160" />
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column label="部门" min-width="120">
          <template #default="{ row }">
            {{ row.deptName || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'primary'" size="small">
              {{ row.role === 'admin' ? '管理员' : '普通用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.status === 1"
              @change="(val: boolean) => handleStatusChange(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170" />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button type="warning" link :icon="Key" @click="handleResetPassword(row)">
              重置密码
            </el-button>
            <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handleSearch"
          @current-change="handleSearch"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '新增用户'"
      width="560px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="80px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="isEdit" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码（至少6位）"
          />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="请输入昵称" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="普通用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门" prop="deptId">
          <el-tree-select
            v-model="form.deptId"
            :data="deptTree"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            placeholder="请选择部门"
            check-strictly
            clearable
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="resetPasswordVisible"
      title="重置密码"
      width="420px"
      :close-on-click-modal="false"
      @closed="resetPasswordForm"
    >
      <el-form
        ref="resetPasswordFormRef"
        :model="resetPasswordData"
        :rules="resetPasswordRules"
        label-width="90px"
      >
        <el-form-item label="用户">
          <span>{{ resetPasswordTarget?.nickname || resetPasswordTarget?.username || '-' }}</span>
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="resetPasswordData.newPassword"
            type="password"
            show-password
            placeholder="请输入新密码（至少6位）"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="resetPasswordData.confirmPassword"
            type="password"
            show-password
            placeholder="请再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPasswordVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetPasswordLoading" @click="submitResetPassword">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// Intent: UserManage composes route-level UI behavior and data loading for this screen.

import { ref, reactive } from 'vue'
import { Search, Plus, Edit, Delete, Key } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules, FormItemRule } from 'element-plus'
import {
  getUsersPage,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  resetUserPassword,
} from '../api/user'
import { getDeptTree } from '../api/dept'

interface UserRecord {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  role: string
  deptId: number
  deptName: string
  status: number
  createdAt: string
}

const searchKeyword = ref('')
const searchStatus = ref<number | null>(null)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref<UserRecord[]>([])
const tableLoading = ref(false)

const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()
const deptTree = ref<any[]>([])

const defaultForm = () => ({
  id: undefined as number | undefined,
  username: '',
  password: '',
  nickname: '',
  email: '',
  phone: '',
  role: 'user',
  deptId: undefined as number | undefined,
  status: 1,
})

const form = reactive(defaultForm())

const resetPasswordVisible = ref(false)
const resetPasswordLoading = ref(false)
const resetPasswordFormRef = ref<FormInstance>()
const resetPasswordTarget = ref<UserRecord | null>(null)
const resetPasswordData = reactive({
  newPassword: '',
  confirmPassword: '',
})

const validateConfirmPassword: FormItemRule['validator'] = (_rule, value, callback) => {
  if (!value) {
    callback(new Error('请再次输入新密码'))
    return
  }
  if (value !== resetPasswordData.newPassword) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

const formRules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, min: 6, message: '密码至少6位', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

const resetPasswordRules: FormRules = {
  newPassword: [{ required: true, min: 6, message: '密码至少6位', trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
}

function resetForm() {
  Object.assign(form, defaultForm())
  formRef.value?.resetFields()
}

function resetPasswordForm() {
  resetPasswordData.newPassword = ''
  resetPasswordData.confirmPassword = ''
  resetPasswordTarget.value = null
  resetPasswordFormRef.value?.resetFields()
}

async function fetchData() {
  tableLoading.value = true
  try {
    const res = await getUsersPage({
      keyword: searchKeyword.value || undefined,
      status: searchStatus.value ?? undefined,
      page: currentPage.value,
      pageSize: pageSize.value,
    })
    const data = res.data
    tableData.value = data.records ?? data.data ?? []
    total.value = data.total ?? 0
  } catch {
    // handled by interceptor
  } finally {
    tableLoading.value = false
  }
}

function handleSearch() {
  currentPage.value = 1
  fetchData()
}

async function loadDeptTree() {
  try {
    const res = await getDeptTree()
    deptTree.value = res.data ?? []
  } catch {
    deptTree.value = []
  }
}

function handleAdd() {
  isEdit.value = false
  loadDeptTree()
  dialogVisible.value = true
}

function handleEdit(row: UserRecord) {
  isEdit.value = true
  loadDeptTree()
  form.id = row.id
  form.username = row.username
  form.password = ''
  form.nickname = row.nickname
  form.email = row.email || ''
  form.phone = row.phone || ''
  form.role = row.role
  form.deptId = row.deptId
  form.status = row.status
  dialogVisible.value = true
}

function handleResetPassword(row: UserRecord) {
  resetPasswordTarget.value = row
  resetPasswordVisible.value = true
}

async function submitResetPassword() {
  const valid = await resetPasswordFormRef.value?.validate().catch(() => false)
  if (!valid || !resetPasswordTarget.value) return

  resetPasswordLoading.value = true
  try {
    await resetUserPassword(resetPasswordTarget.value.id, resetPasswordData.newPassword)
    ElMessage.success('密码重置成功')
    resetPasswordVisible.value = false
  } catch {
    // handled by interceptor
  } finally {
    resetPasswordLoading.value = false
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    if (isEdit.value) {
      await updateUser({
        id: form.id,
        username: form.username,
        nickname: form.nickname,
        email: form.email,
        phone: form.phone,
        role: form.role,
        deptId: form.deptId,
        status: form.status,
      })
      ElMessage.success('更新成功')
    } else {
      await createUser({
        username: form.username,
        password: form.password,
        nickname: form.nickname,
        email: form.email,
        phone: form.phone,
        role: form.role,
        deptId: form.deptId,
        status: form.status,
      })
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // handled by interceptor
  } finally {
    submitLoading.value = false
  }
}

async function handleStatusChange(row: UserRecord, val: boolean) {
  const status = val ? 1 : 0
  try {
    await updateUserStatus(row.id, status)
    row.status = status
    ElMessage.success(status === 1 ? '已启用' : '已禁用')
  } catch {
    // handled by interceptor
  }
}

function handleDelete(row: UserRecord) {
  ElMessageBox.confirm(`确定要删除用户"${row.nickname}"吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      await deleteUser(row.id)
      ElMessage.success('删除成功')
      fetchData()
    })
    .catch(() => {
      // cancelled
    })
}

fetchData()
</script>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

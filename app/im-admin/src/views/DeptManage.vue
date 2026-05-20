<template>
  <div class="dept-manage">
    <el-card>
      <div class="header-bar">
        <el-button type="primary" :icon="Plus" @click="handleAdd(null)">
          新增部门
        </el-button>
      </div>

      <el-tree
        :data="treeData"
        :props="{ label: 'name', children: 'children' }"
        node-key="id"
        default-expand-all
        :expand-on-click-node="true"
      >
        <template #default="{ node, data }">
          <div class="tree-node">
            <el-icon class="tree-node-icon"><Folder /></el-icon>
            <span class="tree-node-label">{{ data.name }}</span>
            <span class="tree-node-actions">
              <el-button
                type="primary"
                link
                :icon="Edit"
                size="small"
                @click.stop="handleEdit(data)"
              />
              <el-button
                type="danger"
                link
                :icon="Delete"
                size="small"
                @click.stop="handleDelete(data)"
              />
              <el-tag
                :type="data.status === 1 ? 'success' : 'info'"
                size="small"
                class="status-tag"
              >
                {{ data.status === 1 ? '启用' : '禁用' }}
              </el-tag>
            </span>
          </div>
        </template>
      </el-tree>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑部门' : '新增部门'"
      width="500px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="上级部门" prop="parentId">
          <el-tree-select
            v-model="form.parentId"
            :data="treeData"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            placeholder="不选则为顶级部门"
            check-strictly
            clearable
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入部门名称" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            :max="9999"
            placeholder="数字越小越靠前"
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Plus, Edit, Delete, Folder } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { getDeptTree, createDept, updateDept, deleteDept } from '../api/dept'

interface DeptNode {
  id: number
  name: string
  parentId: number
  sortOrder: number
  status: number
  children: DeptNode[]
}

const treeData = ref<DeptNode[]>([])

const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()

const defaultForm = () => ({
  id: undefined as number | undefined,
  parentId: undefined as number | undefined,
  name: '',
  sortOrder: 0,
  status: 1,
})

const form = reactive(defaultForm())

const formRules: FormRules = {
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
  sortOrder: [{ required: true, message: '请输入排序值', trigger: 'blur' }],
}

function resetForm() {
  Object.assign(form, defaultForm())
  formRef.value?.resetFields()
}

async function fetchTree() {
  try {
    const res = await getDeptTree()
    treeData.value = res.data ?? []
  } catch {
    treeData.value = []
  }
}

function handleAdd(parentDept: DeptNode | null) {
  isEdit.value = false
  form.parentId = parentDept?.id
  dialogVisible.value = true
}

function handleEdit(data: DeptNode) {
  isEdit.value = true
  form.id = data.id
  form.parentId = data.parentId
  form.name = data.name
  form.sortOrder = data.sortOrder
  form.status = data.status
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    if (isEdit.value) {
      await updateDept({
        id: form.id,
        name: form.name,
        parentId: form.parentId,
        sortOrder: form.sortOrder,
        status: form.status,
      })
      ElMessage.success('更新成功')
    } else {
      await createDept({
        name: form.name,
        parentId: form.parentId,
        sortOrder: form.sortOrder,
        status: form.status,
      })
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchTree()
  } catch {
    // handled by interceptor
  } finally {
    submitLoading.value = false
  }
}

function hasChildren(data: DeptNode): boolean {
  return !!(data.children && data.children.length > 0)
}

function handleDelete(data: DeptNode) {
  const msg = hasChildren(data)
    ? `部门"${data.name}"下存在子部门，确认删除吗？`
    : `确定要删除部门"${data.name}"吗？`

  ElMessageBox.confirm(msg, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      await deleteDept(data.id)
      ElMessage.success('删除成功')
      fetchTree()
    })
    .catch(() => {
      // cancelled
    })
}

fetchTree()
</script>

<style scoped>
.header-bar {
  margin-bottom: 16px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  padding: 4px 0;
}

.tree-node-icon {
  color: #409eff;
  font-size: 16px;
}

.tree-node-label {
  flex: 1;
  font-size: 14px;
}

.tree-node-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.tree-node:hover .tree-node-actions {
  opacity: 1;
}

.status-tag {
  margin-left: 4px;
}
</style>

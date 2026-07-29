/**
 * 部门管理 API
 * 提供部门树查询、增删改等后端接口封装。
 */
import client from './index'

/** 部门数据模型 */
export interface DeptData {
    id?: number
    name: string
    parentId?: number
    sortOrder?: number
    status: number
}

/**
 * 获取部门树
 * GET /api/admin/depts/tree
 */
export function getDeptTree() {
    return client.get('/api/admin/depts/tree')
}

/**
 * 创建部门
 * POST /api/admin/depts
 */
export function createDept(data: DeptData) {
    return client.post('/api/admin/depts', data)
}

/**
 * 更新部门
 * PUT /api/admin/depts
 */
export function updateDept(data: DeptData) {
    return client.put('/api/admin/depts', data)
}

/**
 * 删除部门
 * DELETE /api/admin/depts/{id}
 */
export function deleteDept(id: number) {
    return client.delete(`/api/admin/depts/${id}`)
}

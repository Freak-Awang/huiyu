// Intent: dept wraps backend API calls so views and stores do not depend on raw HTTP details.
import client from './index'

export interface DeptData {
    id?: number
    name: string
    parentId?: number
    sortOrder?: number
    status: number
}

export function getDeptTree() {
    return client.get('/api/admin/depts/tree')
}

export function createDept(data: DeptData) {
    return client.post('/api/admin/depts', data)
}

export function updateDept(data: DeptData) {
    return client.put('/api/admin/depts', data)
}

export function deleteDept(id: number) {
    return client.delete(`/api/admin/depts/${id}`)
}

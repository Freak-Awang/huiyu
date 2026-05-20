import http from './index'

export interface DeptNode {
  deptId: string
  name: string
  parentId: string | null
  children: DeptNode[]
}

export function getDeptTree() {
  return http.get<DeptNode[]>('/api/depts/tree')
}

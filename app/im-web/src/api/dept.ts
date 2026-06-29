// Intent: dept wraps backend API calls so views and stores do not depend on raw HTTP details.
import http from './index'

export interface DeptNode {
  id: string
  deptId: string
  name: string
  parentId: string | null
  children: DeptNode[]
}

function normalizeDept(node: any): DeptNode {
  const id = String(node.deptId ?? node.id ?? '')
  return {
    ...node,
    id,
    deptId: id,
    parentId: node.parentId == null ? null : String(node.parentId),
    children: (node.children ?? []).map(normalizeDept),
  }
}

export function getDeptTree() {
  return http.get<DeptNode[]>('/api/depts/tree').then((res) => {
    res.data = (res.data ?? []).map(normalizeDept)
    return res
  })
}

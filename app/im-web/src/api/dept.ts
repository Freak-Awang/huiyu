/**
 * 部门管理 API：封装部门树查询接口，并提供部门数据规范化转换。
 */
import http from './index'

/**
 * 部门树节点。
 */
export interface DeptNode {
  /** 节点唯一标识（与 deptId 相同） */
  id: string
  /** 部门 ID */
  deptId: string
  /** 部门名称 */
  name: string
  /** 父部门 ID，根节点为 null */
  parentId: string | null
  /** 子部门列表 */
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

/**
 * 获取部门树结构。
 * 调用 GET /api/depts/tree
 * @returns 规范化后的部门树数组
 */
export function getDeptTree() {
  return http.get<DeptNode[]>('/api/depts/tree').then((res) => {
    res.data = (res.data ?? []).map(normalizeDept)
    return res
  })
}

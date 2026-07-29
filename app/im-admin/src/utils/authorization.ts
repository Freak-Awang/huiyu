/**
 * 鉴权工具函数
 * 判断当前用户是否已登录且具备管理员角色。
 */

/**
 * 校验是否为已授权的管理员
 * @param token 登录令牌
 * @param role 用户角色
 * @returns 同时满足已登录且角色为 admin 时返回 true
 */
export function isAuthorizedAdmin(token: string | null | undefined, role: string | null | undefined) {
    return !!token && role?.toLowerCase() === 'admin'
}

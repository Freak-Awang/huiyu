export function isAuthorizedAdmin(token: string | null | undefined, role: string | null | undefined) {
    return !!token && role?.toLowerCase() === 'admin'
}

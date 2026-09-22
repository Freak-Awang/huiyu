import type { FormItemRule } from 'element-plus'

export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 18

/** 只校验，不 trim 或转换实际提交的密码。与后端的新密码规则保持一致。 */
export function getNewPasswordError(password: unknown): string | undefined {
  if (typeof password !== 'string' || /^[\s\u001c-\u001f]*$/u.test(password)) {
    return '密码不能为空或全为空白'
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return '密码需为6至18位'
  }
  return undefined
}

export const validateNewPassword: FormItemRule['validator'] = (_rule, value, callback) => {
  const error = getNewPasswordError(value)
  callback(error ? new Error(error) : undefined)
}

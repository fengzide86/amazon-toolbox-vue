import { ElMessageBox } from 'element-plus'

export interface ConfirmActionOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export async function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  try {
    await ElMessageBox.confirm(options.message, options.title, {
      confirmButtonText: options.confirmText || '确认',
      cancelButtonText: options.cancelText || '取消',
      type: options.danger ? 'warning' : 'info',
      distinguishCancelAndClose: false,
      closeOnClickModal: false,
      autofocus: true,
    })
    return true
  } catch (reason) {
    if (reason === 'cancel' || reason === 'close') return false
    throw reason
  }
}

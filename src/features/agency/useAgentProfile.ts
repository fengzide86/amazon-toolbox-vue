import { onMounted, onUnmounted, ref } from 'vue'
import { authService } from '@/utils/auth'

/** Keep account labels aligned with the same tab's persisted session. */
export function useAgentProfile() {
  const user = ref(authService.getUser())
  const refresh = (): void => { user.value = authService.getUser() }
  onMounted(() => {
    refresh()
    window.addEventListener('toolbox:user-updated', refresh)
    window.addEventListener('toolbox:auth-cleared', refresh)
  })
  onUnmounted(() => {
    window.removeEventListener('toolbox:user-updated', refresh)
    window.removeEventListener('toolbox:auth-cleared', refresh)
  })
  return user
}

import { inject, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'

export interface ShellPageHeaderCopy {
  eyebrow?: string
  title: string
  description?: string
}

interface ShellPageHeaderContext {
  current: ShallowRef<ShellPageHeaderCopy | null>
  set: (owner: symbol, value: ShellPageHeaderCopy) => void
  clear: (owner: symbol) => void
}

const shellPageHeaderKey: InjectionKey<ShellPageHeaderContext> = Symbol('shell-page-header')

export function provideShellPageHeader(): ShellPageHeaderContext {
  const current = shallowRef<ShellPageHeaderCopy | null>(null)
  let activeOwner: symbol | null = null
  const context: ShellPageHeaderContext = {
    current,
    set(owner, value) {
      activeOwner = owner
      current.value = value
    },
    clear(owner) {
      if (activeOwner !== owner) return
      activeOwner = null
      current.value = null
    },
  }
  provide(shellPageHeaderKey, context)
  return context
}

export function useShellPageHeader(): ShellPageHeaderContext | null {
  return inject(shellPageHeaderKey, null)
}

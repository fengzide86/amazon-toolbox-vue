import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExpensesView from '@/views/admin/ExpensesView.vue'
import { expenseRecordSchema, expenseRenewalSchema, expenseSummarySchema, type ExpenseRecord, type ExpenseRenewal, type ExpenseSummary } from '@/features/admin/expenses/model'

const mocks = vi.hoisted(() => ({
  getExpense: vi.fn(), getExpenseRenewal: vi.fn(), getExpenseSummary: vi.fn(),
  getExpenseCategories: vi.fn(), getExpenses: vi.fn(), getExpenseRenewals: vi.fn(),
  createExpense: vi.fn(), updateExpense: vi.fn(), uploadExpenseAttachment: vi.fn(),
  createExpenseRenewal: vi.fn(), updateExpenseRenewal: vi.fn(), confirmExpenseRenewal: vi.fn(),
  voidExpense: vi.fn(), deleteExpenseAttachment: vi.fn(), confirm: vi.fn(), prompt: vi.fn(),
  showToast: vi.fn(),
}))
vi.mock('@/utils/api', () => mocks)
vi.mock('@/utils', () => ({ showToast: mocks.showToast }))
vi.mock('@/utils/auth', () => ({ authService: { getRole: () => 'super_admin' } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: mocks.confirm, prompt: mocks.prompt } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

const expense = (id: number) => expenseRecordSchema.parse({ id, title: `支出 ${id}`, amount: 100 + id, expense_date: '2026-09-20', category_id: 1, category_name: '工具会员', status: 'active' })
const renewal = (id: number) => expenseRenewalSchema.parse({ id, name: `会员 ${id}`, default_amount: 100 + id, category_id: 1, category_name: '工具会员', cycle: 'monthly', next_due_on: '2026-09-30', reminder_days: 7, status: 'active', due_state: 'upcoming' })
const summary = (month: string, total: number) => expenseSummarySchema.parse({ month, total, previous_total: 0, change_percent: 0, count: 1, upcoming_renewals: 0, overdue_renewals: 0 })

interface ViewApi {
  drawerVisible: boolean
  drawerMode: string
  selectedExpense: ExpenseRecord | null
  selectedRenewal: ExpenseRenewal | null
  pendingFiles: File[]
  expenseForm: Record<string, unknown>
  renewalForm: Record<string, unknown>
  confirmForm: { amount: number; expense_date: string; note: string }
  expenseFilters: { month: string }
  summary: ExpenseSummary
  summaryError: string
  categoriesLoading: boolean
  categoryOptionsPending: boolean
  categoryError: string
  categories: unknown[]
  openExpenseDetail(item: ExpenseRecord): Promise<void>
  openRenewalDetail(item: ExpenseRenewal): Promise<void>
  openExpenseForm(): void
  openRenewalForm(): void
  openConfirmRenewal(item: ExpenseRenewal): void
  saveExpense(): Promise<void>
  saveRenewal(): Promise<void>
  submitConfirmRenewal(): Promise<void>
  loadSummary(): Promise<void>
  loadCategories(): Promise<void>
  editExpense(item: ExpenseRecord): void
  editRenewal(item: ExpenseRenewal): void
  handleVoidExpense(item: ExpenseRecord): Promise<void>
  handleDeleteAttachment(attachmentId: number): Promise<void>
}

describe('expense drawer and summary request ownership', () => {
  let wrapper: VueWrapper | undefined
  let view: ViewApi

  beforeEach(async () => {
    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.getExpenseCategories.mockResolvedValue([{ id: 1, code: 'tool_membership', name: '工具会员', status: 'active', sort_order: 0, is_system: true }])
    mocks.getExpenses.mockResolvedValue({ data: [], total: 0 })
    mocks.getExpenseRenewals.mockResolvedValue({ data: [], total: 0 })
    mocks.getExpenseSummary.mockResolvedValue(summary('2026-09', 100))
    mocks.uploadExpenseAttachment.mockResolvedValue({})
    mocks.confirmExpenseRenewal.mockResolvedValue({})
    mocks.confirm.mockResolvedValue('confirm')
    mocks.prompt.mockResolvedValue({ value: '重复录入' })
    wrapper = shallowMount(ExpensesView, {
      global: { stubs: {
        ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
        ElInput: true, ElSelect: true, ElOption: true, ElInputNumber: true,
        ElDatePicker: true, ElPagination: true,
      } },
    })
    view = wrapper.vm as unknown as ViewApi
    await flushPromises()
  })

  afterEach(() => { wrapper?.unmount() })

  it.each(['expense', 'renewal'] as const)('fills only the unselected new %s draft after delayed initial categories arrive', async kind => {
    const pending = deferred<unknown[]>()
    view.categories = []
    mocks.getExpenseCategories.mockReturnValueOnce(pending.promise)
    const loading = view.loadCategories()
    if (kind === 'expense') view.openExpenseForm()
    else view.openRenewalForm()
    const form = kind === 'expense' ? view.expenseForm : view.renewalForm
    Object.assign(form, kind === 'expense' ? { title: '先填写的事项', amount: 320.5 } : { name: '先填写的会员', default_amount: 99 })
    expect(view.categoryOptionsPending).toBe(true)
    expect(form.category_id).toBeUndefined()
    await (kind === 'expense' ? view.saveExpense() : view.saveRenewal())
    expect(mocks.createExpense).not.toHaveBeenCalled()
    expect(mocks.createExpenseRenewal).not.toHaveBeenCalled()
    pending.resolve([
      { id: 7, code: 'development', name: '开发', status: 'active', sort_order: 10, is_system: true },
      { id: 8, code: 'tool_membership', name: '工具会员', status: 'active', sort_order: 30, is_system: true },
    ])
    await loading
    expect(view.categoryOptionsPending).toBe(false)
    expect(form.category_id).toBe(kind === 'expense' ? 7 : 8)
    expect(form[kind === 'expense' ? 'title' : 'name']).toBe(kind === 'expense' ? '先填写的事项' : '先填写的会员')
    mocks.createExpense.mockResolvedValueOnce(expense(1))
    mocks.createExpenseRenewal.mockResolvedValueOnce(renewal(1))
    await (kind === 'expense' ? view.saveExpense() : view.saveRenewal())
    expect(kind === 'expense' ? mocks.createExpense : mocks.createExpenseRenewal).toHaveBeenCalledWith(expect.objectContaining({ category_id: kind === 'expense' ? 7 : 8 }))
  })

  it.each(['expense', 'renewal'] as const)('does not replace the selected or historical %s category during refresh', async kind => {
    if (kind === 'expense') view.editExpense({ ...expense(1), category_id: 42 })
    else view.editRenewal({ ...renewal(1), category_id: 42 })
    const form = kind === 'expense' ? view.expenseForm : view.renewalForm
    await view.loadCategories()
    expect(form.category_id).toBe(42)
    if (kind === 'expense') view.openExpenseForm()
    else view.openRenewalForm()
    form.category_id = 99
    await view.loadCategories()
    expect(form.category_id).toBe(99)
  })

  it('makes category failures recoverable without leaving creation permanently disabled', async () => {
    view.categories = []
    mocks.getExpenseCategories.mockRejectedValueOnce(new Error('分类连接失败'))
    await view.loadCategories()
    await flushPromises()
    expect(view.categoriesLoading).toBe(false)
    expect(view.categoryOptionsPending).toBe(false)
    expect(wrapper!.get('[role="alert"]').text()).toContain('分类连接失败')
    view.openExpenseForm()
    await wrapper!.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(view.categoryError).toBe('')
    expect(view.expenseForm.category_id).toBe(1)
  })

  it('keeps the newest expense detail when an earlier selection resolves last', async () => {
    const old = deferred<ExpenseRecord>()
    mocks.getExpense.mockReturnValueOnce(old.promise).mockResolvedValueOnce(expense(2))
    const first = view.openExpenseDetail(expense(1))
    await view.openExpenseDetail(expense(2))
    old.resolve({ ...expense(1), title: '旧详情回包' })
    await first
    expect(view.selectedExpense?.id).toBe(2)
    expect(view.drawerMode).toBe('expense-detail')
  })

  it.each(['close', 'create'] as const)('invalidates detail loading on %s and suppresses a stale error', async action => {
    const old = deferred<ExpenseRecord>()
    mocks.getExpense.mockReturnValueOnce(old.promise)
    const first = view.openExpenseDetail(expense(1))
    if (action === 'close') view.drawerVisible = false
    else view.openExpenseForm()
    old.reject(new Error('旧请求失败'))
    await first
    expect(mocks.showToast).not.toHaveBeenCalledWith('旧请求失败', 'error')
    expect(view.drawerVisible).toBe(action !== 'close')
    if (action === 'create') expect(view.drawerMode).toBe('expense-form')
  })

  it('never lets an older renewal detail change the project currently being confirmed', async () => {
    const old = deferred<ExpenseRenewal>()
    mocks.getExpenseRenewal.mockReturnValueOnce(old.promise)
    const first = view.openRenewalDetail(renewal(1))
    view.openConfirmRenewal(renewal(2))
    old.resolve(renewal(1))
    await first
    expect(view.selectedRenewal?.id).toBe(2)
    await view.submitConfirmRenewal()
    expect(mocks.confirmExpenseRenewal).toHaveBeenCalledWith(2, expect.objectContaining({ amount: 102, due_on: '2026-09-30' }))
  })

  it('invalidates a renewal detail response after opening a new renewal form', async () => {
    const old = deferred<ExpenseRenewal>()
    mocks.getExpenseRenewal.mockReturnValueOnce(old.promise)
    const first = view.openRenewalDetail(renewal(1))
    view.openRenewalForm()
    old.resolve({ ...renewal(1), name: '旧响应不应回填' })
    await first
    expect(view.drawerMode).toBe('renewal-form')
    expect(view.selectedRenewal?.name).toBe('会员 1')
    expect(view.renewalForm.name).toBe('')
  })

  it('captures the saved record and attachments and does not close a newer draft', async () => {
    const saved = deferred<ExpenseRecord>()
    mocks.createExpense.mockReturnValueOnce(saved.promise)
    const originalFile = new File(['a'], 'A.png', { type: 'image/png' })
    const newFile = new File(['b'], 'B.png', { type: 'image/png' })
    view.openExpenseForm()
    Object.assign(view.expenseForm, { title: '原流水 A', amount: 101 })
    view.pendingFiles = [originalFile]
    const first = view.saveExpense()
    await view.saveExpense()
    expect(mocks.createExpense).toHaveBeenCalledOnce()
    view.drawerVisible = false
    view.openExpenseForm()
    Object.assign(view.expenseForm, { title: '新草稿 B', amount: 202 })
    view.pendingFiles = [newFile]
    saved.resolve(expense(1))
    await first
    expect(mocks.createExpense).toHaveBeenCalledWith(expect.objectContaining({ title: '原流水 A', amount: 101 }))
    expect(mocks.uploadExpenseAttachment).toHaveBeenCalledExactlyOnceWith(1, originalFile)
    expect(view.drawerVisible).toBe(true)
    expect(view.expenseForm.title).toBe('新草稿 B')
    expect(view.pendingFiles).toEqual([newFile])
  })

  it('does not close a newer renewal form after a previous project saves', async () => {
    const saved = deferred<ExpenseRenewal>()
    mocks.createExpenseRenewal.mockReturnValueOnce(saved.promise)
    view.openRenewalForm()
    Object.assign(view.renewalForm, { name: '项目 A', default_amount: 101 })
    const first = view.saveRenewal()
    view.openRenewalForm()
    Object.assign(view.renewalForm, { name: '项目 B', default_amount: 202 })
    saved.resolve(renewal(1))
    await first
    expect(mocks.createExpenseRenewal).toHaveBeenCalledWith(expect.objectContaining({ name: '项目 A', default_amount: 101 }))
    expect(view.drawerVisible).toBe(true)
    expect(view.renewalForm.name).toBe('项目 B')
  })

  it('does not close or rewrite a newer confirmation after a prior one succeeds', async () => {
    const confirmed = deferred<unknown>()
    mocks.confirmExpenseRenewal.mockReturnValueOnce(confirmed.promise)
    view.openConfirmRenewal(renewal(1))
    const first = view.submitConfirmRenewal()
    await view.submitConfirmRenewal()
    view.openConfirmRenewal(renewal(2))
    confirmed.resolve({})
    await first
    expect(mocks.confirmExpenseRenewal).toHaveBeenCalledOnce()
    expect(mocks.confirmExpenseRenewal).toHaveBeenCalledWith(1, expect.objectContaining({ amount: 101 }))
    expect(view.drawerVisible).toBe(true)
    expect(view.selectedRenewal?.id).toBe(2)
    expect(view.confirmForm.amount).toBe(102)
  })

  it('keeps the newest month summary when requests complete out of order', async () => {
    const old = deferred<ExpenseSummary>()
    mocks.getExpenseSummary.mockReturnValueOnce(old.promise).mockResolvedValueOnce(summary('2026-09', 900))
    view.expenseFilters.month = '2026-08'
    const first = view.loadSummary()
    view.expenseFilters.month = '2026-09'
    await view.loadSummary()
    old.resolve(summary('2026-08', 800))
    await first
    expect(view.summary.month).toBe('2026-09')
    expect(view.summary.total).toBe(900)
  })

  it('does not let a stale summary failure overwrite a newer success', async () => {
    const old = deferred<ExpenseSummary>()
    mocks.getExpenseSummary.mockReturnValueOnce(old.promise).mockResolvedValueOnce(summary('2026-10', 1000))
    const first = view.loadSummary()
    view.expenseFilters.month = '2026-10'
    await view.loadSummary()
    old.reject(new Error('旧月份超时'))
    await first
    expect(view.summaryError).toBe('')
    expect(view.summary.month).toBe('2026-10')
  })

  it('does not close a newer detail when a previously selected expense is voided', async () => {
    mocks.getExpense.mockImplementation(async (id: number) => expense(id))
    await view.openExpenseDetail(expense(1))
    const pending = deferred<unknown>()
    mocks.voidExpense.mockReturnValueOnce(pending.promise)
    const action = view.handleVoidExpense(expense(1))
    await flushPromises()
    await view.openExpenseDetail(expense(2))
    pending.resolve({})
    await action
    expect(mocks.voidExpense).toHaveBeenCalledWith(1, '重复录入')
    expect(view.drawerVisible).toBe(true)
    expect(view.selectedExpense?.id).toBe(2)
  })

  it('keeps attachment deletion bound to its original expense through a confirmation delay', async () => {
    mocks.getExpense.mockImplementation(async (id: number) => expense(id))
    await view.openExpenseDetail(expense(1))
    const confirm = deferred<unknown>()
    mocks.confirm.mockReturnValueOnce(confirm.promise)
    mocks.deleteExpenseAttachment.mockResolvedValueOnce({})
    const action = view.handleDeleteAttachment(101)
    await view.openExpenseDetail(expense(2))
    confirm.resolve('confirm')
    await action
    expect(mocks.deleteExpenseAttachment).toHaveBeenCalledWith(1, 101)
    expect(mocks.getExpense).toHaveBeenCalledTimes(2)
    expect(view.drawerVisible).toBe(true)
    expect(view.selectedExpense?.id).toBe(2)
  })

  it('does not reopen a closed drawer after attachment deletion finishes', async () => {
    mocks.getExpense.mockResolvedValueOnce(expense(1))
    await view.openExpenseDetail(expense(1))
    const pending = deferred<unknown>()
    mocks.deleteExpenseAttachment.mockReturnValueOnce(pending.promise)
    const action = view.handleDeleteAttachment(101)
    await flushPromises()
    view.drawerVisible = false
    pending.resolve({})
    await action
    expect(view.drawerVisible).toBe(false)
    expect(mocks.getExpense).toHaveBeenCalledOnce()
  })
})

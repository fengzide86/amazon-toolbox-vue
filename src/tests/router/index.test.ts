import { describe, expect, it } from 'vitest'

import router from '@/router'

describe('Router configuration', () => {
  const routes = () => router.getRoutes()

  it('uses the real route table and includes all three product surfaces', () => {
    const names = new Set(routes().map(route => String(route.name)))

    expect([...names]).toEqual(expect.arrayContaining([
      'Landing',
      'UserLogin',
      'UserTools',
      'UserLogs',
      'BusinessOverview',
      'BusinessWorkspace',
      'BusinessRecords',
      'AdminDashboard',
      'AdminExpenses',
      'AdminUpdates',
      'AdminStaffAccounts',
      'NotFound',
    ]))
  })

  it('gives every navigable child route a title and lazy component', () => {
    const children = routes().filter(route => route.name && route.name !== 'NotFound')

    for (const route of children) {
      expect(route.meta?.title || route.redirect, String(route.name)).toBeTruthy()
      if (!route.redirect) {
        expect(route.components, String(route.name)).toBeTruthy()
      }
    }
  })

  it('keeps product and role restrictions on protected surfaces', () => {
    const business = routes().find(route => route.name === 'BusinessWorkspace')
    const expenses = routes().find(route => route.name === 'AdminExpenses')
    const settings = routes().find(route => route.name === 'AdminSettings')

    expect(business?.meta).toMatchObject({ productType: 'business', entitlement: 'batch_execution' })
    expect(expenses?.meta?.roles).toEqual(['super_admin', 'operator'])
    expect(settings?.meta?.roles).toEqual(['super_admin'])
  })
})

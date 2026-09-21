import { z } from 'zod'
import { api, type ApiQueryParams } from '@/utils/api'
import { downloadApiFile } from '@/utils/api/download'
import type { components } from '@/shared/api/openapi.generated'
import {
  agencySchema, customerSchema, orderSchema, licenseSchema, serviceRequestSchema, planSchema,
  pageSchema, summarySchema, type Agency, type Customer, type AgencyOrder, type AgencyLicense,
  type ServiceRequest, type AgencyPlan, type AgencySummary, type Page,
} from './model'

const readOptions = { cache: false, responseMode: 'raw' as const }
type Schemas = components['schemas']
export const agencyApi = {
  async summary(params: ApiQueryParams = {}): Promise<AgencySummary> {
    return summarySchema.parse(await api.get('/api/agency/summary', params, { cache: false }))
  },
  async agencies(params: ApiQueryParams = {}): Promise<Page<Agency>> {
    return pageSchema(agencySchema).parse(await api.get('/api/agency/agencies', params, readOptions))
  },
  async customers(params: ApiQueryParams = {}): Promise<Page<Customer>> {
    return pageSchema(customerSchema).parse(await api.get('/api/agency/customers', params, readOptions))
  },
  async orders(params: ApiQueryParams = {}): Promise<Page<AgencyOrder>> {
    return pageSchema(orderSchema).parse(await api.get('/api/agency/orders', params, readOptions))
  },
  async licenses(params: ApiQueryParams = {}): Promise<Page<AgencyLicense>> {
    return pageSchema(licenseSchema).parse(await api.get('/api/agency/licenses', params, readOptions))
  },
  async requests(params: ApiQueryParams = {}): Promise<Page<ServiceRequest>> {
    return pageSchema(serviceRequestSchema).parse(await api.get('/api/agency/requests', params, readOptions))
  },
  async plans(): Promise<AgencyPlan[]> {
    return z.array(planSchema).parse(await api.get('/api/agency/plans', {}, { cache: false }))
  },
  async createAgency(payload: Schemas['AgencyWrite']): Promise<Agency> {
    return z.object({ data: agencySchema }).parse(await api.post('/api/agency/agencies', payload)).data
  },
  async updateAgency(id: number, payload: Schemas['AgencyUpdate']): Promise<Agency> {
    return agencySchema.parse(await api.patch(`/api/agency/agencies/${id}`, payload))
  },
  async createCustomer(payload: Schemas['CustomerCreate']): Promise<Customer> {
    return z.object({ data: customerSchema }).parse(await api.post('/api/agency/customers', payload)).data
  },
  async updateCustomer(id: number, payload: Schemas['CustomerUpdate']): Promise<Customer> {
    return customerSchema.parse(await api.patch(`/api/agency/customers/${id}`, payload))
  },
  async createOrder(payload: Schemas['AgencyOrderCreate']): Promise<AgencyOrder> {
    return z.object({ data: orderSchema }).parse(await api.post('/api/agency/orders', payload)).data
  },
  async markPaid(id: number): Promise<AgencyOrder> {
    return z.object({ data: orderSchema }).parse(await api.post(`/api/agency/orders/${id}/mark-paid`)).data
  },
  async deliver(id: number): Promise<AgencyOrder> {
    return z.object({ data: orderSchema }).parse(await api.post(`/api/agency/orders/${id}/deliver`)).data
  },
  async createRequest(payload: Schemas['AgencyRequestCreate']): Promise<ServiceRequest> {
    return z.object({ data: serviceRequestSchema }).parse(await api.post('/api/agency/requests', payload)).data
  },
  async respond(id: number, payload: Schemas['AgencyRequestResolve']): Promise<ServiceRequest> {
    return serviceRequestSchema.parse(await api.patch(`/api/agency/requests/${id}`, payload))
  },
  exportOrders(params: ApiQueryParams): Promise<Blob> { return downloadApiFile('/api/agency/orders/export', params) },
}

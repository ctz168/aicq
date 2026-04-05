const API_BASE = '/api/admin'

async function fetchAPI<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}/${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(errorData.error || `请求失败 (${response.status})`)
  }

  return response.json()
}

// Auth
export async function getSetupStatus() {
  return fetchAPI<{ initialized: boolean }>('setup-status')
}

export async function initAdmin(username: string, password: string) {
  return fetchAPI<{ token: string; expiresIn: number }>('init', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function loginAdmin(username: string, password: string) {
  return fetchAPI<{ token: string; expiresIn: number }>('login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

// Stats
export async function getStats() {
  return fetchAPI<{
    totalNodes: number
    totalAccounts: number
    totalFriendships: number
    totalGroups: number
    totalBlacklisted: number
  }>('stats')
}

// Nodes
export interface NodeItem {
  id: string
  friendCount: number
  lastSeen: string | null
  status: 'online' | 'offline'
}

export interface NodeFriend {
  friendId: string
  friendType: 'human' | 'ai'
  permission: string
  addedAt: string
}

export interface NodeDetail extends NodeItem {
  friends: NodeFriend[]
}

export interface NodeListResponse {
  nodes: NodeItem[]
  total: number
  page: number
  pageSize: number
}

export function getNodeList(params: { search?: string; page?: number; pageSize?: number } = {}) {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
  return fetchAPI<NodeListResponse>(`nodes?${searchParams.toString()}`)
}

export function getNodeDetail(id: string) {
  return fetchAPI<NodeDetail>(`nodes/${id}`)
}

// Accounts
export interface AccountItem {
  id: string
  type: 'human' | 'ai'
  email: string | null
  phone: string | null
  displayName: string | null
  status: string
  createdAt: string
  lastLogin: string | null
}

export interface AccountDetail extends AccountItem {
  password?: string
}

export interface AccountListResponse {
  accounts: AccountItem[]
  total: number
  page: number
  pageSize: number
}

export function getAccountList(params: { search?: string; page?: number; pageSize?: number } = {}) {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
  return fetchAPI<AccountListResponse>(`accounts?${searchParams.toString()}`)
}

export function getAccountDetail(id: string) {
  return fetchAPI<AccountDetail>(`accounts/${id}`)
}

export function createAccount(data: {
  email?: string
  phone?: string
  password: string
  displayName?: string
}) {
  return fetchAPI<AccountDetail>('accounts', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAccount(
  id: string,
  data: {
    displayName?: string
    email?: string
    phone?: string
    status?: string
    password?: string
  }
) {
  return fetchAPI<AccountDetail>(`accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteAccount(id: string) {
  return fetchAPI<void>(`accounts/${id}`, {
    method: 'DELETE',
  })
}

// Config
export interface ConfigData {
  port: number
  maxFriends: number
  maxFriendsHumanToHuman: number
  maxFriendsHumanToAI: number
  maxFriendsAIToHuman: number
  maxFriendsAIToAI: number
  maxGroupsCreate: number
  maxGroupsJoin: number
  maxGroupMembers: number
  maxConnections: number
  maxWsConnections: number
  tempNumberTtlHours: number
}

export function getConfig() {
  return fetchAPI<ConfigData>('config')
}

export function updateConfig(data: Partial<ConfigData>) {
  return fetchAPI<ConfigData>('config', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Blacklist
export interface BlacklistItem {
  id: string
  accountId: string
  reason: string
  createdAt: string
}

export interface BlacklistResponse {
  items: BlacklistItem[]
  total: number
}

export function getBlacklist() {
  return fetchAPI<BlacklistResponse>('blacklist')
}

export function addToBlacklist(accountId: string, reason: string) {
  return fetchAPI<BlacklistItem>('blacklist', {
    method: 'POST',
    body: JSON.stringify({ accountId, reason }),
  })
}

export function removeFromBlacklist(id: string) {
  return fetchAPI<void>(`blacklist/${id}`, {
    method: 'DELETE',
  })
}

// Service Management
export interface ServiceStatus {
  status: 'running'
  uptime: number
  uptimeFormatted: string
  port: number
  domain: string
  nodeEnv: string
  memoryUsage: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
  startedAt: number
}

export function getServiceStatus() {
  return fetchAPI<ServiceStatus>('service/status')
}

export function stopService() {
  return fetchAPI<{ success: boolean; message: string }>('service/stop', {
    method: 'POST',
  })
}

export function restartService() {
  return fetchAPI<{ success: boolean; message: string }>('service/restart', {
    method: 'POST',
  })
}

// ClickHouse Database Management
export interface CHStatus {
  connected: boolean
  url: string
  database: string
  user: string
  version: string
  latencyMs: number
  totalRows: number
  totalBytes: string
  totalBytesRaw: number
}

export function getDatabaseStatus() {
  return fetchAPI<CHStatus>('database/status')
}

export interface CHTableInfo {
  name: string
  engine: string
  rows: number
  bytes: string
  bytesRaw: number
  parts: number
  createdAt: string
}

export function getDatabaseTables() {
  return fetchAPI<{ tables: CHTableInfo[] }>('database/tables')
}

export interface CHColumnInfo {
  name: string
  type: string
  defaultKind: string
  defaultExpression: string
  comment: string
  isInPartitionKey: boolean
  isInSortingKey: boolean
  isInPrimaryKey: boolean
}

export interface CHTableDetail extends CHTableInfo {
  columns: CHColumnInfo[]
  sampleData: Record<string, any>[]
  sampleDataCount: number
}

export function getTableDetail(name: string) {
  return fetchAPI<CHTableDetail>(`database/tables/${encodeURIComponent(name)}`)
}

export interface CHQueryResult {
  columns: string[]
  rows: Record<string, any>[]
  rowCount: number
  queryTimeMs: number
  error?: string
}

export function executeQuery(query: string) {
  return fetchAPI<CHQueryResult>('database/query', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export interface CHOptimizeResult {
  tables: { name: string; success: boolean; error?: string }[]
  totalMs: number
}

export function optimizeDatabase() {
  return fetchAPI<CHOptimizeResult>('database/optimize', {
    method: 'POST',
  })
}

export interface CHCleanupResult {
  deletedRows: number
  tables: { name: string; deletedRows: number }[]
  totalMs: number
}

export function cleanupDatabase() {
  return fetchAPI<CHCleanupResult>('database/cleanup', {
    method: 'POST',
  })
}

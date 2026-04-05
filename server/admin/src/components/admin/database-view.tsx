'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  RefreshCw,
  Play,
  Trash2,
  HardDrive,
  TableProperties,
  ArrowUpDown,
  Key,
  Wifi,
  WifiOff,
  Clock,
  Database as DbIcon,
  ChevronRight,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getDatabaseStatus,
  getDatabaseTables,
  getTableDetail,
  executeQuery,
  optimizeDatabase,
  cleanupDatabase,
  type CHStatus,
  type CHTableInfo,
  type CHTableDetail,
  type CHQueryResult,
} from '@/lib/admin-api'

export function DatabaseView() {
  const [status, setStatus] = useState<CHStatus | null>(null)
  const [tables, setTables] = useState<CHTableInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  // Table detail dialog
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableDetail, setTableDetail] = useState<CHTableDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Query panel
  const [queryText, setQueryText] = useState('')
  const [queryResult, setQueryResult] = useState<CHQueryResult | null>(null)
  const [queryRunning, setQueryRunning] = useState(false)

  const loadAll = async () => {
    try {
      setLoading(true)
      const [s, t] = await Promise.all([
        getDatabaseStatus(),
        getDatabaseTables(),
      ])
      setStatus(s)
      setTables(t.tables)
    } catch {
      toast.error('加载数据库信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const handleOptimize = async () => {
    try {
      setOptimizing(true)
      const result = await optimizeDatabase()
      const failed = result.tables.filter(t => !t.success)
      if (failed.length === 0) {
        toast.success(`优化完成，耗时 ${(result.totalMs / 1000).toFixed(1)}s`)
      } else {
        toast.warning(`优化完成（${failed.length} 个表失败），耗时 ${(result.totalMs / 1000).toFixed(1)}s`)
      }
      await loadAll()
    } catch {
      toast.error('优化失败')
    } finally {
      setOptimizing(false)
    }
  }

  const handleCleanup = async () => {
    try {
      setCleaning(true)
      const result = await cleanupDatabase()
      toast.success(`清理完成，耗时 ${(result.totalMs / 1000).toFixed(1)}s`)
      await loadAll()
    } catch {
      toast.error('清理过期数据失败')
    } finally {
      setCleaning(false)
    }
  }

  const handleTableClick = async (name: string) => {
    setSelectedTable(name)
    setDetailLoading(true)
    try {
      const detail = await getTableDetail(name)
      setTableDetail(detail)
    } catch {
      toast.error('加载表详情失败')
      setSelectedTable(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleQuery = async () => {
    if (!queryText.trim()) return
    try {
      setQueryRunning(true)
      setQueryResult(null)
      const result = await executeQuery(queryText)
      setQueryResult(result)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`查询完成：${result.rowCount} 行，耗时 ${result.queryTimeMs}ms`)
      }
    } catch {
      toast.error('查询执行失败')
    } finally {
      setQueryRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">数据库管理</h2>
          <p className="text-muted-foreground">ClickHouse 数据库连接状态、表管理和查询</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleCleanup} disabled={cleaning || !status?.connected}>
            <Trash2 className="h-4 w-4 mr-1" />
            {cleaning ? '清理中...' : '清理过期数据'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleOptimize} disabled={optimizing || !status?.connected}>
            <ArrowUpDown className="h-4 w-4 mr-1" />
            {optimizing ? '优化中...' : '优化表'}
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            连接状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : status ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${status.connected ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  {status.connected ? (
                    <Wifi className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">状态</p>
                  <Badge variant={status.connected ? 'default' : 'destructive'} className="mt-0.5">
                    {status.connected ? '已连接' : '未连接'}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">延迟</p>
                  <p className="text-sm font-medium">{status.latencyMs}ms</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                  <HardDrive className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">数据量</p>
                  <p className="text-sm font-medium">{status.totalBytes}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
                  <DbIcon className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">版本</p>
                  <p className="text-sm font-medium truncate max-w-[120px]" title={status.version}>
                    {status.version || '-'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {status && (
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <span>URL: <code className="text-foreground">{status.url}</code></span>
              <span>数据库: <code className="text-foreground">{status.database}</code></span>
              <span>用户: <code className="text-foreground">{status.user}</code></span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TableProperties className="h-4 w-4" />
                数据表
              </CardTitle>
              <CardDescription>共 {tables.length} 张表，{status?.totalRows.toLocaleString() || 0} 行数据</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : tables.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">暂无数据表</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">表名</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">引擎</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">行数</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">大小</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">分区</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((table) => (
                      <tr key={table.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{table.name}</code>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{table.engine}</td>
                        <td className="px-4 py-2 text-right">{table.rows.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{table.bytes}</td>
                        <td className="px-4 py-2 text-right">{table.parts}</td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTableClick(table.name)}
                          >
                            详情
                            <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Query Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            SQL 查询
          </CardTitle>
          <CardDescription>
            仅支持 SELECT / SHOW / DESCRIBE 查询，最大 5000 字符
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="SELECT * FROM accounts LIMIT 100"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleQuery()
                }
              }}
              className="font-mono text-sm"
              disabled={!status?.connected}
            />
            <Button
              onClick={handleQuery}
              disabled={queryRunning || !queryText.trim() || !status?.connected}
            >
              <Play className="h-4 w-4 mr-1" />
              {queryRunning ? '执行中...' : '执行'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter 快捷执行</p>

          {queryResult && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <Badge variant={queryResult.error ? 'destructive' : 'default'}>
                  {queryResult.error ? '错误' : `${queryResult.rowCount} 行`}
                </Badge>
                <span className="text-muted-foreground">{queryResult.queryTimeMs}ms</span>
                {queryResult.error && (
                  <span className="text-destructive text-xs">{queryResult.error}</span>
                )}
              </div>

              {queryResult.rows.length > 0 && (
                <div className="rounded-md border overflow-auto max-h-[400px]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50 sticky top-0">
                        {queryResult.columns.map((col) => (
                          <th key={col} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {queryResult.columns.map((col) => (
                            <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate" title={String(row[col] ?? '')}>
                              {String(row[col] ?? 'NULL')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table Detail Dialog */}
      <Dialog open={!!selectedTable} onOpenChange={(open) => !open && setSelectedTable(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TableProperties className="h-5 w-5" />
              {selectedTable}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : tableDetail ? (
            <div className="space-y-4">
              {/* Table Info */}
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">引擎</span>
                  <code className="text-xs">{tableDetail.engine}</code>
                </div>
                <div className="flex justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">行数</span>
                  <span className="font-medium">{tableDetail.rows.toLocaleString()}</span>
                </div>
                <div className="flex justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">大小</span>
                  <span className="font-medium">{tableDetail.bytes}</span>
                </div>
                <div className="flex justify-between rounded-lg border p-3">
                  <span className="text-muted-foreground">分区数</span>
                  <span className="font-medium">{tableDetail.parts}</span>
                </div>
              </div>

              <Separator />

              {/* Columns */}
              <div>
                <h4 className="text-sm font-medium mb-2">列定义 ({tableDetail.columns.length})</h4>
                <div className="rounded-md border overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-1.5 text-left">列名</th>
                        <th className="px-3 py-1.5 text-left">类型</th>
                        <th className="px-3 py-1.5 text-left">键</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableDetail.columns.map((col) => (
                        <tr key={col.name} className="border-b last:border-0">
                          <td className="px-3 py-1.5">
                            <code>{col.name}</code>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{col.type}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex gap-1">
                              {col.isInPrimaryKey && <Badge variant="secondary" className="text-[10px] px-1 py-0">PK</Badge>}
                              {col.isInSortingKey && <Badge variant="outline" className="text-[10px] px-1 py-0">Sort</Badge>}
                              {col.isInPartitionKey && <Badge variant="outline" className="text-[10px] px-1 py-0">Part</Badge>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sample Data */}
              {tableDetail.sampleData.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2">示例数据 (前 {tableDetail.sampleDataCount} 行)</h4>
                    <div className="rounded-md border overflow-auto max-h-[300px]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50 sticky top-0">
                            {tableDetail.columns.map((col) => (
                              <th key={col.name} className="px-2 py-1 text-left whitespace-nowrap">{col.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableDetail.sampleData.map((row, i) => (
                            <tr key={i} className="border-b last:border-0">
                              {tableDetail.columns.map((col) => (
                                <td key={col.name} className="px-2 py-1 whitespace-nowrap max-w-[150px] truncate" title={String(row[col.name] ?? '')}>
                                  {String(row[col.name] ?? 'NULL')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {tableDetail.sampleData.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">该表暂无数据</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">加载失败</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

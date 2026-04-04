'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Search, ChevronLeft, ChevronRight, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { getNodeList, getNodeDetail, type NodeItem, type NodeDetail } from '@/lib/admin-api'

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '从未'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  if (diffHour < 24) return `${diffHour}小时前`
  if (diffDay < 30) return `${diffDay}天前`
  return date.toLocaleDateString('zh-CN')
}

function truncateId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

export function NodesView() {
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const loadNodes = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getNodeList({ search, page, pageSize })
      setNodes(data.nodes || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('加载节点列表失败')
    } finally {
      setLoading(false)
    }
  }, [search, page, pageSize])

  useEffect(() => {
    loadNodes()
  }, [loadNodes])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const handleNodeClick = async (node: NodeItem) => {
    try {
      setDetailLoading(true)
      setDetailOpen(true)
      const detail = await getNodeDetail(node.id)
      setSelectedNode(detail)
    } catch {
      toast.error('加载节点详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">节点管理</h2>
        <p className="text-muted-foreground">查看和管理已连接的节点</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">节点列表</CardTitle>
            <div className="flex items-center gap-2">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索节点..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-[200px] pl-8"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  搜索
                </Button>
              </form>
              <Button variant="outline" size="icon" onClick={loadNodes} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <WifiOff className="h-10 w-10 mb-3" />
              <p>暂无节点数据</p>
            </div>
          ) : (
            <>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>节点 ID</TableHead>
                      <TableHead className="text-center">好友数</TableHead>
                      <TableHead>最后上线</TableHead>
                      <TableHead className="text-center">状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nodes.map((node) => (
                      <TableRow
                        key={node.id}
                        className="cursor-pointer"
                        onClick={() => handleNodeClick(node)}
                      >
                        <TableCell className="font-mono text-xs">
                          {truncateId(node.id)}
                        </TableCell>
                        <TableCell className="text-center">
                          {node.friendCount ?? 0}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(node.lastSeen)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={node.status === 'online' ? 'default' : 'secondary'}
                            className={
                              node.status === 'online'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                            }
                          >
                            {node.status === 'online' ? (
                              <><Wifi className="h-3 w-3 mr-1" />在线</>
                            ) : (
                              <><WifiOff className="h-3 w-3 mr-1" />离线</>
                            )}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <span className="text-sm text-muted-foreground">
                    共 {total} 条，第 {page}/{totalPages} 页
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                    >
                      下一页
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Node Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>节点详情</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : selectedNode ? (
            <div className="space-y-4">
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">节点 ID</span>
                  <span className="font-mono text-xs">{selectedNode.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">好友数量</span>
                  <span>{selectedNode.friendCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最后上线</span>
                  <span>{formatRelativeTime(selectedNode.lastSeen)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">状态</span>
                  <Badge
                    variant={selectedNode.status === 'online' ? 'default' : 'secondary'}
                    className={
                      selectedNode.status === 'online'
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                    }
                  >
                    {selectedNode.status === 'online' ? '在线' : '离线'}
                  </Badge>
                </div>
              </div>

              {selectedNode.friends && selectedNode.friends.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    好友列表 ({selectedNode.friends.length})
                  </h4>
                  <div className="max-h-64 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>好友 ID</TableHead>
                          <TableHead className="text-center">类型</TableHead>
                          <TableHead>权限</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedNode.friends.map((friend, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">
                              {truncateId(friend.friendId)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={friend.friendType === 'human' ? 'default' : 'secondary'}
                                className={
                                  friend.friendType === 'human'
                                    ? 'bg-violet-500/10 text-violet-600 border-violet-500/20'
                                    : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                }
                              >
                                {friend.friendType === 'human' ? '人类' : 'AI'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {friend.permission || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {(!selectedNode.friends || selectedNode.friends.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  该节点暂无好友
                </p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

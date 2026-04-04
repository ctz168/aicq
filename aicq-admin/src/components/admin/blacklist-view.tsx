'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Trash2, RefreshCw, Ban, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  type BlacklistItem,
} from '@/lib/admin-api'

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '-'
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

export function BlacklistView() {
  const [items, setItems] = useState<BlacklistItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addAccountId, setAddAccountId] = useState('')
  const [addReason, setAddReason] = useState('')
  const [adding, setAdding] = useState(false)

  // Remove dialog
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeItem, setRemoveItem] = useState<BlacklistItem | null>(null)
  const [removing, setRemoving] = useState(false)

  const loadBlacklist = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getBlacklist()
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('加载黑名单失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBlacklist()
  }, [loadBlacklist])

  const handleAdd = async () => {
    if (!addAccountId) {
      toast.error('请输入账号ID')
      return
    }
    if (!addReason) {
      toast.error('请输入封禁原因')
      return
    }
    try {
      setAdding(true)
      await addToBlacklist(addAccountId, addReason)
      toast.success('已添加到黑名单')
      setAddOpen(false)
      setAddAccountId('')
      setAddReason('')
      loadBlacklist()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = (item: BlacklistItem) => {
    setRemoveItem(item)
    setRemoveOpen(true)
  }

  const confirmRemove = async () => {
    if (!removeItem) return
    try {
      setRemoving(true)
      await removeFromBlacklist(removeItem.id)
      toast.success('已从黑名单移除')
      setRemoveOpen(false)
      setRemoveItem(null)
      loadBlacklist()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移除失败')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">黑名单</h2>
        <p className="text-muted-foreground">管理被封禁的账号</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ban className="h-4 w-4" />
              黑名单列表 ({total})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={loadBlacklist} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                添加封禁
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mb-3" />
              <p>黑名单为空</p>
              <p className="text-xs mt-1">暂无被封禁的账号</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>黑名单 ID</TableHead>
                    <TableHead>账号 ID</TableHead>
                    <TableHead>封禁原因</TableHead>
                    <TableHead>封禁时间</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        {truncateId(item.id)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {truncateId(item.accountId)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {item.reason}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRemove(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add to Blacklist Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加到黑名单</DialogTitle>
            <DialogDescription>将指定账号添加到黑名单中</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blacklist-accountId">账号 ID *</Label>
              <Input
                id="blacklist-accountId"
                placeholder="请输入要封禁的账号ID"
                value={addAccountId}
                onChange={(e) => setAddAccountId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blacklist-reason">封禁原因 *</Label>
              <Input
                id="blacklist-reason"
                placeholder="请输入封禁原因"
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleAdd} disabled={adding}>
              {adding ? '添加中...' : '确认封禁'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove from Blacklist Alert */}
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认解除封禁</AlertDialogTitle>
            <AlertDialogDescription>
              确定要将账号 <span className="font-mono font-medium">{removeItem ? truncateId(removeItem.accountId) : ''}</span> 从黑名单中移除吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} disabled={removing}>
              {removing ? '移除中...' : '确认移除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

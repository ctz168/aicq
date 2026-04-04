'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Plus, ChevronLeft, ChevronRight, RefreshCw, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getAccountList,
  createAccount,
  updateAccount,
  deleteAccount,
  type AccountItem,
  type AccountDetail,
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function truncateId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

interface AccountForm {
  email: string
  phone: string
  password: string
  displayName: string
}

interface EditForm {
  displayName: string
  email: string
  phone: string
  status: string
  password: string
}

export function AccountsView() {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<AccountForm>({
    email: '',
    phone: '',
    password: '',
    displayName: '',
  })
  const [creating, setCreating] = useState(false)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<AccountDetail | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    displayName: '',
    email: '',
    phone: '',
    status: 'active',
    password: '',
  })
  const [editing, setEditing] = useState(false)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteAccount_, setDeleteAccount_] = useState<AccountItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getAccountList({ search, page, pageSize })
      setAccounts(data.accounts || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('加载账号列表失败')
    } finally {
      setLoading(false)
    }
  }, [search, page, pageSize])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const handleCreate = async () => {
    if (!createForm.password) {
      toast.error('请输入密码')
      return
    }
    try {
      setCreating(true)
      const data: Record<string, string> = { password: createForm.password }
      if (createForm.email) data.email = createForm.email
      if (createForm.phone) data.phone = createForm.phone
      if (createForm.displayName) data.displayName = createForm.displayName
      await createAccount(data as { password: string; email?: string; phone?: string; displayName?: string })
      toast.success('账号创建成功')
      setCreateOpen(false)
      setCreateForm({ email: '', phone: '', password: '', displayName: '' })
      loadAccounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const handleEdit = (account: AccountItem) => {
    setEditAccount(account as AccountDetail)
    setEditForm({
      displayName: account.displayName || '',
      email: account.email || '',
      phone: account.phone || '',
      status: account.status || 'active',
      password: '',
    })
    setEditOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!editAccount) return
    try {
      setEditing(true)
      const data: Record<string, string> = {}
      if (editForm.displayName) data.displayName = editForm.displayName
      if (editForm.email) data.email = editForm.email
      if (editForm.phone) data.phone = editForm.phone
      if (editForm.status) data.status = editForm.status
      if (editForm.password) data.password = editForm.password
      await updateAccount(editAccount.id, data as { displayName?: string; email?: string; phone?: string; status?: string; password?: string })
      toast.success('账号更新成功')
      setEditOpen(false)
      setEditAccount(null)
      loadAccounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新失败')
    } finally {
      setEditing(false)
    }
  }

  const handleDelete = (account: AccountItem) => {
    setDeleteAccount_(account)
    setDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteAccount_) return
    try {
      setDeleting(true)
      await deleteAccount(deleteAccount_.id)
      toast.success('账号删除成功')
      setDeleteOpen(false)
      setDeleteAccount_(null)
      loadAccounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            正常
          </Badge>
        )
      case 'disabled':
        return (
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
            已禁用
          </Badge>
        )
      case 'blacklisted':
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
            已封禁
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">账号管理</h2>
        <p className="text-muted-foreground">查看和管理系统中的所有账号</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">账号列表</CardTitle>
            <div className="flex items-center gap-2">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索账号..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-[200px] pl-8"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  搜索
                </Button>
              </form>
              <Button variant="outline" size="icon" onClick={loadAccounts} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                新建账号
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
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>暂无账号数据</p>
            </div>
          ) : (
            <>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead className="text-center">类型</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>手机号</TableHead>
                      <TableHead>显示名</TableHead>
                      <TableHead className="text-center">状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>最后登录</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-xs">
                          {truncateId(account.id)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={account.type === 'human' ? 'default' : 'secondary'}
                            className={
                              account.type === 'human'
                                ? 'bg-violet-500/10 text-violet-600 border-violet-500/20'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            }
                          >
                            {account.type === 'human' ? '人类' : 'AI'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {account.email || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {account.phone || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {account.displayName || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {renderStatusBadge(account.status)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(account.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(account.lastLogin)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(account)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(account)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* Create Account Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建账号</DialogTitle>
            <DialogDescription>创建一个新的系统账号</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-displayName">显示名称</Label>
              <Input
                id="create-displayName"
                placeholder="可选"
                value={createForm.displayName}
                onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">邮箱</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="可选"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-phone">手机号</Label>
              <Input
                id="create-phone"
                placeholder="可选"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">密码 *</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="必填"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑账号</DialogTitle>
            <DialogDescription>
              修改账号信息（ID: {editAccount ? truncateId(editAccount.id) : ''}）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-displayName">显示名称</Label>
              <Input
                id="edit-displayName"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">邮箱</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">手机号</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) => setEditForm({ ...editForm, status: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="disabled">禁用</SelectItem>
                  <SelectItem value="blacklisted">封禁</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">新密码</Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="留空则不修改密码"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditSubmit} disabled={editing}>
              {editing ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Alert */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除账号 <span className="font-mono font-medium">{deleteAccount_ ? truncateId(deleteAccount_.id) : ''}</span> 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

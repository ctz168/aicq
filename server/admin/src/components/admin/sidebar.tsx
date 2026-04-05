'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Link2,
  Users,
  Settings,
  Ban,
  Activity,
  Database,
  LogOut,
} from 'lucide-react'
import { useAdminStore, type AdminView } from '@/stores/admin-store'

const navItems: { view: AdminView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { view: 'nodes', label: '节点管理', icon: Link2 },
  { view: 'accounts', label: '账号管理', icon: Users },
  { view: 'config', label: '配置管理', icon: Settings },
  { view: 'service', label: '服务管理', icon: Activity },
  { view: 'database', label: '数据库', icon: Database },
  { view: 'blacklist', label: '黑名单', icon: Ban },
]

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const { currentView, setCurrentView, logout, username } = useAdminStore()

  const handleNavigate = (view: AdminView) => {
    setCurrentView(view)
    onNavigate?.()
  }

  return (
    <div className={cn('flex h-full flex-col bg-card', className)}>
      <div className="px-4 py-5">
        <h1 className="text-lg font-bold tracking-tight">AICQ 管理后台</h1>
        {username && (
          <p className="mt-1 text-sm text-muted-foreground truncate">{username}</p>
        )}
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentView === item.view
            return (
              <Button
                key={item.view}
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3 h-10',
                  isActive && 'font-medium'
                )}
                onClick={() => handleNavigate(item.view)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Button>
            )
          })}
        </nav>
      </ScrollArea>
      <Separator />
      <div className="p-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-10 text-muted-foreground hover:text-destructive"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          退出登录
        </Button>
      </div>
    </div>
  )
}

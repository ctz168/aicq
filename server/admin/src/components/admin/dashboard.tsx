'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LayoutDashboard,
  Link2,
  Users,
  UserPlus,
  Ban,
  type LucideIcon,
} from 'lucide-react'
import { getStats } from '@/lib/admin-api'

interface StatCardProps {
  title: string
  value: number | null
  icon: LucideIcon
  iconColor: string
  iconBg: string
  description?: string
}

function StatCard({ title, value, icon: Icon, iconColor, iconBg, description }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {value !== null ? (
              <p className="text-3xl font-bold tracking-tight">{value.toLocaleString()}</p>
            ) : (
              <Skeleton className="h-9 w-20" />
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface Stats {
  totalNodes: number
  totalAccounts: number
  totalFriendships: number
  totalGroups: number
  totalBlacklisted: number
}

export function DashboardView() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await getStats()
      setStats(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">仪表盘</h2>
        <p className="text-muted-foreground">系统概览与统计数据</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="节点总数"
          value={loading ? null : (stats?.totalNodes ?? 0)}
          icon={Link2}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-500/10"
          description="已连接的节点数量"
        />
        <StatCard
          title="账号总数"
          value={loading ? null : (stats?.totalAccounts ?? 0)}
          icon={Users}
          iconColor="text-violet-600"
          iconBg="bg-violet-500/10"
          description="已注册的账号数量"
        />
        <StatCard
          title="好友关系"
          value={loading ? null : (stats?.totalFriendships ?? 0)}
          icon={UserPlus}
          iconColor="text-amber-600"
          iconBg="bg-amber-500/10"
          description="已建立的好友关系"
        />
        <StatCard
          title="群组总数"
          value={loading ? null : (stats?.totalGroups ?? 0)}
          icon={LayoutDashboard}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-500/10"
          description="已创建的群组数量"
        />
        {stats && stats.totalBlacklisted > 0 && (
          <StatCard
            title="黑名单数量"
            value={stats.totalBlacklisted}
            icon={Ban}
            iconColor="text-red-600"
            iconBg="bg-red-500/10"
            description="被封禁的账号数量"
          />
        )}
      </div>

      {!loading && stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">系统信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">节点总数</span>
                <span className="font-medium">{stats.totalNodes}</span>
              </div>
              <div className="flex justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">账号总数</span>
                <span className="font-medium">{stats.totalAccounts}</span>
              </div>
              <div className="flex justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">好友关系</span>
                <span className="font-medium">{stats.totalFriendships}</span>
              </div>
              <div className="flex justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">群组总数</span>
                <span className="font-medium">{stats.totalGroups}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

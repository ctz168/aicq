'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
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
import { RefreshCw, Power, RotateCcw, Server, Clock, Cpu, HardDrive, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { getServiceStatus, stopService, restartService, type ServiceStatus } from '@/lib/admin-api'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ServiceView() {
  const [serviceInfo, setServiceInfo] = useState<ServiceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [restarting, setRestarting] = useState(false)

  // Dialogs
  const [stopOpen, setStopOpen] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const data = await getServiceStatus()
      setServiceInfo(data)
    } catch {
      toast.error('无法获取服务状态')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadStatus, 10000)
    return () => clearInterval(interval)
  }, [loadStatus])

  const handleStop = async () => {
    try {
      setStopping(true)
      await stopService()
      toast.success('服务正在关闭...')
      setStopOpen(false)
      // After stopping, the server will become unreachable
      setTimeout(() => {
        toast.info('服务已关闭，刷新页面将无法连接')
      }, 2000)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '停止服务失败')
    } finally {
      setStopping(false)
    }
  }

  const handleRestart = async () => {
    try {
      setRestarting(true)
      await restartService()
      toast.success('服务正在重启，请稍候...')
      setRestartOpen(false)
      // Try to reconnect after restart
      setTimeout(() => {
        loadStatus()
        toast.success('服务已恢复')
      }, 8000)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重启服务失败')
      setRestarting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">服务管理</h2>
        <p className="text-muted-foreground">查看服务运行状态，控制服务的启动、停止和重启</p>
      </div>

      {/* Service Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">服务状态</CardTitle>
              <CardDescription>每 10 秒自动刷新</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={loadStatus} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : serviceInfo ? (
            <div className="space-y-4">
              {/* Status overview */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Server className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">AICQ Server</span>
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      运行中
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {serviceInfo.nodeEnv === 'production' ? '生产环境' : '开发环境'}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Info grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Port */}
                <div className="flex items-start gap-3">
                  <Globe className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">服务端口</p>
                    <p className="font-mono text-sm font-medium">{serviceInfo.port}</p>
                  </div>
                </div>

                {/* Domain */}
                <div className="flex items-start gap-3">
                  <Globe className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">域名</p>
                    <p className="text-sm font-medium">{serviceInfo.domain}</p>
                  </div>
                </div>

                {/* Uptime */}
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">运行时长</p>
                    <p className="text-sm font-medium">{serviceInfo.uptimeFormatted}</p>
                  </div>
                </div>

                {/* Started at */}
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">启动时间</p>
                    <p className="text-sm font-medium">{formatTimestamp(serviceInfo.startedAt)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Memory info */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <Cpu className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">堆内存使用</p>
                    <p className="text-sm font-medium">
                      {formatBytes(serviceInfo.memoryUsage.heapUsed)} / {formatBytes(serviceInfo.memoryUsage.heapTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round((serviceInfo.memoryUsage.heapUsed / serviceInfo.memoryUsage.heapTotal) * 100)}% 已用
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HardDrive className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">RSS 内存</p>
                    <p className="text-sm font-medium">{formatBytes(serviceInfo.memoryUsage.rss)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HardDrive className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">外部内存</p>
                    <p className="text-sm font-medium">{formatBytes(serviceInfo.memoryUsage.external)}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Server className="h-8 w-8 mb-2 opacity-50" />
              <p>无法获取服务状态</p>
              <p className="text-xs mt-1">服务可能未运行或网络不可达</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadStatus}>
                重新连接
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Control Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">服务控制</CardTitle>
          <CardDescription>
            停止服务后需要通过系统服务管理器（PM2 / systemd）手动启动
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
              onClick={() => setRestartOpen(true)}
              disabled={restarting || stopping}
            >
              <RotateCcw className={`h-4 w-4 ${restarting ? 'animate-spin' : ''}`} />
              {restarting ? '重启中...' : '重启服务'}
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
              onClick={() => setStopOpen(true)}
              disabled={stopping || restarting}
            >
              <Power className={`h-4 w-4 ${stopping ? 'animate-pulse' : ''}`} />
              {stopping ? '关闭中...' : '停止服务'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stop Confirmation Dialog */}
      <AlertDialog open={stopOpen} onOpenChange={setStopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认停止服务</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将关闭 AICQ 服务器。所有连接的客户端将被断开。
              停止后需要通过系统服务管理器（PM2 / systemd）手动启动服务。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stopping}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStop}
              disabled={stopping}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {stopping ? '正在关闭...' : '确认停止'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restart Confirmation Dialog */}
      <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重启服务</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将重启 AICQ 服务器。重启期间所有连接的客户端将被短暂断开，通常在几秒内恢复。
              请确保服务已通过 PM2 或 systemd 等进程管理器管理，以便自动重启。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restarting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestart}
              disabled={restarting}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {restarting ? '正在重启...' : '确认重启'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

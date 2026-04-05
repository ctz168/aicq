'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { getConfig, updateConfig, type ConfigData } from '@/lib/admin-api'

interface ConfigField {
  key: keyof ConfigData
  label: string
  description: string
}

const configFields: ConfigField[] = [
  { key: 'port', label: '服务端口', description: '服务器监听端口（客户端、服务器、AI插件统一端口）' },
  { key: 'maxFriends', label: '好友上限', description: '每个账号的最大好友数量（通用默认值）' },
  { key: 'maxFriendsHumanToHuman', label: '人加人上限', description: '人类账号添加人类好友的最大数量' },
  { key: 'maxFriendsHumanToAI', label: '人加AI上限', description: '人类账号添加AI好友的最大数量' },
  { key: 'maxFriendsAIToHuman', label: 'AI加人上限', description: 'AI账号添加人类好友的最大数量' },
  { key: 'maxFriendsAIToAI', label: 'AI加AI上限', description: 'AI账号添加AI好友的最大数量' },
  { key: 'maxGroupsCreate', label: '建群上限', description: '每个账号可创建群组的最大数量' },
  { key: 'maxGroupsJoin', label: '加群上限', description: '每个账号可加入群组的最大数量' },
  { key: 'maxGroupMembers', label: '群成员上限', description: '单个群组的最大成员数量' },
  { key: 'maxConnections', label: '最大连接数', description: '服务器的最大HTTP连接数' },
  { key: 'maxWSConnections', label: '最大WebSocket连接数', description: '服务器最大WebSocket连接数' },
  { key: 'tempNumberTtlHours', label: '临时号码有效期', description: '临时号码的有效时长（小时）' },
]

export function ConfigView() {
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [editConfig, setEditConfig] = useState<Partial<ConfigData>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const data = await getConfig()
      setConfig(data)
      setEditConfig(data)
    } catch {
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config) return
    try {
      setSaving(true)
      await updateConfig(editConfig)
      setConfig({ ...config, ...editConfig })
      toast.success('配置保存成功')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (config) {
      setEditConfig(config)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">配置管理</h2>
        <p className="text-muted-foreground">查看和修改系统配置参数</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">系统配置</CardTitle>
              <CardDescription>修改后请点击保存按钮使配置生效</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={loadConfig} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {configFields.map((field, index) => (
                <div key={field.key}>
                  {index > 0 && <Separator className="mb-4" />}
                  <div className="grid gap-3 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                    <div>
                      <Label className="text-sm font-medium">{field.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                    </div>
                    <Input
                      type="number"
                      value={editConfig[field.key] ?? 0}
                      onChange={(e) =>
                        setEditConfig({
                          ...editConfig,
                          [field.key]: Number(e.target.value),
                        })
                      }
                      className="w-full sm:w-32"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={handleReset} disabled={loading}>
          重置
        </Button>
        <Button onClick={handleSave} disabled={loading || saving}>
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '保存配置'}
        </Button>
      </div>
    </div>
  )
}

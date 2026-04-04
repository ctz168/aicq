'use client'

import { useEffect, useState } from 'react'
import { Menu, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminStore } from '@/stores/admin-store'
import { getSetupStatus } from '@/lib/admin-api'
import { LoginForm, InitForm } from '@/components/admin/login-form'
import { Sidebar } from '@/components/admin/sidebar'
import { DashboardView } from '@/components/admin/dashboard'
import { NodesView } from '@/components/admin/nodes-view'
import { AccountsView } from '@/components/admin/accounts-view'
import { ConfigView } from '@/components/admin/config-view'
import { BlacklistView } from '@/components/admin/blacklist-view'

function ViewContent() {
  const currentView = useAdminStore((s) => s.currentView)
  switch (currentView) {
    case 'dashboard':
      return <DashboardView />
    case 'nodes':
      return <NodesView />
    case 'accounts':
      return <AccountsView />
    case 'config':
      return <ConfigView />
    case 'blacklist':
      return <BlacklistView />
    default:
      return <DashboardView />
  }
}

export default function Home() {
  const {
    token,
    isInitialized,
    isLoading,
    setIsInitialized,
    setIsLoading,
  } = useAdminStore()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    checkSetup()
  }, [])

  const checkSetup = async () => {
    try {
      setIsLoading(true)
      const status = await getSetupStatus()
      setIsInitialized(status.initialized)
    } catch {
      // If the server is unreachable, default to initialized (show login)
      setIsInitialized(true)
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary animate-pulse" />
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    )
  }

  // Not initialized - show init form
  if (!isInitialized) {
    return <InitForm />
  }

  // No token - show login form
  if (!token) {
    return <LoginForm />
  }

  // Authenticated - show main layout
  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>导航菜单</SheetTitle>
          </SheetHeader>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">AICQ 管理后台</h1>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <ViewContent />
        </main>
      </div>
    </div>
  )
}

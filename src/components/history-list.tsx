'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { History as HistoryIcon, Loader2, Clock, Database, Brain, Trash2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { HistoryDetailDialog } from "./history-detail-dialog"
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface HistoryItem {
  id: string
  question: string
  result: string
  databaseType: string
  provider: string
  model: string
  status: string
  createdAt: string
  errorMessage?: string | null
}

export function HistoryList() {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingDeleteItem, setPendingDeleteItem] = useState<HistoryItem | null>(null)
  
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(0)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/history?page=${page}&pageSize=${pageSize}`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.data)
        setTotal(data.total ?? data.data.length)
        setTotalPages(data.totalPages ?? 1)
      }
    } catch (error) {
      console.error('Failed to fetch history:', error)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    if (open) {
      fetchHistory()
    }
  }, [open, fetchHistory])

  const deleteHistoryItem = async (item: HistoryItem) => {
    setDeletingId(item.id)
    try {
      const res = await fetch(`/api/history?id=${item.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '删除失败')
      }

      setHistory(prev => prev.filter(historyItem => historyItem.id !== item.id))
      if (selectedItem?.id === item.id) {
        setDetailOpen(false)
        setSelectedItem(null)
      }
      toast.success('历史记录已删除')
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败'
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteItem) return
    await deleteHistoryItem(pendingDeleteItem)
    setPendingDeleteItem(null)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="icon" className="h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground">
            <HistoryIcon className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full">
          <SheetHeader className="shrink-0">
            <SheetTitle>历史记录</SheetTitle>
            <SheetDescription>
              查看过往设计方案（共 {total} 条）
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="flex-1 mt-4 pr-4 -mr-4 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无记录
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedItem(item)
                      setDetailOpen(true)
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm line-clamp-2 flex-1">{item.question}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={item.status === 'success' ? 'default' : 'destructive'} className="text-xs shrink-0">
                          {item.status === 'success' ? '成功' : '失败'}
                        </Badge>
                        {item.provider === 'local' && item.model === 'sql-parser' && (
                          <Badge variant="outline" className="text-xs shrink-0 bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400">
                            SQL 解析
                          </Badge>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-500 hover:text-red-600"
                          disabled={deletingId === item.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setPendingDeleteItem(item)
                          }}
                        >
                          {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        <Clock className="h-3 w-3" />
                        {format(new Date(item.createdAt), 'MM-dd HH:mm')}
                      </div>
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        <Database className="h-3 w-3" />
                        {item.databaseType}
                      </div>
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        <Brain className="h-3 w-3" />
                        {item.provider === 'local' && item.model === 'sql-parser' ? 'SQL 解析器' : item.model}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1 || loading}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page === totalPages || loading}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <HistoryDetailDialog 
        open={detailOpen} 
        onOpenChange={setDetailOpen} 
        item={selectedItem} 
      />

      <AlertDialog open={!!pendingDeleteItem} onOpenChange={(open) => !open && setPendingDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除历史记录？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复。将移除该条记录及其方案内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!!deletingId}
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmDelete()
              }}
            >
              {deletingId ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

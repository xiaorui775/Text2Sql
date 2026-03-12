'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { History as HistoryIcon, Loader2, Clock, Database, Brain } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { HistoryDetailDialog } from "./history-detail-dialog"

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
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/history')
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } catch (error) {
      console.error('Failed to fetch history:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchHistory()
    }
  }, [open])

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="icon" className="h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground">
            <HistoryIcon className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>历史记录</SheetTitle>
            <SheetDescription>
              查看过往设计方案
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
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
                      <Badge variant={item.status === 'success' ? 'default' : 'destructive'} className="text-xs shrink-0">
                        {item.status === 'success' ? '成功' : '失败'}
                      </Badge>
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
                        {item.model}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <HistoryDetailDialog 
        open={detailOpen} 
        onOpenChange={setDetailOpen} 
        item={selectedItem} 
      />
    </div>
  )
}

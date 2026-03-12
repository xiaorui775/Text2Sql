'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { Clock, Database, Brain, AlertCircle } from "lucide-react"
import ERDiagram from "./er-diagram"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMemo, useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

interface HistoryDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: {
    id: string
    question: string
    result: string
    databaseType: string
    provider: string
    model: string
    status: string
    createdAt: string
    errorMessage?: string | null
  } | null
}

export function HistoryDetailDialog({ open, onOpenChange, item }: HistoryDetailDialogProps) {
  // Add a state to defer rendering of heavy content
  const [isReady, setIsReady] = useState(false)

  // Reset ready state when dialog opens/closes or item changes
  useEffect(() => {
    if (open) {
      // Small delay to allow dialog animation to start smoothly
      const timer = setTimeout(() => setIsReady(true), 150)
      return () => clearTimeout(timer)
    } else {
      setIsReady(false)
    }
  }, [open, item])

  const parsedResult = useMemo(() => {
    if (!item?.result) return null
    try {
      return JSON.parse(item.result)
    } catch (e) {
      console.error('Failed to parse result JSON:', e)
      return null
    }
  }, [item?.result])

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            方案详情
            <Badge variant={item.status === 'success' ? 'default' : 'destructive'}>
              {item.status === 'success' ? '成功' : '失败'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            查看详细设计内容
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground border-b pb-4">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm:ss')}
          </div>
          <div className="flex items-center gap-1">
            <Database className="h-4 w-4" />
            {item.databaseType}
          </div>
          <div className="flex items-center gap-1">
            <Brain className="h-4 w-4" />
            {item.provider} / {item.model}
          </div>
        </div>

        {!isReady ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="er" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="requirement">需求</TabsTrigger>
              <TabsTrigger value="er">ER 图</TabsTrigger>
              <TabsTrigger value="sql">SQL</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden mt-4">
              <TabsContent value="requirement" className="h-full m-0">
                <ScrollArea className="h-full w-full rounded-md border p-4">
                  <div className="whitespace-pre-wrap">{item.question}</div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="er" className="h-full m-0">
                <ScrollArea className="h-full w-full rounded-md border p-4">
                  {item.status === 'success' && parsedResult ? (
                    <ERDiagram 
                      tables={parsedResult.tables || []} 
                      relations={parsedResult.relations || []} 
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                      <AlertCircle className="h-8 w-8" />
                      <p>{item.errorMessage || '无法显示 ER 图'}</p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="sql" className="h-full m-0">
                <ScrollArea className="h-full w-full rounded-md border p-4 bg-slate-950 text-slate-50">
                  <pre className="font-mono text-sm">
                    {parsedResult?.sqlStatements || item.errorMessage || '无 SQL 数据'}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ErrorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  message: string
}

export function ErrorDialog({ open, onOpenChange, title = "生成失败", message }: ErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 w-full px-6 py-2">
          <div className="text-red-600/90 dark:text-red-400/90 text-sm break-all whitespace-pre-wrap font-mono bg-red-100/50 dark:bg-red-900/20 p-4 rounded-md border border-red-200/50 dark:border-red-800/50 min-h-[100px]">
            {message}
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-red-200 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

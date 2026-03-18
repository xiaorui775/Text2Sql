'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface DesignDocMarkdownProps {
  content: string
  className?: string
}

export default function DesignDocMarkdown({ content, className = '' }: DesignDocMarkdownProps) {
  const normalizedContent = useMemo(() => {
    return (content || '')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
  }, [content])

  return (
    <div className={`prose prose-slate dark:prose-invert max-w-none text-sm leading-7 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-0 w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-800">
              <table className="w-full table-fixed border-collapse text-xs sm:text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-50/90 dark:bg-slate-800/90">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b-2 border-slate-200 dark:border-slate-700 px-2 py-2 sm:px-3 sm:py-2.5 text-left font-semibold text-slate-900 dark:text-slate-100 whitespace-normal break-all align-top">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-slate-200 dark:border-slate-800 px-2 py-2 sm:px-3 sm:py-2.5 align-top whitespace-normal break-all text-slate-700 dark:text-slate-300">
              {children}
            </td>
          ),
          tr: ({ children }) => <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">{children}</tr>,
          p: ({ children }) => <p className="my-3 break-words leading-7">{children}</p>,
          li: ({ children }) => <li className="my-1.5">{children}</li>
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}

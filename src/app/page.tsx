'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, Database, Lightbulb, GitBranch, Copy, Check, Sparkles, Table2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ERDiagram from '@/components/er-diagram'
import SettingsDialog from '@/components/settings-dialog'

interface TableField {
  name: string
  type: string
  isPrimary: boolean
  isForeign: boolean
  isNullable: boolean
  comment: string
}

interface TableRelation {
  fromTable: string
  fromField: string
  toTable: string
  toField: string
  relationType: string
}

interface TableSchema {
  name: string
  comment: string
  fields: TableField[]
}

interface AnalysisResult {
  keyPoints: string[]
  tables: TableSchema[]
  relations: TableRelation[]
  sqlStatements: string
  databaseType?: string
}

const DATABASE_LABELS: Record<string, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  sqlserver: 'SQL Server',
  oracle: 'Oracle',
  mariadb: 'MariaDB',
  clickhouse: 'ClickHouse'
}

export default function Home() {
  const [requirement, setRequirement] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [copiedSql, setCopiedSql] = useState(false)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null) // null = loading

  // 检查配置状态
  const checkConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/llm-config')
      const data = await response.json()
      setHasConfig(data.exists && data.config?.hasApiKey)
    } catch (error) {
      console.error('Failed to check config:', error)
      setHasConfig(false)
    }
  }, [])

  useEffect(() => {
    checkConfig()
  }, [checkConfig])

  const analyzeRequirement = useCallback(async () => {
    if (!requirement.trim()) {
      toast.error('请输入产品需求描述')
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requirement }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.needConfig) {
          setHasConfig(false)
          toast.error('请先配置 LLM 服务')
          return
        }
        throw new Error(data.error || '分析失败')
      }

      setResult(data)
      toast.success('分析完成')
    } catch (error) {
      console.error('Error:', error)
      toast.error(error instanceof Error ? error.message : '分析过程中出现错误，请重试')
    } finally {
      setIsLoading(false)
    }
  }, [requirement])

  const copySql = useCallback(async () => {
    if (result?.sqlStatements) {
      await navigator.clipboard.writeText(result.sqlStatements)
      setCopiedSql(true)
      toast.success('SQL已复制到剪贴板')
      setTimeout(() => setCopiedSql(false), 2000)
    }
  }, [result?.sqlStatements])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      analyzeRequirement()
    }
  }

  const handleConfigChange = () => {
    checkConfig()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/25">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Text2SQL
            </h1>
            {/* Settings Button */}
            <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
              <SettingsDialog onConfigChange={handleConfigChange} />
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto">
            输入需求描述，一键生成数据库设计方案 (ER 图 + SQL)
          </p>
        </header>

        {/* No Config Warning */}
        {hasConfig === false && (
          <Alert className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">请配置 LLM 服务</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              点击右上角设置按钮，配置 API Key 后即可使用。
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Input */}
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                需求描述
              </CardTitle>
              <CardDescription>
                描述您的产品功能、数据实体及业务关系
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="例如：设计一个电商系统，包含用户、商品、订单、购物车模块。用户可以浏览商品并下单；订单需记录详情和物流状态；商品支持分类和库存管理..."
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[280px] resize-none text-base leading-relaxed border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                disabled={isLoading}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  <kbd className="px-2 py-0.5 bg-slate-100 rounded text-xs font-mono">Ctrl + Enter</kbd> 快速生成
                </span>
                <Button
                  onClick={analyzeRequirement}
                  disabled={isLoading || !requirement.trim() || hasConfig === false}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 px-6"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      生成设计
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel - Results */}
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Table2 className="w-5 h-5 text-emerald-500" />
                设计方案
                {result?.databaseType && (
                  <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {DATABASE_LABELS[result.databaseType] || result.databaseType}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {result ? 'AI 生成的数据库设计方案' : '设计方案将在此处显示'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Database className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-center">输入需求后点击"生成设计"<br />即可获取完整方案</p>
                </div>
              ) : (
                <Tabs defaultValue="keypoints" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="keypoints" className="flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4" />
                      分析要点
                    </TabsTrigger>
                    <TabsTrigger value="sql" className="flex items-center gap-1.5">
                      <Database className="w-4 h-4" />
                      SQL
                    </TabsTrigger>
                    <TabsTrigger value="er" className="flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" />
                      ER 图
                    </TabsTrigger>
                  </TabsList>

                  {/* Key Points Tab */}
                  <TabsContent value="keypoints" className="mt-0">
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {result.keyPoints.map((point, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 bg-gradient-to-r from-slate-50 to-transparent dark:from-slate-800/50 dark:to-transparent rounded-lg border border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex-shrink-0 w-6 h-6 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {index + 1}
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{point}</p>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  {/* SQL Tab */}
                  <TabsContent value="sql" className="mt-0">
                    <div className="relative">
                      {/* Database Type Badge */}
                      {result.databaseType && (
                        <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
                          <Badge variant="secondary" className="bg-slate-700 text-slate-200">
                            {DATABASE_LABELS[result.databaseType] || result.databaseType}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={copySql}
                            className="bg-slate-800/80 hover:bg-slate-700 text-white"
                          >
                            {copiedSql ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      )}
                      {!result.databaseType && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copySql}
                          className="absolute right-2 top-2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white"
                        >
                          {copiedSql ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      <div className="max-h-[400px] overflow-auto rounded-lg">
                        <SyntaxHighlighter
                          language="sql"
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                          }}
                        >
                          {result.sqlStatements}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ER Diagram Tab */}
                  <TabsContent value="er" className="mt-0">
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
                      <ERDiagram tables={result.tables} relations={result.relations} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                        PK = 主键
                      </Badge>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                        FK = 外键
                      </Badge>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                        1:N = 一对多
                      </Badge>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800">
                        N:M = 多对多
                      </Badge>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>基于 AI 大模型，自动将产品需求转换为数据库设计方案</p>
        </footer>
      </div>
    </div>
  )
}

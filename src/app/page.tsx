'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, Database, Lightbulb, GitBranch, Copy, Check, Sparkles, Table2, AlertCircle, FileText, CheckCircle2, CircleDashed } from 'lucide-react'
import { toast } from 'sonner'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import ERDiagram from '@/components/er-diagram'
import SettingsDialog from '@/components/settings-dialog'
import { ErrorDialog } from '@/components/error-dialog'
import DesignDocMarkdown from '@/components/design-doc-markdown'

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
  optimizedRequirement?: string
  keyPoints: string[]
  tables: TableSchema[]
  relations: TableRelation[]
  sqlStatements: string
  databaseType?: string
  designDocument?: string
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
  const [copiedDoc, setCopiedDoc] = useState(false)
  const [hasConfig, setHasConfig] = useState<boolean | null>(null) // null = loading
  const [errorDialog, setErrorDialog] = useState({ open: false, message: '' })
  const [currentStage, setCurrentStage] = useState<string>('')
  
  // Settings for analysis
  const [enableOptimization, setEnableOptimization] = useState(true)
  const [enableDocGeneration, setEnableDocGeneration] = useState(true)

  const STAGES = useMemo(() => {
    const stages = []
    stages.push({ id: 'optimization', label: enableOptimization ? '需求提炼' : '跳过需求提炼' })
    stages.push(
      { id: 'analysis', label: '提取关键点' },
      { id: 'design', label: '表结构设计' },
      { id: 'sql_generation', label: '生成 SQL' }
    )
    if (enableDocGeneration) {
      stages.push({ id: 'doc_generation', label: '生成文档' })
    }
    return stages
  }, [enableOptimization, enableDocGeneration])

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
    setCurrentStage('')
    
    // Initialize empty result for progressive rendering
    const emptyResult: AnalysisResult = {
        optimizedRequirement: '',
        keyPoints: [],
        tables: [],
        relations: [],
        sqlStatements: '',
        databaseType: '',
        designDocument: ''
    }
    setResult(emptyResult)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          requirement,
          options: {
            enableOptimization,
            enableDocGeneration
          }
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        if (data.needConfig) {
          setHasConfig(false)
          toast.error('请先配置 LLM 服务')
          setIsLoading(false)
          return
        }
        throw new Error(data.error || '分析失败')
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamErrorMessage = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // Keep the incomplete line in buffer

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                const eventMatch = line.match(/^event: (.*)$/m)
                const dataLines = line
                  .split('\n')
                  .filter(segment => segment.startsWith('data:'))
                  .map(segment => segment.slice(5).trimStart())
                
                if (eventMatch && dataLines.length > 0) {
                    const event = eventMatch[1]
                    const dataStr = dataLines.join('\n')
                    
                    try {
                        const data = JSON.parse(dataStr)
                        
                        if (event === 'stage_start') {
                            setCurrentStage(data.stage)
                        } else if (event === 'heartbeat') {
                            continue
                        } else if (event === 'stage_done') {
                            if (data.stage === 'optimization') {
                                setResult(prev => prev ? ({ ...prev, optimizedRequirement: data.data.optimizedRequirement }) : prev)
                            } else if (data.stage === 'analysis') {
                                setResult(prev => prev ? ({ ...prev, keyPoints: data.data.keyPoints }) : prev)
                            } else if (data.stage === 'design') {
                                setResult(prev => prev ? ({ ...prev, tables: data.data.tables, relations: data.data.relations }) : prev)
                            } else if (data.stage === 'sql_generation') {
                                setResult(prev => prev ? ({ 
                                    ...prev, 
                                    sqlStatements: data.data.sqlStatements
                                }) : prev)
                            } else if (data.stage === 'doc_generation') {
                                setResult(prev => prev ? ({ 
                                    ...prev, 
                                    designDocument: data.data.designDocument 
                                }) : prev)
                                if (data.partial && data.error) {
                                    toast.error(`文档阶段未完整完成：${data.error}`)
                                }
                            }
                        } else if (event === 'final_result') {
                            setResult(data)
                            toast.success('分析完成')
                            setIsLoading(false)
                        } else if (event === 'error') {
                            const stageLabel = typeof data.stage === 'string' ? `阶段 ${data.stage}` : '未知阶段'
                            const reasonLabel = typeof data.reason === 'string' ? `（${data.reason}）` : ''
                            const baseMessage = typeof data.message === 'string' ? data.message : '分析过程中出现错误，请重试'
                            streamErrorMessage = `${stageLabel}${reasonLabel}：${baseMessage}`
                            break outer
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE data:', e)
                    }
                }
            }
        }
      }

      if (streamErrorMessage) {
        throw new Error(streamErrorMessage)
      }

    } catch (error) {
      console.error('Error:', error)
      const message = error instanceof Error ? error.message : '分析过程中出现错误，请重试'
      setErrorDialog({ open: true, message })
      setIsLoading(false)
    }
  }, [requirement, enableOptimization, enableDocGeneration])

  const copySql = useCallback(async () => {
    if (result?.sqlStatements) {
      await navigator.clipboard.writeText(result.sqlStatements)
      setCopiedSql(true)
      toast.success('SQL已复制到剪贴板')
      setTimeout(() => setCopiedSql(false), 2000)
    }
  }, [result?.sqlStatements])

  const copyDoc = useCallback(async () => {
    if (result?.designDocument) {
      await navigator.clipboard.writeText(result.designDocument)
      setCopiedDoc(true)
      toast.success('设计文档已复制到剪贴板')
      setTimeout(() => setCopiedDoc(false), 2000)
    }
  }, [result?.designDocument])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      analyzeRequirement()
    }
  }

  const handleConfigChange = () => {
    checkConfig()
  }

  // 渲染进度步骤条
  const renderProgressSteps = () => {
    if (!isLoading) return null;
    
    const currentIndex = STAGES.findIndex(s => s.id === currentStage);
    
    return (
      <div className="w-full mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between">
          {STAGES.map((stage, index) => {
            const isCompleted = index < currentIndex || (currentIndex === -1 && currentStage !== '');
            const isCurrent = index === currentIndex;
            const isPending = index > currentIndex && currentStage !== '';
            
            return (
              <div key={stage.id} className="flex flex-col items-center relative z-10 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 mb-2 bg-white dark:bg-slate-900 transition-colors duration-300
                  ${isCompleted ? 'border-emerald-500 text-emerald-500' : ''}
                  ${isCurrent ? 'border-blue-500 text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : ''}
                  ${isPending || currentStage === '' ? 'border-slate-200 dark:border-slate-700 text-slate-400' : ''}
                `}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CircleDashed className="w-5 h-5" />
                  )}
                </div>
                <span className={`text-xs font-medium ${isCurrent ? 'text-blue-600 dark:text-blue-400' : isCompleted ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>
                  {stage.label}
                </span>
                
                {/* 连接线 */}
                {index < STAGES.length - 1 && (
                  <div className={`absolute top-4 left-[50%] w-full h-[2px] -z-10
                    ${index < currentIndex ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}
                  `} style={{ width: '100%', left: '50%' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    );
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
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col min-h-[600px] lg:h-[calc(100vh-200px)]">
            <CardHeader className="pb-4 shrink-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                需求描述
              </CardTitle>
              <CardDescription>
                描述您的产品功能、数据实体及业务关系
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col flex-1 min-h-0 overflow-hidden">
              <Textarea
                placeholder="例如：设计一个电商系统，包含用户、商品、订单、购物车模块。用户可以浏览商品并下单；订单需记录详情和物流状态；商品支持分类和库存管理..."
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 resize-none text-base leading-relaxed border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 min-h-0"
                disabled={isLoading}
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="optimization" 
                      checked={enableOptimization}
                      onCheckedChange={setEnableOptimization}
                      disabled={isLoading}
                    />
                    <Label htmlFor="optimization" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                      需求优化
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="doc-gen" 
                      checked={enableDocGeneration}
                      onCheckedChange={setEnableDocGeneration}
                      disabled={isLoading}
                    />
                    <Label htmlFor="doc-gen" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                      生成文档
                    </Label>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-500 hidden sm:inline-block">
                    <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">Ctrl + Enter</kbd> 快速生成
                  </span>
                  <Button
                    onClick={analyzeRequirement}
                    disabled={isLoading || !requirement.trim() || hasConfig === false}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 px-6 min-w-[140px]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        正在生成...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        生成设计
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel - Results */}
          <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col min-h-[600px] lg:h-[calc(100vh-200px)]">
            <CardHeader className="pb-2 shrink-0">
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
            <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0">
              {renderProgressSteps()}
              {!result ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Database className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-center">输入需求后点击"生成设计"<br />即可获取完整方案</p>
                </div>
              ) : (
                <Tabs defaultValue="optimization" className="w-full flex flex-col flex-1 min-h-0">
                  <TabsList className="grid w-full grid-cols-5 mb-4 shrink-0">
                    <TabsTrigger value="optimization" className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      需求提炼
                    </TabsTrigger>
                    <TabsTrigger value="keypoints" className="flex items-center gap-1.5" disabled={result.keyPoints.length === 0}>
                      <Lightbulb className="w-4 h-4" />
                      提取关键点
                    </TabsTrigger>
                    <TabsTrigger value="sql" className="flex items-center gap-1.5" disabled={!result.sqlStatements}>
                      <Database className="w-4 h-4" />
                      SQL
                    </TabsTrigger>
                    <TabsTrigger value="er" className="flex items-center gap-1.5" disabled={result.tables.length === 0}>
                      <GitBranch className="w-4 h-4" />
                      ER 图
                    </TabsTrigger>
                    <TabsTrigger value="doc" className="flex items-center gap-1.5" disabled={!result.designDocument}>
                      <FileText className="w-4 h-4" />
                      设计文档
                    </TabsTrigger>
                  </TabsList>

                  {/* Optimization Tab */}
                  <TabsContent value="optimization" className="mt-0 flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-6 border border-slate-100 dark:border-slate-800 flex-1 overflow-auto">
                      {result.optimizedRequirement ? (
                        <div className="prose prose-slate dark:prose-invert max-w-none">
                          <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                            {result.optimizedRequirement}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">
                          {isLoading ? (
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                <span>正在提取关键信息并精炼需求...</span>
                            </div>
                          ) : "暂无优化数据"}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Key Points Tab */}
                  <TabsContent value="keypoints" className="mt-0 flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="space-y-3 flex-1 overflow-auto pr-2">
                      {result.keyPoints.length > 0 ? (
                        result.keyPoints.map((point, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 bg-gradient-to-r from-slate-50 to-transparent dark:from-slate-800/50 dark:to-transparent rounded-lg border border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex-shrink-0 w-6 h-6 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {index + 1}
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{point}</p>
                        </div>
                      ))) : (
                        <div className="flex items-center justify-center h-full text-slate-400">
                             {isLoading ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                                    <span>正在分析业务关键点...</span>
                                </div>
                             ) : "暂无分析数据"}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* SQL Tab */}
                  <TabsContent value="sql" className="mt-0 flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="relative flex-1 flex flex-col min-h-0">
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
                      {!result.databaseType && result.sqlStatements && (
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
                      <div className="flex-1 overflow-auto rounded-lg min-h-0 bg-[#1e1e1e] flex flex-col">
                         {result.sqlStatements ? (
                            <SyntaxHighlighter
                              language="sql"
                              style={vscDarkPlus}
                              customStyle={{
                                margin: 0,
                                borderRadius: '0.5rem',
                                fontSize: '0.875rem',
                                minHeight: '100%'
                              }}
                            >
                              {result.sqlStatements}
                            </SyntaxHighlighter>
                         ) : (
                            <div className="flex items-center justify-center flex-1 text-slate-400">
                                {isLoading ? "等待 SQL 生成..." : "暂无 SQL"}
                            </div>
                         )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ER Diagram Tab */}
                  <TabsContent value="er" className="mt-0 flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex-1 relative overflow-hidden">
                      {result.tables.length > 0 ? (
                        <ERDiagram 
                          tables={result.tables} 
                          relations={result.relations}
                          fullHeight={true}
                          className="h-full"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400 absolute inset-0">
                            {isLoading ? "正在设计表结构..." : "暂无 ER 图数据"}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Design Document Tab */}
                  <TabsContent value="doc" className="mt-0 flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="relative flex-1 flex flex-col min-h-0">
                      {result.designDocument && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={copyDoc}
                            className="absolute right-2 top-2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white"
                        >
                            {copiedDoc ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                            <Copy className="w-4 h-4" />
                            )}
                        </Button>
                      )}
                      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 min-h-0">
                        {result?.designDocument ? (
                          <DesignDocMarkdown content={result.designDocument} />
                        ) : (
                          <div className="text-center text-slate-500 h-full flex items-center justify-center">
                            {isLoading ? "等待文档生成..." : "暂无设计文档"}
                          </div>
                        )}
                      </div>
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
      {/* Error Dialog */}
      <ErrorDialog 
        open={errorDialog.open} 
        onOpenChange={(open) => setErrorDialog(prev => ({ ...prev, open }))}
        message={errorDialog.message}
      />
    </div>
  )
}

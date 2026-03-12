'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Settings, Loader2, Eye, EyeOff, Check, Database, Bot, BrainCircuit } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface LLMConfig {
  id?: string
  provider: string
  apiKey: string
  hasApiKey?: boolean
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  databaseType: string
}

interface SettingsDialogProps {
  onConfigChange?: () => void
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  { value: 'anthropic', label: 'Anthropic (兼容接口)', defaultBaseUrl: 'https://api.anthropic.com/v1' },
  { value: 'moonshot', label: 'Moonshot', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  { value: 'zhipu', label: '智谱 AI', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'custom', label: '自定义 (兼容 OpenAI)', defaultBaseUrl: '' }
]

const MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  anthropic: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
  moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  zhipu: ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
  custom: []
}

const DATABASE_TYPES = [
  { value: 'mysql', label: 'MySQL', description: '最流行的开源关系数据库' },
  { value: 'postgresql', label: 'PostgreSQL', description: '功能强大的对象关系数据库' },
  { value: 'sqlite', label: 'SQLite', description: '轻量级嵌入式数据库' },
  { value: 'sqlserver', label: 'SQL Server', description: '微软企业级数据库' },
  { value: 'oracle', label: 'Oracle', description: '企业级大型数据库' },
  { value: 'mariadb', label: 'MariaDB', description: 'MySQL 的开源分支' },
  { value: 'clickhouse', label: 'ClickHouse', description: '列式存储分析数据库' }
]

export default function SettingsDialog({ onConfigChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [config, setConfig] = useState<LLMConfig>({
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
    databaseType: 'mysql'
  })
  const [hasExistingConfig, setHasExistingConfig] = useState(false)
  const [originalConfig, setOriginalConfig] = useState<LLMConfig | null>(null)

  // 加载配置
  useEffect(() => {
    if (open) {
      loadConfig()
    }
  }, [open])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/llm-config')
      const data = await response.json()

      if (data.exists) {
        setHasExistingConfig(true)
        const loadedConfig = {
          provider: data.config.provider || 'openai',
          apiKey: data.config.apiKey || '', // 回显掩码后的 Key
          hasApiKey: data.config.hasApiKey,
          baseUrl: data.config.baseUrl || '',
          model: data.config.model || 'gpt-4o-mini',
          temperature: data.config.temperature || 0.7,
          maxTokens: data.config.maxTokens || 4096,
          databaseType: data.config.databaseType || 'mysql'
        }
        setConfig(loadedConfig)
        setOriginalConfig(loadedConfig)
      } else {
        setHasExistingConfig(false)
        setOriginalConfig(null)
        setConfig({
          provider: 'openai',
          apiKey: '',
          baseUrl: '',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          databaseType: 'mysql'
        })
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    // 验证
    if (!config.apiKey.trim() && !hasExistingConfig) {
      toast.error('请输入 API Key')
      return
    }

    setSaving(true)
    try {
      const saveData = { ...config }
      
      // 如果已有配置，判断 API Key 是否被修改
      if (hasExistingConfig) {
        // 1. 如果当前 Key 等于原始加载的 Key（掩码 Key），说明用户未修改，保持原有 Key
        if (originalConfig && config.apiKey === originalConfig.apiKey) {
          saveData.apiKey = ''
          saveData.keepExistingKey = true
        }
        // 2. 如果 Key 为空（用户清空了输入框），也保持原有 Key
        else if (!config.apiKey.trim()) {
          saveData.keepExistingKey = true
        }
        // 3. 其他情况（用户输入了新 Key），正常发送
      }

      const response = await fetch('/api/llm-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
      })

      let data
      try {
        data = await response.json()
      } catch (error) {
        console.error('Failed to parse response:', error)
        throw new Error(`Server error: ${response.status} ${response.statusText}`)
      }

      if (response.ok) {
        toast.success('配置保存成功')
        setOpen(false)
        onConfigChange?.()
      } else {
        const errorMsg = data?.details ? `${data.error}: ${data.details}` : (data?.error || '保存失败')
        toast.error(errorMsg)
      }
    } catch (error) {
      console.error('Failed to save config:', error)
      toast.error(error instanceof Error ? error.message : '保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  const handleProviderChange = (provider: string) => {
    const providerInfo = PROVIDERS.find(p => p.value === provider)
    const defaultModel = MODELS[provider]?.[0] || ''
    
    setConfig(prev => ({
      ...prev,
      provider,
      baseUrl: providerInfo?.defaultBaseUrl || prev.baseUrl,
      model: defaultModel || prev.model
    }))
  }

  const selectedProvider = PROVIDERS.find(p => p.value === config.provider)
  const selectedDatabase = DATABASE_TYPES.find(d => d.value === config.databaseType)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Settings className="w-5 h-5" />
          {!hasExistingConfig && open === false && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-none">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            设置
          </DialogTitle>
          <DialogDescription>
            配置数据库与模型参数
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 py-2">
            <Tabs defaultValue="database" className="w-full h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 flex-none">
                <TabsTrigger value="database" className="flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  数据库
                </TabsTrigger>
                <TabsTrigger value="llm" className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  模型
                </TabsTrigger>
              </TabsList>
              
              <div className="flex-1 overflow-y-auto mt-4 px-1">
                <TabsContent value="database" className="mt-0 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-500" />
                        数据库类型
                      </CardTitle>
                      <CardDescription>
                        选择您希望生成 SQL 的目标数据库类型
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="databaseType">数据库类型</Label>
                        <Select value={config.databaseType} onValueChange={v => setConfig(prev => ({ ...prev, databaseType: v }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="选择数据库类型" />
                          </SelectTrigger>
                          <SelectContent>
                            {DATABASE_TYPES.map(d => (
                              <SelectItem key={d.value} value={d.value}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{d.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedDatabase && (
                          <div className="text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900 p-3 rounded-md border">
                            <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">{selectedDatabase.label}</p>
                            <p>{selectedDatabase.description}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="llm" className="mt-0 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-purple-500" />
                        模型参数
                      </CardTitle>
                      <CardDescription>
                        配置 AI 模型的连接信息和生成参数
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* 服务商选择 */}
                      <div className="space-y-2">
                        <Label htmlFor="provider">服务商</Label>
                        <Select value={config.provider} onValueChange={handleProviderChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="选择服务商" />
                          </SelectTrigger>
                          <SelectContent>
                            {PROVIDERS.map(p => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* API Key */}
                      <div className="space-y-2">
                        <Label htmlFor="apiKey" className="flex items-center justify-between">
                          <span>API Key</span>
                          {hasExistingConfig && config.hasApiKey && (
                            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                              已配置
                            </Badge>
                          )}
                        </Label>
                        <div className="relative">
                          <Input
                            id="apiKey"
                            type={showApiKey ? 'text' : 'password'}
                            placeholder={hasExistingConfig ? '留空保持原有配置' : 'sk-...'}
                            value={config.apiKey}
                            onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                            className="pr-10 font-mono text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full hover:bg-transparent"
                            onClick={() => setShowApiKey(!showApiKey)}
                          >
                            {showApiKey ? (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <Eye className="w-4 h-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        {hasExistingConfig && (
                          <p className="text-xs text-muted-foreground">
                            输入新的 API Key 将覆盖原有配置
                          </p>
                        )}
                      </div>

                      {/* Base URL */}
                      <div className="space-y-2">
                        <Label htmlFor="baseUrl">
                          API 地址
                          {config.provider !== 'custom' && (
                            <span className="text-xs text-muted-foreground font-normal ml-2">(可选)</span>
                          )}
                        </Label>
                        <Input
                          id="baseUrl"
                          placeholder={selectedProvider?.defaultBaseUrl || 'https://api.example.com/v1'}
                          value={config.baseUrl}
                          onChange={e => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                          className="font-mono text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Model */}
                        <div className="space-y-2">
                          <Label htmlFor="model">模型名称</Label>
                          <Input
                            id="model"
                            placeholder="gpt-4o-mini"
                            value={config.model}
                            onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                            className="font-mono text-sm"
                          />
                        </div>

                        {/* Max Tokens */}
                        <div className="space-y-2">
                          <Label htmlFor="maxTokens">最大 Token 数</Label>
                          <Input
                            id="maxTokens"
                            type="number"
                            min={256}
                            max={32768}
                            value={config.maxTokens}
                            onChange={e => setConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
                            className="font-mono text-sm"
                          />
                        </div>
                      </div>

                      {/* Temperature */}
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                          <Label>温度 (Temperature)</Label>
                          <span className="text-sm font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                            {config.temperature.toFixed(1)}
                          </span>
                        </div>
                        <Slider
                          value={[config.temperature]}
                          min={0}
                          max={2}
                          step={0.1}
                          onValueChange={([value]) => setConfig(prev => ({ ...prev, temperature: value }))}
                          className="py-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>精确 (0.0)</span>
                          <span>平衡 (1.0)</span>
                          <span>创造性 (2.0)</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}

        <DialogFooter className="flex-none gap-2 sm:gap-0 mt-4 border-t pt-4">
          <Button variant="ghost" onClick={() => setOpen(false)} className="hover:bg-slate-100 dark:hover:bg-slate-800">
            取消
          </Button>
          <Button onClick={saveConfig} disabled={saving || loading} className="min-w-[120px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                保存
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

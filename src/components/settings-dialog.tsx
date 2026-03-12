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
  id: string
  name: string
  provider: string
  apiKey: string
  hasApiKey?: boolean
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  isActive: boolean
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
  const [configs, setConfigs] = useState<LLMConfig[]>([])
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [databaseType, setDatabaseType] = useState('mysql')
  
  // 临时编辑状态
  const [editForm, setEditForm] = useState<LLMConfig>({
    id: '',
    name: 'New Config',
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
    isActive: false
  })

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
        // 适配旧数据结构或多配置结构
        if (Array.isArray(data.configs)) {
            setConfigs(data.configs)
        } else {
            // 迁移旧配置
            const oldConfig = {
                id: 'default',
                name: 'Default Config',
                provider: data.config.provider || 'openai',
                apiKey: data.config.apiKey || '',
                hasApiKey: data.config.hasApiKey,
                baseUrl: data.config.baseUrl || '',
                model: data.config.model || 'gpt-4o-mini',
                temperature: data.config.temperature || 0.7,
                maxTokens: data.config.maxTokens || 4096,
                isActive: true
            }
            setConfigs([oldConfig])
        }
        setDatabaseType(data.databaseType || 'mysql')
      } else {
        setConfigs([])
        setDatabaseType('mysql')
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEditConfig = (config: LLMConfig) => {
      setEditingConfigId(config.id)
      setEditForm({...config})
      setShowApiKey(false)
  }

  const handleAddNew = () => {
      setEditingConfigId('new')
      setEditForm({
        id: crypto.randomUUID(),
        name: 'New Configuration',
        provider: 'openai',
        apiKey: '',
        baseUrl: '',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4096,
        isActive: configs.length === 0
      })
      setShowApiKey(false)
  }

  const handleDelete = (id: string) => {
      const newConfigs = configs.filter(c => c.id !== id)
      setConfigs(newConfigs)
      if (editingConfigId === id) {
          setEditingConfigId(null)
      }
  }

  const handleActivate = (id: string) => {
      const newConfigs = configs.map(c => ({
          ...c,
          isActive: c.id === id
      }))
      setConfigs(newConfigs)
  }

  const handleSaveEdit = () => {
      if (!editForm.apiKey && !editForm.hasApiKey) {
          toast.error('请输入 API Key')
          return
      }

      let newConfigs = [...configs]
      if (editingConfigId === 'new') {
          newConfigs.push(editForm)
      } else {
          newConfigs = newConfigs.map(c => c.id === editingConfigId ? editForm : c)
      }
      
      setConfigs(newConfigs)
      setEditingConfigId(null)
  }

  const saveAllConfigs = async () => {
    setSaving(true)
    try {
      const activeConfig = configs.find(c => c.isActive)
      if (!activeConfig && configs.length > 0) {
          toast.error('请选择一个激活的配置')
          setSaving(false)
          return
      }

      const payload = {
          configs: configs,
          databaseType: databaseType
      }

      const response = await fetch('/api/llm-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        toast.success('配置保存成功')
        setOpen(false)
        onConfigChange?.()
      } else {
        toast.error('保存失败')
      }
    } catch (error) {
      console.error('Failed to save config:', error)
      toast.error('保存配置失败')
    } finally {
      setSaving(false)
    }
  }


  const handleProviderChange = (provider: string) => {
    const providerInfo = PROVIDERS.find(p => p.value === provider)
    const defaultModel = MODELS[provider]?.[0] || ''
    
    setEditForm(prev => ({
      ...prev,
      provider,
      baseUrl: providerInfo?.defaultBaseUrl || prev.baseUrl,
      model: defaultModel || prev.model
    }))
  }

  const selectedProvider = PROVIDERS.find(p => p.value === editForm.provider)
  const selectedDatabase = DATABASE_TYPES.find(d => d.value === databaseType)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Settings className="w-5 h-5" />
          {configs.length === 0 && open === false && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
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
                        <Select value={databaseType} onValueChange={setDatabaseType}>
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
                  {editingConfigId ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BrainCircuit className="w-4 h-4 text-purple-500" />
                                {editingConfigId === 'new' ? '添加新配置' : '编辑配置'}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setEditingConfigId(null)}>
                                返回列表
                            </Button>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="configName">配置名称</Label>
                            <Input
                                id="configName"
                                placeholder="My Config"
                                value={editForm.name}
                                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            />
                          </div>

                          {/* 服务商选择 */}
                          <div className="space-y-2">
                            <Label htmlFor="provider">服务商</Label>
                            <Select value={editForm.provider} onValueChange={handleProviderChange}>
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
                              {editForm.hasApiKey && (
                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                  已配置
                                </Badge>
                              )}
                            </Label>
                            <div className="relative">
                              <Input
                                id="apiKey"
                                type={showApiKey ? 'text' : 'password'}
                                placeholder={editForm.hasApiKey ? '留空保持原有配置' : 'sk-...'}
                                value={editForm.apiKey}
                                onChange={e => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
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
                          </div>

                          {/* Base URL */}
                          <div className="space-y-2">
                            <Label htmlFor="baseUrl">
                              API 地址
                              {editForm.provider !== 'custom' && (
                                <span className="text-xs text-muted-foreground font-normal ml-2">(可选)</span>
                              )}
                            </Label>
                            <Input
                              id="baseUrl"
                              placeholder={selectedProvider?.defaultBaseUrl || 'https://api.example.com/v1'}
                              value={editForm.baseUrl}
                              onChange={e => setEditForm(prev => ({ ...prev, baseUrl: e.target.value }))}
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
                                value={editForm.model}
                                onChange={e => setEditForm(prev => ({ ...prev, model: e.target.value }))}
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
                                value={editForm.maxTokens}
                                onChange={e => setEditForm(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
                                className="font-mono text-sm"
                              />
                            </div>
                          </div>

                          {/* Temperature */}
                          <div className="space-y-4 pt-2">
                            <div className="flex items-center justify-between">
                              <Label>温度 (Temperature)</Label>
                              <span className="text-sm font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                {editForm.temperature.toFixed(1)}
                              </span>
                            </div>
                            <Slider
                              value={[editForm.temperature]}
                              min={0}
                              max={2}
                              step={0.1}
                              onValueChange={([value]) => setEditForm(prev => ({ ...prev, temperature: value }))}
                              className="py-2"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>精确 (0.0)</span>
                              <span>平衡 (1.0)</span>
                              <span>创造性 (2.0)</span>
                            </div>
                          </div>

                          <div className="flex justify-end pt-4">
                              <Button onClick={handleSaveEdit}>保存配置项</Button>
                          </div>
                        </CardContent>
                      </Card>
                  ) : (
                      <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BrainCircuit className="w-4 h-4 text-purple-500" />
                                    模型列表
                                </div>
                                <Button size="sm" onClick={handleAddNew}>添加配置</Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {configs.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    暂无配置，请添加
                                </div>
                            ) : (
                                configs.map(c => (
                                    <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${c.isActive ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'bg-slate-50 dark:bg-slate-900'}`}>
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className={`w-4 h-4 rounded-full border cursor-pointer flex items-center justify-center ${c.isActive ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}
                                                onClick={() => handleActivate(c.id)}
                                            >
                                                {c.isActive && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">{c.name}</div>
                                                <div className="text-xs text-muted-foreground">{c.provider} / {c.model}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => handleEditConfig(c)}>编辑</Button>
                                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(c.id)}>删除</Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                      </Card>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}

        <DialogFooter className="flex-none gap-2 sm:gap-0 mt-4 border-t pt-4">
          <Button variant="ghost" onClick={() => setOpen(false)} className="hover:bg-slate-100 dark:hover:bg-slate-800">
            取消
          </Button>
          <Button onClick={saveAllConfigs} disabled={saving || loading} className="min-w-[120px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md">
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

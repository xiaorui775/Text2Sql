'use client'

import { useMemo, useRef } from 'react'
import { toPng } from 'html-to-image'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

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

interface ERDiagramProps {
  tables: TableSchema[]
  relations: TableRelation[]
}

interface TablePosition {
  x: number
  y: number
  width: number
  height: number
  typeX: number
}

// 计算表的位置布局
function calculateLayout(tables: TableSchema[]): Record<string, TablePosition> {
  const positions: Record<string, TablePosition> = {}
  
  if (tables.length === 0) return positions
  
  // 计算所有表中所需的最大宽度
  let maxNameWidth = 0
  let maxTypeWidth = 0
  
  // 估算字体宽度：Name ~8px (bold), Type ~6px
  tables.forEach(table => {
    // 检查表名宽度
    maxNameWidth = Math.max(maxNameWidth, table.name.length * 8)
    
    table.fields.forEach(field => {
      maxNameWidth = Math.max(maxNameWidth, field.name.length * 7)
      const typeStr = field.type + (field.isNullable ? '' : '*')
      maxTypeWidth = Math.max(maxTypeWidth, typeStr.length * 6)
    })
  })
  
  const padding = 16
  const gap = 12
  
  // 计算类型列的起始位置和总宽度
  // Field name starts at x=12
  const typeX = 12 + maxNameWidth + gap
  const tableWidth = Math.max(180, typeX + maxTypeWidth + padding)
  
  const rowHeight = 28
  const headerHeight = 40
  const horizontalGap = 100
  const verticalGap = 60
  
  // 计算每个表的高度
  const tableHeights: Record<string, number> = {}
  tables.forEach(table => {
    tableHeights[table.name] = headerHeight + table.fields.length * rowHeight + 16 // padding
  })
  
  // 使用网格布局算法
  const cols = Math.ceil(Math.sqrt(tables.length))
  const rows = Math.ceil(tables.length / cols)
  
  tables.forEach((table, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    
    positions[table.name] = {
      x: 40 + col * (tableWidth + horizontalGap),
      y: 40 + row * (Math.max(...Object.values(tableHeights)) + verticalGap),
      width: tableWidth,
      height: tableHeights[table.name],
      typeX: typeX
    }
  })
  
  return positions
}

// 获取关系线颜色
function getRelationColor(relationType: string) {
  switch (relationType) {
    case '1:1':
      return '#10b981' // emerald
    case '1:N':
      return '#f59e0b' // amber
    case 'N:M':
      return '#8b5cf6' // purple
    default:
      return '#64748b' // slate
  }
}

// 获取关系标签
function getRelationLabel(relationType: string) {
  switch (relationType) {
    case '1:1':
      return '1:1'
    case '1:N':
      return '1:N'
    case 'N:M':
      return 'N:M'
    default:
      return relationType
  }
}

export default function ERDiagram({ tables, relations }: ERDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  
  const positions = useMemo(() => calculateLayout(tables), [tables])
  
  // 计算画布大小
  const svgSize = useMemo(() => {
    if (Object.keys(positions).length > 0) {
      const maxX = Math.max(...Object.values(positions).map(p => p.x + p.width))
      const maxY = Math.max(...Object.values(positions).map(p => p.y + p.height))
      return {
        width: Math.max(800, maxX + 60),
        height: Math.max(500, maxY + 60)
      }
    }
    return { width: 800, height: 500 }
  }, [positions])
  
  const handleDownload = async () => {
    if (svgRef.current === null) {
      return
    }

    try {
      // 获取 SVG 的父元素
      const container = svgRef.current.parentElement
      if (!container) return

      // 1. 保存原始样式
      const originalMaxHeight = container.style.maxHeight
      const originalOverflow = container.style.overflow
      const originalPosition = container.style.position

      // 2. 临时修改样式以展示全部内容
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      // 确保容器能够撑开以包含 SVG 的完整尺寸
      container.style.width = `${svgSize.width}px`
      container.style.height = `${svgSize.height}px`

      // 3. 等待一下确保样式生效
      await new Promise(resolve => setTimeout(resolve, 100))

      const dataUrl = await toPng(container, { 
        backgroundColor: '#ffffff',
        width: svgSize.width,
        height: svgSize.height,
        pixelRatio: 2, // 提高清晰度
        style: {
           transform: 'none', // 移除可能的缩放
           margin: '0',
           padding: '0'
        }
      })
      
      // 4. 恢复原始样式
      container.style.maxHeight = originalMaxHeight
      container.style.overflow = originalOverflow
      container.style.position = originalPosition
      container.style.width = ''
      container.style.height = ''
      
      const link = document.createElement('a')
      link.download = 'er-diagram.png'
      link.href = dataUrl
      link.click()
      toast.success('ER图下载成功')
    } catch (err) {
      console.error('Failed to download image:', err)
      toast.error('下载图片失败')
    }
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-slate-400">
        暂无数据
      </div>
    )
  }
  
  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDownload}
          className="bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white hover:text-emerald-600 transition-colors group"
        >
          <Download className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
          导出图片
        </Button>
      </div>
      <div className="overflow-auto max-h-[500px] bg-white rounded-lg border">
        <svg
          ref={svgRef}
        width={svgSize.width}
        height={svgSize.height}
        className="min-w-full"
      >
        {/* Definitions for markers and patterns */}
        <defs>
          {/* Arrow marker for 1:N relations */}
          <marker
            id="arrow-1n"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          {/* Circle marker for many side */}
          <marker
            id="circle-many"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </marker>
        </defs>
        
        {/* Draw relations first (below tables) */}
        <g className="relations">
          {relations.map((relation, index) => {
            const fromPos = positions[relation.fromTable]
            const toPos = positions[relation.toTable]
            
            if (!fromPos || !toPos) return null
            
            const fromField = tables.find(t => t.name === relation.fromTable)?.fields.find(f => f.name === relation.fromField)
            const toField = tables.find(t => t.name === relation.toTable)?.fields.find(f => f.name === relation.toField)
            
            if (!fromField || !toField) return null
            
            // 计算连接点
            const fromFieldIndex = tables.find(t => t.name === relation.fromTable)?.fields.findIndex(f => f.name === relation.fromField) ?? 0
            const toFieldIndex = tables.find(t => t.name === relation.toTable)?.fields.findIndex(f => f.name === relation.toField) ?? 0
            
            const headerHeight = 40
            const rowHeight = 28
            
            // 确定连接方向
            const isFromRight = fromPos.x > toPos.x
            const isFromBelow = fromPos.y > toPos.y
            
            let fromX: number, fromY: number, toX: number, toY: number
            
            if (Math.abs(fromPos.y - toPos.y) > Math.abs(fromPos.x - toPos.x)) {
              // 垂直方向连接
              fromX = fromPos.x + fromPos.width / 2
              toX = toPos.x + toPos.width / 2
              fromY = isFromBelow ? fromPos.y : fromPos.y + fromPos.height
              toY = isFromBelow ? toPos.y + toPos.height : toPos.y
            } else {
              // 水平方向连接
              fromX = isFromRight ? fromPos.x : fromPos.x + fromPos.width
              // 修正Y轴坐标计算：headerHeight + fieldIndex * rowHeight + rowHeight / 2
              // 字段行起始Y = 40 + index * 28
              // 行中心Y = 起始Y + 14
              fromY = fromPos.y + headerHeight + fromFieldIndex * rowHeight + 14
              toX = isFromRight ? toPos.x + toPos.width : toPos.x
              toY = toPos.y + headerHeight + toFieldIndex * rowHeight + 14
            }
            
            // 计算贝塞尔曲线控制点
            const dx = toX - fromX
            const dy = toY - fromY
            const controlOffset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.5
            
            const color = getRelationColor(relation.relationType)
            const midX = (fromX + toX) / 2
            const midY = (fromY + toY) / 2
            
            return (
              <g key={index}>
                {/* Connection line */}
                <path
                  d={`M ${fromX} ${fromY} Q ${fromX + controlOffset} ${midY} ${midX} ${midY} Q ${toX - controlOffset} ${midY} ${toX} ${toY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray={relation.relationType === 'N:M' ? '5,5' : 'none'}
                  className="transition-all duration-300 hover:stroke-[3]"
                  style={{ opacity: 0.7 }}
                />
                {/* Relation type label */}
                <rect
                  x={midX - 20}
                  y={midY - 10}
                  width="40"
                  height="20"
                  rx="4"
                  fill="white"
                  stroke={color}
                  strokeWidth="1"
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill={color}
                >
                  {getRelationLabel(relation.relationType)}
                </text>
                {/* Connection dots */}
                <circle cx={fromX} cy={fromY} r="4" fill={color} />
                <circle cx={toX} cy={toY} r="4" fill={color} />
              </g>
            )
          })}
        </g>
        
        {/* Draw tables */}
        <g className="tables">
          {tables.map((table) => {
            const pos = positions[table.name]
            if (!pos) return null
            
            return (
              <g
                key={table.name}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-pointer"
              >
                {/* Table shadow */}
                <rect
                  x="2"
                  y="2"
                  width={pos.width}
                  height={pos.height}
                  rx="8"
                  fill="rgba(0,0,0,0.1)"
                  className="blur-sm"
                />
                
                {/* Table container */}
                <rect
                  width={pos.width}
                  height={pos.height}
                  rx="8"
                  fill="white"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  className="transition-all duration-200 hover:stroke-emerald-300"
                />
                
                {/* Table header */}
                <rect
                  width={pos.width}
                  height="40"
                  rx="8"
                  fill="url(#headerGradient)"
                />
                <rect
                  y="32"
                  width={pos.width}
                  height="8"
                  fill="url(#headerGradient)"
                />
                
                {/* Header gradient */}
                <defs>
                  <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#14b8a6" />
                  </linearGradient>
                </defs>
                
                {/* Table name */}
                <text
                  x="16"
                  y="26"
                  fontSize="14"
                  fontWeight="600"
                  fill="white"
                >
                  {table.name}
                </text>
                
                {/* Table comment */}
                {table.comment && (
                  <title>{table.comment}</title>
                )}
                
                {/* Fields */}
                {table.fields.map((field, fieldIndex) => {
                  const y = 40 + fieldIndex * 28 + 20
                  
                  return (
                    <g key={field.name}>
                      {/* Field row background */}
                      <rect
                        y={40 + fieldIndex * 28}
                        width={pos.width}
                        height="28"
                        fill={fieldIndex % 2 === 0 ? 'transparent' : 'rgba(241, 245, 249, 0.5)'}
                      />
                      
                      {/* Field name */}
                      <text
                        x={12}
                        y={y}
                        fontSize="12"
                        fontWeight="500"
                        fill="#1e293b"
                      >
                        {field.name}
                      </text>
                      
                      {/* Field type - changed from right aligned to left aligned */}
                      <text
                        x={pos.typeX}
                        y={y}
                        fontSize="10"
                        fill="#94a3b8"
                        textAnchor="start"
                      >
                        {field.type}
                        {field.isNullable ? '' : '*'}
                      </text>
                      
                      {/* Field comment tooltip */}
                      {field.comment && (
                        <title>{field.comment}</title>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
        </g>
      </svg>
      </div>
    </div>
  )
}

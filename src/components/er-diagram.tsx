'use client'

import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
  className?: string
  fullHeight?: boolean
}

interface TablePosition {
  x: number
  y: number
  width: number
  height: number
  typeX: number
}

function calculateLayout(tables: TableSchema[]): Record<string, TablePosition> {
  const positions: Record<string, TablePosition> = {}
  
  if (tables.length === 0) return positions
  
  let maxNameWidth = 0
  let maxTypeWidth = 0
  
  tables.forEach(table => {
    maxNameWidth = Math.max(maxNameWidth, table.name.length * 8)
    
    table.fields.forEach(field => {
      maxNameWidth = Math.max(maxNameWidth, field.name.length * 7)
      const typeStr = field.type + (field.isNullable ? '' : '*')
      maxTypeWidth = Math.max(maxTypeWidth, typeStr.length * 6)
    })
  })
  
  const padding = 16
  const gap = 12
  const nameStartX = 48 // Increased to accommodate PK/FK indicators
  const typeX = nameStartX + maxNameWidth + gap
  const tableWidth = Math.max(180, typeX + maxTypeWidth + padding)
  
  const rowHeight = 28
  const headerHeight = 40
  const horizontalGap = 150
  const verticalGap = 100
  
  const tableHeights: Record<string, number> = {}
  tables.forEach(table => {
    tableHeights[table.name] = headerHeight + table.fields.length * rowHeight + 16
  })
  
  const cols = Math.ceil(Math.sqrt(tables.length))
  
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

function getRelationColor(relationType: string) {
  switch (relationType) {
    case '1:1': return '#10b981'
    case '1:N': return '#f59e0b'
    case 'N:M': return '#8b5cf6'
    default: return '#64748b'
  }
}

function getRelationLabel(relationType: string) {
  return relationType
}

export default function ERDiagram({ tables, relations, className, fullHeight = false }: ERDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [downloading, setDownloading] = useState(false)
  
  const positions = useMemo(() => calculateLayout(tables), [tables])
  
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
    if (svgRef.current === null || downloading) return

    setDownloading(true)
    try {
      const container = svgRef.current.parentElement
      if (!container) return

      const originalMaxHeight = container.style.maxHeight
      const originalOverflow = container.style.overflow
      const originalWidth = container.style.width
      const originalHeight = container.style.height

      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      container.style.width = `${svgSize.width}px`
      container.style.height = `${svgSize.height}px`

      await new Promise(resolve => setTimeout(resolve, 100))

      const dataUrl = await toPng(container, { 
        backgroundColor: '#ffffff',
        width: svgSize.width,
        height: svgSize.height,
        pixelRatio: 2,
      })
      
      container.style.maxHeight = originalMaxHeight
      container.style.overflow = originalOverflow
      container.style.width = originalWidth
      container.style.height = originalHeight
      
      const link = document.createElement('a')
      link.download = 'er-diagram.png'
      link.href = dataUrl
      link.click()
      toast.success('ER图下载成功')
    } catch (err) {
      console.error('Failed to download image:', err)
      toast.error('下载图片失败')
    } finally {
      setDownloading(false)
    }
  }

  if (tables.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-[300px] text-slate-400", className)}>
        暂无数据
      </div>
    )
  }
  
  return (
    <div className={cn("relative group/container", className)}>
      <div className="absolute top-4 right-4 z-10 opacity-0 group-hover/container:opacity-100 transition-opacity duration-300">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleDownload}
                disabled={downloading}
                className="bg-white/90 backdrop-blur-sm shadow-md hover:bg-white hover:text-emerald-600 transition-all border-slate-200"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>导出图片</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className={cn("overflow-auto bg-white rounded-lg border transition-all", fullHeight ? "h-full" : "max-h-[500px]")}>
        <svg ref={svgRef} width={svgSize.width} height={svgSize.height} className="min-w-full">
          <g className="relations">
            {relations.map((relation, index) => {
              const fromPos = positions[relation.fromTable]
              const toPos = positions[relation.toTable]
              if (!fromPos || !toPos) return null
              
              const fromFieldIndex = tables.find(t => t.name === relation.fromTable)?.fields.findIndex(f => f.name === relation.fromField) ?? -1
              const toFieldIndex = tables.find(t => t.name === relation.toTable)?.fields.findIndex(f => f.name === relation.toField) ?? -1
              if (fromFieldIndex === -1 || toFieldIndex === -1) return null
              
              const isFromRight = fromPos.x > toPos.x
              const isFromBelow = fromPos.y > toPos.y
              
              let fromX, fromY, toX, toY
              if (Math.abs(fromPos.y - toPos.y) > Math.abs(fromPos.x - toPos.x)) {
                fromX = fromPos.x + fromPos.width / 2
                toX = toPos.x + toPos.width / 2
                fromY = isFromBelow ? fromPos.y : fromPos.y + fromPos.height
                toY = isFromBelow ? toPos.y + toPos.height : toPos.y
              } else {
                fromX = isFromRight ? fromPos.x : fromPos.x + fromPos.width
                fromY = fromPos.y + 40 + fromFieldIndex * 28 + 14
                toX = isFromRight ? toPos.x + toPos.width : toPos.x
                toY = toPos.y + 40 + toFieldIndex * 28 + 14
              }
              
              const dx = toX - fromX
              const dy = toY - fromY
              const isVertical = Math.abs(dy) > Math.abs(dx)
              const controlOffset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.5
              const midX = (fromX + toX) / 2
              const midY = (fromY + toY) / 2
              const color = getRelationColor(relation.relationType)

              return (
                <g key={index}>
                  <path
                    d={`M ${fromX} ${fromY} Q ${fromX + (isVertical ? 0 : controlOffset * (fromX < toX ? 1 : -1))} ${midY} ${midX} ${midY} Q ${toX - (isVertical ? 0 : controlOffset * (fromX < toX ? 1 : -1))} ${midY} ${toX} ${toY}`}
                    fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray={relation.relationType === 'N:M' ? '5,5' : 'none'}
                    style={{ opacity: 0.7 }}
                  />
                </g>
              )
            })}
          </g>
          
          <g className="tables">
            {tables.map((table) => {
              const pos = positions[table.name]
              if (!pos) return null
              return (
                <g key={table.name} transform={`translate(${pos.x}, ${pos.y})`}>
                  <rect x="2" y="2" width={pos.width} height={pos.height} rx="8" fill="rgba(0,0,0,0.1)" className="blur-sm" />
                  <rect width={pos.width} height={pos.height} rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                  <rect width={pos.width} height="40" rx="8" fill="url(#headerGradient)" />
                  <rect y="32" width={pos.width} height="8" fill="url(#headerGradient)" />
                  <defs>
                    <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#14b8a6" />
                    </linearGradient>
                  </defs>
                  <text x="16" y="26" fontSize="14" fontWeight="600" fill="white">{table.name}</text>
                  {table.fields.map((field, fieldIndex) => (
                    <g key={field.name}>
                      <rect y={40 + fieldIndex * 28} width={pos.width} height="28" fill={fieldIndex % 2 === 0 ? 'transparent' : 'rgba(241, 245, 249, 0.5)'} />
                      {field.isPrimary && <text x={12} y={40 + fieldIndex * 28 + 19} fontSize="10" fontWeight="700" fill="#059669" fontFamily="monospace">PK</text>}
                      {field.isForeign && <text x={field.isPrimary ? 30 : 12} y={40 + fieldIndex * 28 + 19} fontSize="10" fontWeight="700" fill="#3b82f6" fontFamily="monospace">FK</text>}
                      <text x={48} y={40 + fieldIndex * 28 + 20} fontSize="12" fontWeight="500" fill="#1e293b">{field.name}</text>
                      <text x={pos.typeX} y={40 + fieldIndex * 28 + 20} fontSize="10" fill="#94a3b8" textAnchor="start">{field.type}{field.isNullable ? '' : '*'}</text>
                    </g>
                  ))}
                </g>
              )
            })}
          </g>

          <g className="relation-labels">
            {relations.map((relation, index) => {
              const fromPos = positions[relation.fromTable]
              const toPos = positions[relation.toTable]
              if (!fromPos || !toPos) return null
              const fromFieldIndex = tables.find(t => t.name === relation.fromTable)?.fields.findIndex(f => f.name === relation.fromField) ?? -1
              const toFieldIndex = tables.find(t => t.name === relation.toTable)?.fields.findIndex(f => f.name === relation.toField) ?? -1
              if (fromFieldIndex === -1 || toFieldIndex === -1) return null
              
              const isFromRight = fromPos.x > toPos.x
              const isFromBelow = fromPos.y > toPos.y
              let fromX, fromY, toX, toY
              if (Math.abs(fromPos.y - toPos.y) > Math.abs(fromPos.x - toPos.x)) {
                fromX = fromPos.x + fromPos.width / 2
                toX = toPos.x + toPos.width / 2
                fromY = isFromBelow ? fromPos.y : fromPos.y + fromPos.height
                toY = isFromBelow ? toPos.y + toPos.height : toPos.y
              } else {
                fromX = isFromRight ? fromPos.x : fromPos.x + fromPos.width
                fromY = fromPos.y + 40 + fromFieldIndex * 28 + 14
                toX = isFromRight ? toPos.x + toPos.width : toPos.x
                toY = toPos.y + 40 + toFieldIndex * 28 + 14
              }
              const midX = (fromX + toX) / 2
              const midY = (fromY + toY) / 2
              const color = getRelationColor(relation.relationType)

              return (
                <g key={index}>
                  <rect x={midX - 20} y={midY - 10} width="40" height="20" rx="4" fill="white" stroke={color} strokeWidth="1" />
                  <text x={midX} y={midY + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>{relation.relationType}</text>
                </g>
              )
            })}
          </g>

          <g className="relation-dots">
            {relations.map((relation, index) => {
              const fromPos = positions[relation.fromTable]
              const toPos = positions[relation.toTable]
              if (!fromPos || !toPos) return null
              const fromFieldIndex = tables.find(t => t.name === relation.fromTable)?.fields.findIndex(f => f.name === relation.fromField) ?? -1
              const toFieldIndex = tables.find(t => t.name === relation.toTable)?.fields.findIndex(f => f.name === relation.toField) ?? -1
              if (fromFieldIndex === -1 || toFieldIndex === -1) return null
              
              const isFromRight = fromPos.x > toPos.x
              const isFromBelow = fromPos.y > toPos.y
              let fromX, fromY, toX, toY
              if (Math.abs(fromPos.y - toPos.y) > Math.abs(fromPos.x - toPos.x)) {
                fromX = fromPos.x + fromPos.width / 2
                toX = toPos.x + toPos.width / 2
                fromY = isFromBelow ? fromPos.y : fromPos.y + fromPos.height
                toY = isFromBelow ? toPos.y + toPos.height : toPos.y
              } else {
                fromX = isFromRight ? fromPos.x : fromPos.x + fromPos.width
                fromY = fromPos.y + 40 + fromFieldIndex * 28 + 14
                toX = isFromRight ? toPos.x + toPos.width : toPos.x
                toY = toPos.y + 40 + toFieldIndex * 28 + 14
              }
              const color = getRelationColor(relation.relationType)
              return (
                <g key={`dot-${index}`}>
                  <circle cx={fromX} cy={fromY} r="4" fill={color} />
                  <circle cx={toX} cy={toY} r="4" fill={color} />
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}

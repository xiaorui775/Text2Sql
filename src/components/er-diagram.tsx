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

interface RelationEndpoints {
  fromX: number
  fromY: number
  toX: number
  toY: number
}

interface RelationCurve {
  fromX: number
  fromY: number
  toX: number
  toY: number
  midX: number
  midY: number
  control1X: number
  control1Y: number
  control2X: number
  control2Y: number
}

const HEADER_HEIGHT = 40
const ROW_HEIGHT = 28
const FIELD_CENTER_OFFSET = 14
const LABEL_WIDTH = 44
const LABEL_HEIGHT = 22
const LABEL_SAFE_GAP = 8

function calculateLayout(tables: TableSchema[]): Record<string, TablePosition> {
  const positions: Record<string, TablePosition> = {}
  
  if (tables.length === 0) return positions
  
  let maxNameWidth = 0
  let maxTypeWidth = 0
  
  tables.forEach(table => {
    maxNameWidth = Math.max(maxNameWidth, table.name.length * 8)
    
    table.fields.forEach(field => {
      maxNameWidth = Math.max(maxNameWidth, field.name.length * 7)
      const typeStr = field.type
      maxTypeWidth = Math.max(maxTypeWidth, typeStr.length * 6)
    })
  })
  
  const padding = 16
  const gap = 12
  const nameStartX = 48 // Increased to accommodate PK/FK indicators
  const typeX = nameStartX + maxNameWidth + gap
  const tableWidth = Math.max(180, typeX + maxTypeWidth + padding)
  
  const rowHeight = ROW_HEIGHT
  const headerHeight = HEADER_HEIGHT
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

function getRelationEndpoints(
  relation: TableRelation,
  positions: Record<string, TablePosition>,
  tables: TableSchema[]
): RelationEndpoints | null {
  const fromPos = positions[relation.fromTable]
  const toPos = positions[relation.toTable]
  if (!fromPos || !toPos) return null

  const fromFieldIndex = tables.find(t => t.name === relation.fromTable)?.fields.findIndex(f => f.name === relation.fromField) ?? -1
  const toFieldIndex = tables.find(t => t.name === relation.toTable)?.fields.findIndex(f => f.name === relation.toField) ?? -1
  if (fromFieldIndex === -1 || toFieldIndex === -1) return null

  const isFromRight = fromPos.x > toPos.x
  const isFromBelow = fromPos.y > toPos.y

  let fromX: number
  let fromY: number
  let toX: number
  let toY: number

  if (Math.abs(fromPos.y - toPos.y) > Math.abs(fromPos.x - toPos.x)) {
    fromX = fromPos.x + fromPos.width / 2
    toX = toPos.x + toPos.width / 2
    fromY = isFromBelow ? fromPos.y : fromPos.y + fromPos.height
    toY = isFromBelow ? toPos.y + toPos.height : toPos.y
  } else {
    fromX = isFromRight ? fromPos.x : fromPos.x + fromPos.width
    fromY = fromPos.y + HEADER_HEIGHT + fromFieldIndex * ROW_HEIGHT + FIELD_CENTER_OFFSET
    toX = isFromRight ? toPos.x + toPos.width : toPos.x
    toY = toPos.y + HEADER_HEIGHT + toFieldIndex * ROW_HEIGHT + FIELD_CENTER_OFFSET
  }

  return { fromX, fromY, toX, toY }
}

function intersectsTable(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  positions: Record<string, TablePosition>
) {
  const left = centerX - width / 2 - LABEL_SAFE_GAP
  const right = centerX + width / 2 + LABEL_SAFE_GAP
  const top = centerY - height / 2 - LABEL_SAFE_GAP
  const bottom = centerY + height / 2 + LABEL_SAFE_GAP

  return Object.values(positions).some((pos) => {
    const tableLeft = pos.x
    const tableRight = pos.x + pos.width
    const tableTop = pos.y
    const tableBottom = pos.y + pos.height

    return !(right < tableLeft || left > tableRight || bottom < tableTop || top > tableBottom)
  })
}

function getRelationCurve(endpoints: RelationEndpoints): RelationCurve {
  const dx = endpoints.toX - endpoints.fromX
  const dy = endpoints.toY - endpoints.fromY
  const isVertical = Math.abs(dy) > Math.abs(dx)
  const controlOffset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.5
  const midX = (endpoints.fromX + endpoints.toX) / 2
  const midY = (endpoints.fromY + endpoints.toY) / 2
  const direction = endpoints.fromX < endpoints.toX ? 1 : -1

  return {
    fromX: endpoints.fromX,
    fromY: endpoints.fromY,
    toX: endpoints.toX,
    toY: endpoints.toY,
    midX,
    midY,
    control1X: endpoints.fromX + (isVertical ? 0 : controlOffset * direction),
    control1Y: midY,
    control2X: endpoints.toX - (isVertical ? 0 : controlOffset * direction),
    control2Y: midY
  }
}

function quadraticPoint(p0: number, p1: number, p2: number, t: number) {
  const oneMinusT = 1 - t
  return oneMinusT * oneMinusT * p0 + 2 * oneMinusT * t * p1 + t * t * p2
}

function pointOnCurve(curve: RelationCurve, t: number) {
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped <= 0.5) {
    const localT = clamped * 2
    return {
      x: quadraticPoint(curve.fromX, curve.control1X, curve.midX, localT),
      y: quadraticPoint(curve.fromY, curve.control1Y, curve.midY, localT)
    }
  }

  const localT = (clamped - 0.5) * 2
  return {
    x: quadraticPoint(curve.midX, curve.control2X, curve.toX, localT),
    y: quadraticPoint(curve.midY, curve.control2Y, curve.toY, localT)
  }
}

function getLabelPosition(
  curve: RelationCurve,
  positions: Record<string, TablePosition>
) {
  const maxShift = 0.42
  const shiftStep = 0.06
  const shifts = [0]
  for (let shift = shiftStep; shift <= maxShift; shift += shiftStep) {
    shifts.push(shift, -shift)
  }

  for (const shift of shifts) {
    const t = Math.min(0.92, Math.max(0.08, 0.5 + shift))
    const { x, y } = pointOnCurve(curve, t)
    if (!intersectsTable(x, y, LABEL_WIDTH, LABEL_HEIGHT, positions)) {
      return { x, y }
    }
  }

  return pointOnCurve(curve, 0.5)
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
              const endpoints = getRelationEndpoints(relation, positions, tables)
              if (!endpoints) return null
              const curve = getRelationCurve(endpoints)
              const color = getRelationColor(relation.relationType)

              return (
                <g key={index}>
                  <path
                    d={`M ${curve.fromX} ${curve.fromY} Q ${curve.control1X} ${curve.control1Y} ${curve.midX} ${curve.midY} Q ${curve.control2X} ${curve.control2Y} ${curve.toX} ${curve.toY}`}
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
                      <text x={pos.typeX} y={40 + fieldIndex * 28 + 20} fontSize="10" fill="#94a3b8" textAnchor="start">{field.type}</text>
                    </g>
                  ))}
                </g>
              )
            })}
          </g>

          <g className="relation-labels">
            {relations.map((relation, index) => {
              const endpoints = getRelationEndpoints(relation, positions, tables)
              if (!endpoints) return null
              const curve = getRelationCurve(endpoints)
              const labelPos = getLabelPosition(curve, positions)
              const color = getRelationColor(relation.relationType)

              return (
                <g key={index}>
                  <rect x={labelPos.x - LABEL_WIDTH / 2} y={labelPos.y - LABEL_HEIGHT / 2} width={LABEL_WIDTH} height={LABEL_HEIGHT} rx="4" fill="white" stroke={color} strokeWidth="1" />
                  <text x={labelPos.x} y={labelPos.y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>{getRelationLabel(relation.relationType)}</text>
                </g>
              )
            })}
          </g>

          <g className="relation-dots">
            {relations.map((relation, index) => {
              const endpoints = getRelationEndpoints(relation, positions, tables)
              if (!endpoints) return null
              const { fromX, fromY, toX, toY } = endpoints
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

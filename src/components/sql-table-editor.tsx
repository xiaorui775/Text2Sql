'use client'

import { useState, useCallback, memo, useEffect } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight, Check } from 'lucide-react'

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

interface SqlTableEditorProps {
  tables: TableSchema[]
  relations: TableRelation[]
  onSave: (tables: TableSchema[], relations: TableRelation[]) => void
  onCancel: () => void
}

const COMMON_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'VARCHAR(255)', 'VARCHAR(100)', 'VARCHAR(50)', 'TEXT',
  'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
  'BOOLEAN', 'BLOB', 'JSON',
]

const RELATION_TYPES = ['1:1', '1:N', 'N:1', 'N:M']

// --- Field Row (memoized, native HTML) ---
interface FieldRowProps {
  field: TableField
  ti: number
  fi: number
  onChange: (ti: number, fi: number, u: Partial<TableField>) => void
  onRemove: (ti: number, fi: number) => void
  canRemove: boolean
}

const FieldRow = memo(function FieldRow({ field, ti, fi, onChange, onRemove, canRemove }: FieldRowProps) {
  return (
    <tr className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
      <td className="py-1 px-1 text-center">
        <input type="checkbox" checked={field.isPrimary} onChange={e => onChange(ti, fi, { isPrimary: e.target.checked })} className="accent-emerald-600 w-4 h-4 cursor-pointer" />
      </td>
      <td className="py-1 px-1">
        <input type="text" value={field.name} onChange={e => onChange(ti, fi, { name: e.target.value })}
          className="w-full px-2 py-1 text-sm font-mono bg-transparent border border-slate-200 rounded focus:outline-none focus:border-emerald-400" />
      </td>
      <td className="py-1 px-1">
        <select value={field.type} onChange={e => onChange(ti, fi, { type: e.target.value })}
          className="w-full px-2 py-1 text-sm font-mono bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-400 cursor-pointer">
          {COMMON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="py-1 px-1 text-center">
        <input type="checkbox" checked={field.isNullable} onChange={e => onChange(ti, fi, { isNullable: e.target.checked })} disabled={field.isPrimary}
          className="accent-emerald-600 w-4 h-4 cursor-pointer disabled:opacity-40" />
      </td>
      <td className="py-1 px-1">
        <input type="text" value={field.comment} onChange={e => onChange(ti, fi, { comment: e.target.value })} placeholder="注释"
          className="w-full px-2 py-1 text-sm bg-transparent border border-slate-200 rounded focus:outline-none focus:border-emerald-400" />
      </td>
      <td className="py-1 px-1 text-center">
        {canRemove && (
          <button onClick={() => onRemove(ti, fi)}
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
})

// --- Table Card (memoized) ---
interface TableCardProps {
  table: TableSchema
  ti: number
  expanded: boolean
  onToggle: () => void
  onUpdate: (ti: number, u: Partial<TableSchema>) => void
  onRemove: (ti: number) => void
  onFieldChange: (ti: number, fi: number, u: Partial<TableField>) => void
  onFieldRemove: (ti: number, fi: number) => void
  onAddField: (ti: number) => void
}

const TableCard = memo(function TableCard({ table, ti, expanded, onToggle, onUpdate, onRemove, onFieldChange, onFieldRemove, onAddField }: TableCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 cursor-pointer select-none">
        {expanded ? <ChevronDown className="w-4 h-4 text-emerald-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0" />}
        <input type="text" value={table.name} onClick={e => e.stopPropagation()} onChange={e => onUpdate(ti, { name: e.target.value })}
          className="w-36 px-1 py-0.5 font-semibold text-emerald-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-400 focus:outline-none" />
        <span className="text-slate-300">—</span>
        <input type="text" value={table.comment} onClick={e => e.stopPropagation()} onChange={e => onUpdate(ti, { comment: e.target.value })} placeholder="注释"
          className="w-28 px-1 py-0.5 text-sm text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-400 focus:outline-none" />
        <span className="ml-auto text-xs text-slate-400">{table.fields.length} 字段</span>
        <button onClick={e => { e.stopPropagation(); onRemove(ti) }} className="text-slate-400 hover:text-red-500 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-slate-400 border-b">
                <th className="w-10 py-1 font-medium text-center">PK</th>
                <th className="w-28 py-1 font-medium text-left">字段名</th>
                <th className="w-32 py-1 font-medium text-left">类型</th>
                <th className="w-10 py-1 font-medium text-center">可空</th>
                <th className="py-1 font-medium text-left">注释</th>
                <th className="w-8 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {table.fields.map((field, fi) => (
                <FieldRow key={fi} field={field} ti={ti} fi={fi} onChange={onFieldChange} onRemove={onFieldRemove} canRemove={table.fields.length > 1} />
              ))}
            </tbody>
          </table>
          <button onClick={() => onAddField(ti)} className="mt-1 flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 px-1 py-0.5">
            <Plus className="w-3.5 h-3.5" /> 添加字段
          </button>
        </div>
      )}
    </div>
  )
})

// --- Main Editor ---
export default function SqlTableEditor({ tables, relations, onSave, onCancel }: SqlTableEditorProps) {
  const [lt, setLt] = useState<TableSchema[]>(() => tables)
  const [lr, setLr] = useState<TableRelation[]>(() => relations)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tables.map(t => t.name)))

  useEffect(() => { setLt(tables); setLr(relations); setExpanded(new Set(tables.map(t => t.name))) }, [tables, relations])

  const toggle = useCallback((name: string) => setExpanded(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n }), [])

  const updateTable = useCallback((i: number, u: Partial<TableSchema>) => setLt(p => p.map((t, ti) => ti === i ? { ...t, ...u } : t)), [])
  const removeTable = useCallback((i: number) => setLt(p => { const name = p[i].name; setLr(r => r.filter(x => x.fromTable !== name && x.toTable !== name)); return p.filter((_, ti) => ti !== i) }), [])
  const addTable = useCallback(() => setLt(p => { const name = `table_${p.length + 1}`; setExpanded(e => new Set([...e, name])); return [...p, { name, comment: '', fields: [{ name: 'id', type: 'INT', isPrimary: true, isForeign: false, isNullable: false, comment: '主键' }] }] }), [])
  const addField = useCallback((ti: number) => setLt(p => p.map((t, i) => i !== ti ? t : { ...t, fields: [...t.fields, { name: `field_${t.fields.length + 1}`, type: 'VARCHAR(255)', isPrimary: false, isForeign: false, isNullable: true, comment: '' }] })), [])
  const updateField = useCallback((ti: number, fi: number, u: Partial<TableField>) => setLt(p => p.map((t, i) => i !== ti ? t : { ...t, fields: t.fields.map((f, j) => j !== fi ? f : { ...f, ...u }) })), [])
  const removeField = useCallback((ti: number, fi: number) => setLt(p => { const t = p[ti]; if (t.fields.length <= 1) return p; const rm = t.fields[fi]; setLr(r => r.filter(x => !(x.fromTable === t.name && x.fromField === rm.name) && !(x.toTable === t.name && x.toField === rm.name))); return p.map((tbl, i) => i !== ti ? tbl : { ...tbl, fields: tbl.fields.filter((_, j) => j !== fi) }) }), [])

  const addRelation = useCallback(() => { if (lt.length < 2) return; setLr(p => [...p, { fromTable: lt[0].name, fromField: lt[0].fields[0]?.name || 'id', toTable: lt[1].name, toField: lt[1].fields[0]?.name || 'id', relationType: 'N:1' }]) }, [lt])
  const updateRel = useCallback((i: number, u: Partial<TableRelation>) => setLr(p => p.map((r, ri) => ri === i ? { ...r, ...u } : r)), [])
  const removeRel = useCallback((i: number) => setLr(p => p.filter((_, ri) => ri !== i)), [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50 shrink-0">
        <span className="text-sm text-slate-500">编辑表结构 — 保存后同步到 SQL 和 ER 图</span>
        <div className="flex items-center gap-2">
          <button onClick={() => onSave(lt, lr)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors">
            <Check className="w-4 h-4" /> 保存
          </button>
          <button onClick={onCancel} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors">
            <X className="w-4 h-4" /> 取消
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3 space-y-2 bg-slate-50">
        {lt.map((table, ti) => (
          <TableCard key={ti} table={table} ti={ti} expanded={expanded.has(table.name)} onToggle={() => toggle(table.name)}
            onUpdate={updateTable} onRemove={removeTable} onFieldChange={updateField} onFieldRemove={removeField} onAddField={addField} />
        ))}

        <button onClick={addTable} className="w-full py-2 border-2 border-dashed border-emerald-300 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-400 rounded-lg text-sm font-medium transition-colors">
          + 添加表
        </button>

        {lr.length > 0 && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-sm font-semibold text-blue-800">关联关系</div>
            <div className="p-2">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-slate-400 border-b">
                    <th className="py-1 text-left font-medium">源表.字段</th>
                    <th className="w-6 text-center font-medium">→</th>
                    <th className="py-1 text-left font-medium">目标表.字段</th>
                    <th className="w-20 py-1 text-left font-medium">类型</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lr.map((rel, ri) => (
                    <tr key={ri} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                      <td className="py-1">
                        <div className="flex items-center gap-1">
                          <select value={rel.fromTable} onChange={e => { const t = lt.find(x => x.name === e.target.value); updateRel(ri, { fromTable: e.target.value, fromField: t?.fields[0]?.name || '' }) }}
                            className="px-1 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-400 cursor-pointer">
                            {lt.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                          </select>
                          <span className="text-slate-300">.</span>
                          <select value={rel.fromField} onChange={e => updateRel(ri, { fromField: e.target.value })}
                            className="px-1 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-400 cursor-pointer">
                            {lt.find(t => t.name === rel.fromTable)?.fields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="w-6 text-center text-slate-400">→</td>
                      <td className="py-1">
                        <div className="flex items-center gap-1">
                          <select value={rel.toTable} onChange={e => { const t = lt.find(x => x.name === e.target.value); updateRel(ri, { toTable: e.target.value, toField: t?.fields[0]?.name || '' }) }}
                            className="px-1 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-400 cursor-pointer">
                            {lt.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                          </select>
                          <span className="text-slate-300">.</span>
                          <select value={rel.toField} onChange={e => updateRel(ri, { toField: e.target.value })}
                            className="px-1 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-400 cursor-pointer">
                            {lt.find(t => t.name === rel.toTable)?.fields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="py-1">
                        <select value={rel.relationType} onChange={e => updateRel(ri, { relationType: e.target.value })}
                          className="px-1 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-400 cursor-pointer">
                          {RELATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="py-1 text-center">
                        <button onClick={() => removeRel(ri)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {lt.length >= 2 && (
          <button onClick={addRelation} className="w-full py-2 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 rounded-lg text-sm font-medium transition-colors">
            + 添加关联
          </button>
        )}
      </div>
    </div>
  )
}

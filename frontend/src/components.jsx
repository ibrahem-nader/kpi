import React from 'react'
import Tooltip from '@mui/material/Tooltip'

const s = {
  card: {
    background: 'var(--bg2)',
    border: '0.5px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '1rem 1.25rem',
  },
  metricCard: {
    background: 'var(--bg3)',
    border: '0.5px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '12px 14px',
  },
}

const HELP_TEXT = {
  Completion: 'Percentage of tasks in the selected scope that reached a done status.',
  'Delivery rate': 'Combined delivery KPI based on completion rate and throughput together.',
  Throughput: 'Average number of completed tasks per week within the selected period.',
  'Bug quality': 'Combined bug KPI based on Bugs-list fix rate, completed bug volume, story bugs introduced in main work, and average time to close completed bugs.',
  'Bug close time': 'Average time from bug creation to bug completion across completed bug tasks.',
  'Lead time': 'Average time from task creation to task completion.',
  'Aging WIP': 'Average age of tasks that are still active and not yet done.',
  Estimated: 'Total estimated effort recorded on tasks in the selected scope.',
  Tracked: 'Total tracked time logged on tasks in the selected scope.',
  'Estimate accuracy': 'Tracked time compared with estimated time.',
  'On-time delivery': 'Percentage of due-dated completed tasks finished on or before their due date.',
  'Reopen rate': 'Share of measured tasks that moved from a done state back into active work.',
  'Testing bounce-back': 'Share of measured tasks that returned from testing stages back into development work.',
  'Dev cycle time': 'Average time from first in-progress to awaiting testing or the first later delivery state.',
  'Full cycle time': 'Average time from first in-progress to acceptance, completed, or production.',
  'Bug fix rate': 'Percentage of bug tasks from the Bugs list that reached a done status.',
  'Code coverage': 'Service-level test coverage. This is not available from ClickUp tasks alone and needs CI or test-report integration.',
  'API SLA compliance': 'Response-time or availability compliance against an API SLA. This needs monitoring or APM data, not only task data.',
  'Review quality score': 'Quality signal from code reviews, such as rework, review outcomes, or static analysis. This needs PR or code-quality tooling.',
  'Code Quality Review Score': 'Manual 1-5 KPI entered per person.',
  Canceled: 'Tasks marked canceled, cancelled, rejected, or otherwise excluded from delivery.',
  Overdue: 'Open tasks whose due date has already passed.',
  'No estimate': 'Tasks with no estimate or zero estimate recorded.',
  'Parent tasks measured': 'Parent tasks with usable activity history for cycle and quality measurements.',
  Measurement: 'Definition used for the cycle time calculation shown in this card.',
  'Full cycle end': 'Statuses treated as the end of the full delivery cycle.',
  'Data source': 'Where the metric data came from, usually ClickUp activity history.',
  'Average lead time': 'Average created-to-done time across completed tasks.',
  'Review bounce-back': 'Share of measured tasks that returned from review back into active development.',
  Features: 'Tasks classified as feature or story work.',
  Bugs: 'Tasks classified as bug or defect work.',
  Support: 'Tasks classified as support, customer, or incident work.',
  Refactor: 'Tasks classified as refactor, cleanup, or technical debt work.',
  Chore: 'Tasks classified as maintenance, setup, config, or operational chores.',
  Other: 'Tasks that did not match any current work-type classification rule.',
  'Reopened tasks': 'Count of measured tasks that were reopened after reaching a done state.',
  'All estimated': 'Estimated effort summed across both parent tasks and subtasks.',
  'All tracked': 'Tracked time summed across both parent tasks and subtasks.',
  'Parent estimated': 'Estimated effort recorded only on parent tasks.',
  'Parent tracked': 'Tracked time recorded only on parent tasks.',
  'Subtask estimated': 'Estimated effort recorded only on subtasks.',
  'Subtask tracked': 'Tracked time recorded only on subtasks.',
  'Parent tasks': 'Number of parent tasks in the selected scope.',
  Subtasks: 'Number of subtasks in the selected scope.',
  'Completion rate': 'Percentage of tasks in the selected scope that reached a done status.',
  'Scope completion': 'Percentage of tasks in the selected scope that reached a done status.',
  'Task status breakdown': 'Distribution of the member’s tasks by current ClickUp status.',
  'Work mix': 'Distribution of work by inferred task type.',
  'Work profile': 'Flat counts of inferred work types for the selected scope or member.',
  Execution: 'Evidence of reliably finishing work with reasonable throughput and lead time.',
  Planning: 'Evidence from estimate accuracy, estimate coverage, and on-time delivery.',
  'Quality Ownership': 'Evidence from bug outcomes, reopen rate, bounce-back, and overdue work.',
  'Flow Discipline': 'Evidence from work aging, blocked work, bounce-back, and support load.',
  'Parent est / tracked': 'Parent-task estimate and tracked time shown side by side.',
  'Subtask est / tracked': 'Subtask estimate and tracked time shown side by side.',
  'Parent / subtasks': 'Count of parent tasks versus subtasks for this member.',
  Assigned: 'Number of bug tasks assigned to this member in the selected scope.',
  Fixed: 'Number of assigned bug tasks that reached a done status.',
  'Tasks total': 'Completed tasks compared with all assigned tasks in the selected scope.',
  'Blocked tasks': 'Number of tasks currently in a blocked-like workflow status.',
  'Active tasks': 'Tasks currently in progress, review, testing, or similar active states.',
  'Support load': 'Count of tasks classified as support work.',
  'Refactor/chore mix': 'Combined count of refactor and chore tasks for planning context.',
  'Main work type': 'The most common inferred work type for this member in the selected period.',
  'Overdue open': 'Open tasks assigned to the member whose due date has passed.',
  'Bug volume': 'Count of tasks classified as bugs for the selected scope or member.',
  'Weighted score': 'Final 1-5 score. KPI score contributes 70% and manual competency score contributes 30%. The KPI score itself is an equal-weight average of Delivery rate, estimate accuracy, on-time delivery, Bug quality, and the manual Code Quality Review Score.',
  'KPI score': 'The task-based 1-5 score only, before blending with manual competencies. It averages Delivery rate, estimate accuracy, on-time delivery, Bug quality, and the manual Code Quality Review Score equally.',
  'Competency score': 'Combined manual competency score on a 1-5 scale. Non-discipline competencies share 25/30 of this score, while Discipline contributes 5/30. If only one side is filled, the score re-normalizes to the available inputs.',
  'Manual competency block': 'Average of the non-discipline manual competencies on a 1-5 scale. This block represents 25/30 of the competency portion.',
  'Discipline score': 'Manual discipline level on a 1-5 scale. This represents 5/30 of the competency portion.',
  'Manual competencies': 'Manager-entered competency levels. Core and functional competencies are grouped into the 25/30 competency block, while Discipline is scored separately as the remaining 5/30.',
}

export function HelpLabel({ label, text }) {
  const helpText = text || HELP_TEXT[label]
  if (!helpText) return <span>{label}</span>
  return (
    <Tooltip
      title={helpText}
      arrow
      placement="top"
      slotProps={{
        tooltip: {
          sx: {
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            fontSize: 12,
            maxWidth: 280,
            boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
          },
        },
        arrow: {
          sx: {
            color: 'var(--tooltip-bg)',
            '&:before': {
              border: '0.5px solid rgba(255,255,255,0.12)',
            },
          },
        },
      }}
    >
      <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3, cursor: 'help' }}>
        {label}
      </span>
    </Tooltip>
  )
}

export function Card({ children, style }) {
  return <div style={{ ...s.card, ...style }}>{children}</div>
}

export function MetricCard({ label, value, sub, color, actionIcon, onAction, actionTitle }) {
  return (
    <div style={s.metricCard}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <HelpLabel label={label} />
        {actionIcon && onAction && (
          <button
            onClick={onAction}
            title={actionTitle}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '0.5px solid var(--border)',
              background: 'var(--bg2)',
              color: 'var(--text2)',
              cursor: 'pointer',
              fontSize: 10,
              lineHeight: '16px',
              padding: 0,
            }}
          >
            {actionIcon}
          </button>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: color || 'var(--text)', fontFamily: 'var(--mono)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function ScoreBadge({ score }) {
  if (!score) return <span style={{ color: 'var(--text3)' }}>—</span>
  const s = parseFloat(score)
  const cfg = s >= 4.5 ? { bg: '#0d2b1a', color: '#3ecf8e', label: 'Excellent' }
    : s >= 3.5 ? { bg: '#0d1f3a', color: '#4f7cff', label: 'Good' }
    : s >= 2.5 ? { bg: '#2b1f0a', color: '#f5a623', label: 'Fair' }
    : { bg: '#2b0f0f', color: '#f0524f', label: 'Poor' }
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, fontFamily: 'var(--mono)' }}>
      {score}/5
    </span>
  )
}

export function ProgressBar({ pct, height = 4 }) {
  if (pct === null || pct === undefined) return null
  const color = pct >= 90 ? '#3ecf8e' : pct >= 75 ? '#4f7cff' : pct >= 60 ? '#f5a623' : '#f0524f'
  return (
    <div style={{ background: 'var(--border)', borderRadius: 2, height, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

function scoreColor(score) {
  const value = parseFloat(score)
  if (Number.isNaN(value)) return 'var(--text2)'
  if (value >= 5) return '#3ecf8e'
  if (value >= 4) return '#4f7cff'
  if (value >= 3) return '#f5a623'
  return '#f0524f'
}

export function KpiRow({ label, pct, score, weight, displayValue, barPct }) {
  if ((pct === null || pct === undefined) && (displayValue === null || displayValue === undefined) && (score === null || score === undefined)) return null
  const resolvedBarPct = barPct ?? pct
  const valueText = displayValue ?? (pct !== null && pct !== undefined ? `${pct}%` : '')
  const color = score !== null && score !== undefined ? scoreColor(score) : (pct >= 90 ? '#3ecf8e' : pct >= 75 ? '#4f7cff' : pct >= 60 ? '#f5a623' : '#f0524f')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '0.5px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}><HelpLabel label={label} /></span>
      {weight && <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{weight}</span>}
      <div style={{ width: 70 }}>{resolvedBarPct !== null && resolvedBarPct !== undefined ? <ProgressBar pct={resolvedBarPct} /> : null}</div>
      <span style={{ fontSize: 12, fontWeight: 500, color, fontFamily: 'var(--mono)', minWidth: 48, textAlign: 'right' }}>{valueText}</span>
      <ScoreBadge score={score} />
    </div>
  )
}

export function Avatar({ name, index = 0 }) {
  const COLORS = ['#4f7cff','#3ecf8e','#f5a623','#f0524f','#a855f7','#06b6d4','#ec4899']
  const BG = ['#0d1f3a','#0d2b1a','#2b1f0a','#2b0f0f','#1e0f3a','#0a2b2b','#2b0f1f']
  const i = index % COLORS.length
  const initials = (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%',
      background: BG[i], color: COLORS[i],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 500, flexShrink: 0,
    }}>{initials}</div>
  )
}

export function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  )
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text3)', fontSize: 13 }}>
      Loading…
    </div>
  )
}

export function ErrorBox({ message }) {
  return (
    <div style={{ background: '#2b0f0f', border: '0.5px solid #f0524f44', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: '#f0524f', marginBottom: 12 }}>
      {message}
    </div>
  )
}

function taskLink(task) {
  return task.url || `https://app.clickup.com/t/${task.id}`
}

function formatTaskDate(task) {
  const ts = parseInt(task.date_updated || task.date_done || task.date_created) || null
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function TaskListModal({ open, title, subtitle, tasks = [], onClose }) {
  if (!open) return null

  const sortedTasks = [...tasks].sort((a, b) => {
    const aTs = parseInt(a.date_updated || a.date_done || a.date_created) || 0
    const bTs = parseInt(b.date_updated || b.date_done || b.date_created) || 0
    return bTs - aTs
  })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(920px, 100%)',
          maxHeight: '80vh',
          overflow: 'hidden',
          background: 'var(--bg2)',
          border: '0.5px solid var(--border2)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between', padding: '16px 18px', borderBottom: '0.5px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{title}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              {subtitle || `${sortedTasks.length} tasks`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: '0.5px solid var(--border)',
              background: 'var(--bg3)',
              color: 'var(--text2)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
        <div style={{ overflow: 'auto', padding: '8px 18px 16px' }}>
          {!sortedTasks.length && (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '12px 0' }}>No tasks matched this item.</div>
          )}
          {sortedTasks.map(task => (
            <a
              key={task.id}
              href={taskLink(task)}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'block',
                padding: '10px 0',
                borderBottom: '0.5px solid var(--border)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{task.name || `Task ${task.id}`}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                    {task.list?.name || 'Unknown list'} · {task.status?.status || 'Unknown status'} · {task.id}
                  </div>
                  {task.metaLine ? (
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                      {task.metaLine}
                    </div>
                  ) : null}
                </div>
                <div style={{ flexShrink: 0, fontSize: 11, color: 'var(--accent)' }}>
                  {formatTaskDate(task) || 'Open'}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export function StatRow({ label, value, mono, helpText, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '0.5px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text2)' }}><HelpLabel label={label} text={helpText} /></span>
      <span style={{ fontSize: 12, fontWeight: 500, color: onClick ? 'var(--accent)' : 'var(--text)', fontFamily: mono ? 'var(--mono)' : undefined }}>{value ?? '—'}</span>
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList, LineChart, Line, CartesianGrid,
} from 'recharts'
import { Card, MetricCard, SectionTitle, StatRow, ProgressBar, Avatar } from './components.jsx'
import { calcSprintStats, msToHours, getWorkTypeHelp } from './kpi.js'

const tooltipStyle = {
  background: 'var(--bg3)', border: '0.5px solid var(--border2)',
  borderRadius: 6, fontSize: 12, color: 'var(--text)',
}

function formatDateTime(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const PIPELINE_STAGES = [
  { key: 'awaitingReview',        label: 'Awaiting review' },
  { key: 'inReview',              label: 'In review' },
  { key: 'awaitingTesting',       label: 'Awaiting testing' },
  { key: 'inTesting',             label: 'In testing' },
  { key: 'awaitingAcceptance',    label: 'Awaiting acceptance' },
  { key: 'awaitingOpsValidation', label: 'Ops validation' },
  { key: 'awaitingQcValidation',  label: 'QC validation' },
]

function PipelineBar({ pipeline }) {
  const data = PIPELINE_STAGES.map(s => ({ name: s.label, value: pipeline[s.key] || 0 })).filter(d => d.value > 0)
  if (!data.length) return <p style={{ fontSize: 12, color: 'var(--text3)', padding: '1rem 0' }}>No tasks waiting in pipeline stages.</p>
  return (
    <div style={{ height: Math.max(120, data.length * 36 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4 }}>
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={130} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="#f5a623" radius={[0, 3, 3, 0]}>
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'var(--mono)' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SprintDashboard({ tasks, bugTasks, sprintName, sourceKind, cycleTimeMap = {}, cycleMetaMap = {}, cycleTimeNote = '' }) {
  const [showCycleDetails, setShowCycleDetails] = useState(false)
  const stats = useMemo(() => calcSprintStats(tasks, bugTasks, cycleTimeMap, cycleMetaMap), [tasks, bugTasks, cycleTimeMap, cycleMetaMap])
  const measuredCount = Object.keys(cycleTimeMap).length
  const isSingleSprintSource = sourceKind === 'sprint'
  const metricGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }

  const groupPieData = [
    { name: 'Done', value: stats.doneTasks, color: '#3ecf8e' },
    { name: 'Active', value: stats.activeTasks, color: '#4f7cff' },
    { name: 'Not started', value: stats.notStarted, color: '#555560' },
  ].filter(d => d.value > 0)

  const priorityData = Object.entries(stats.byPriority)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1), value: v,
      fill: k === 'urgent' ? '#f0524f' : k === 'high' ? '#f5a623' : k === 'normal' ? '#4f7cff' : '#555560',
    }))
  const workTypeData = stats.workTypeData.map(item => ({ ...item, fill: item.color }))

  const assigneeData = stats.assigneeBreakdown.map(a => ({
    name: (a.name || '').split(' ')[0],
    estimated: msToHours(a.est),
    tracked: msToHours(a.tracked),
    done: a.done,
    total: a.tasks.length,
  }))

  const cycleRows = tasks
    .filter(t => !t.parent)
    .map(t => {
      const meta = cycleMetaMap[t.id] || {}
      const timing = cycleTimeMap[t.id] || {}
      return {
        id: t.id,
        name: t.name,
        devStart: meta.devDetail?.start || null,
        devEnd: meta.devDetail?.end || null,
        devDays: timing.devCycleMs ? Math.round((timing.devCycleMs / 86400000) * 10) / 10 : null,
        fullStart: meta.fullDetail?.start || null,
        fullEnd: meta.fullDetail?.end || null,
        fullDays: timing.fullCycleMs ? Math.round((timing.fullCycleMs / 86400000) * 10) / 10 : null,
      }
    })
    .filter(r => r.devDays !== null || r.fullDays !== null)
    .sort((a, b) => (b.devDays || 0) - (a.devDays || 0))

  const deliveryMetrics = [
    <MetricCard key="completion" label="Completion" value={`${stats.historicalCompletionPct}%`} sub={`${stats.doneTasks}/${stats.totalTasks} tasks done`} color={stats.historicalCompletionPct >= 80 ? '#3ecf8e' : stats.historicalCompletionPct >= 60 ? '#f5a623' : '#f0524f'} />,
    <MetricCard key="throughput" label="Throughput" value={stats.throughputPerWeek !== null ? `${stats.throughputPerWeek}/wk` : '—'} sub={stats.throughputWindowDays ? `${stats.doneTasks} done across ${stats.throughputWindowDays} days` : 'completed tasks per week'} />,
    <MetricCard key="lead-time" label="Lead time" value={stats.avgLeadTimeDays !== null ? `${stats.avgLeadTimeDays}d` : '—'} sub="created → done" />,
    <MetricCard key="estimated" label="Estimated" value={`${stats.estimatedHours}h`} sub="planned effort" />,
    <MetricCard key="tracked" label="Tracked" value={`${stats.trackedHours}h`} sub="hours logged" color="#4f7cff" />,
    <MetricCard key="estimate-accuracy" label="Estimate accuracy" value={stats.estimateAccuracyPct !== null ? `${stats.estimateAccuracyPct}%` : '—'} sub="tracked / estimated" color={stats.estimateAccuracyPct !== null ? (stats.estimateAccuracyPct >= 90 ? '#3ecf8e' : '#f5a623') : undefined} />,
    <MetricCard key="on-time" label="On-time delivery" value={stats.onTimePct !== null ? `${stats.onTimePct}%` : '—'} sub={stats.dueDatedDoneTasks > 0 ? `${stats.onTimeDoneTasks}/${stats.dueDatedDoneTasks} due-dated tasks` : 'done vs due date'} color={stats.onTimePct !== null ? (stats.onTimePct >= 85 ? '#3ecf8e' : '#f5a623') : undefined} />,
  ]

  const qualityMetrics = [
    <MetricCard key="bug-fix" label="Bug fix rate" value={stats.bugFixPct !== null ? `${stats.bugFixPct}%` : '—'} sub={`${stats.doneBugs}/${stats.totalBugs} bugs`} color={stats.bugFixPct !== null ? (stats.bugFixPct >= 90 ? '#3ecf8e' : '#f5a623') : undefined} />,
    <MetricCard key="reopen" label="Reopen rate" value={stats.reopenRatePct !== null ? `${stats.reopenRatePct}%` : '—'} sub={stats.qualityMeasuredTasks ? `${stats.reopenedTasks}/${stats.qualityMeasuredTasks} measured parent tasks` : 'activity-based quality signal'} color={stats.reopenRatePct !== null ? (stats.reopenRatePct <= 10 ? '#3ecf8e' : '#f5a623') : undefined} />,
    <MetricCard key="testing-bounce" label="Testing bounce-back" value={stats.testingBounceBackPct !== null ? `${stats.testingBounceBackPct}%` : '—'} sub={stats.qualityMeasuredTasks ? `${stats.testingBounceBackTasks}/${stats.qualityMeasuredTasks} measured parent tasks` : 'returned from testing to dev'} color={stats.testingBounceBackPct !== null ? (stats.testingBounceBackPct <= 10 ? '#3ecf8e' : '#f5a623') : undefined} />,
    <MetricCard key="review-bounce" label="Review bounce-back" value={stats.reviewBounceBackPct !== null ? `${stats.reviewBounceBackPct}%` : '—'} sub={stats.qualityMeasuredTasks ? `${stats.reviewBounceBackTasks}/${stats.qualityMeasuredTasks} measured parent tasks` : 'returned from review to dev'} color={stats.reviewBounceBackPct !== null ? (stats.reviewBounceBackPct <= 10 ? '#3ecf8e' : '#f5a623') : undefined} />,
  ]

  const flowMetrics = [
    <MetricCard key="aging" label="Aging WIP" value={stats.avgAgingDays !== null ? `${stats.avgAgingDays}d` : '—'} sub={`${stats.activeTasks} active tasks`} color={stats.avgAgingDays !== null && stats.avgAgingDays > 7 ? '#f5a623' : undefined} />,
    <MetricCard key="dev-cycle" label="Dev cycle time" value={stats.avgCycleTimeDays !== null ? `${stats.avgCycleTimeDays}d` : '—'} sub="in-progress → awaiting testing or first later status" />,
    <MetricCard key="full-cycle" label="Full cycle time" value={stats.avgFullCycleTimeDays !== null ? `${stats.avgFullCycleTimeDays}d` : '—'} sub="in-progress → first of waiting for uat / completed / production" />,
    <MetricCard key="canceled" label="Canceled" value={stats.canceled} sub="rejected / canceled" color={stats.canceled > 0 ? '#f0524f' : undefined} />,
    <MetricCard key="no-in-progress" label="No in-progress" value={stats.noInProgressHistory} sub="parent tasks missing in-progress history" color={stats.noInProgressHistory > 0 ? '#f5a623' : undefined} />,
    <MetricCard key="overdue" label="Overdue" value={stats.overdue} sub="past due date" color={stats.overdue > 0 ? '#f0524f' : undefined} />,
    <MetricCard key="no-estimate" label="No estimate" value={stats.noEstimate} sub="missing estimate" color={stats.noEstimate > 0 ? '#f5a623' : undefined} />,
  ]

  const engineeringHealthMetrics = [
    <MetricCard key="coverage" label="Code coverage" value="—" sub="requires CI / test-report source" />,
    <MetricCard key="sla" label="API SLA compliance" value="—" sub="requires monitoring / APM source" />,
    <MetricCard key="review-score" label="Review quality score" value="—" sub="requires PR review or code-quality source" />,
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionTitle>Delivery</SectionTitle>
        <div style={metricGridStyle}>{deliveryMetrics}</div>
      </Card>

      <Card>
        <SectionTitle>Quality</SectionTitle>
        <div style={metricGridStyle}>{qualityMetrics}</div>
      </Card>

      <Card>
        <SectionTitle>Flow</SectionTitle>
        <div style={metricGridStyle}>{flowMetrics}</div>
      </Card>

      <Card>
        <SectionTitle>Engineering Health</SectionTitle>
        <div style={metricGridStyle}>{engineeringHealthMetrics}</div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Card>
          <SectionTitle>Task groups</SectionTitle>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={groupPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={68} innerRadius={36}>
                  {groupPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconSize={8} formatter={(v, e) => `${v} (${e.payload.value})`} wrapperStyle={{ fontSize: 11, color: 'var(--text2)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>By priority</SectionTitle>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} layout="vertical" margin={{ left: 8, right: 28 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={55} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {priorityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'var(--mono)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>Work mix</SectionTitle>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workTypeData} layout="vertical" margin={{ left: 8, right: 28 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {workTypeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'var(--mono)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <SectionTitle>Cycle time
            {Object.keys(cycleTimeMap).length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 9, background: '#0d2b1a', color: '#3ecf8e', padding: '1px 6px', borderRadius: 8, fontWeight: 400 }}>
                activity-based · {Object.keys(cycleTimeMap).length} tasks
              </span>
            )}
            {cycleRows.length > 0 && (
              <button
                onClick={() => setShowCycleDetails(true)}
                style={{
                  marginLeft: 8,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: '0.5px solid var(--border)',
                  background: 'var(--bg3)',
                  color: 'var(--text2)',
                  cursor: 'pointer',
                  fontSize: 11,
                  lineHeight: '18px',
                  padding: 0,
                }}
                title="Open cycle time details"
              >
                i
              </button>
            )}
          </SectionTitle>
          <div style={{ marginTop: 8 }}>
            <StatRow label="Average" value={stats.avgCycleTimeDays !== null ? `${stats.avgCycleTimeDays} days` : '—'} mono />
            <StatRow label="Fastest" value={stats.minCycleTimeDays !== null ? `${stats.minCycleTimeDays} days` : '—'} mono />
            <StatRow label="Slowest" value={stats.maxCycleTimeDays !== null ? `${stats.maxCycleTimeDays} days` : '—'} mono />
            <StatRow label="Parent tasks measured" value={measuredCount} mono />
            <StatRow label="Measurement" value="dev: in-progress → awaiting testing or first later status" mono />
            <StatRow label="Full cycle end" value="first of waiting for uat / completed / production" mono />
            <StatRow label="Data source" value={measuredCount > 0 ? `Activity logs ✓ (${measuredCount} tasks)` : (cycleTimeNote || 'Unavailable')} mono />
            <StatRow label="Average lead time" value={stats.avgLeadTimeDays !== null ? `${stats.avgLeadTimeDays} days` : '—'} mono />
            <StatRow label="On-time delivery" value={stats.onTimePct !== null ? `${stats.onTimePct}%` : '—'} mono />
            <StatRow label="Review bounce-back" value={stats.reviewBounceBackPct !== null ? `${stats.reviewBounceBackPct}%` : '—'} mono />
          </div>
        </Card>

        <Card>
          <SectionTitle>Scope profile</SectionTitle>
          <div style={{ marginTop: 8 }}>
            <StatRow label="Features" value={stats.byWorkType.feature || 0} mono helpText={getWorkTypeHelp('Features', stats.byWorkTypeByList)} />
            <StatRow label="Classified bugs" value={stats.classifiedBugCount} mono helpText={getWorkTypeHelp('Bugs', stats.byWorkTypeByList)} />
            <StatRow label="Bugs list tasks" value={stats.bugListTaskCount} mono helpText="Actual tasks loaded from the separate Bugs list in ClickUp, not inferred from main tasks." />
            <StatRow label="Support" value={stats.byWorkType.support || 0} mono helpText={getWorkTypeHelp('Support', stats.byWorkTypeByList)} />
            <StatRow label="Refactor" value={stats.byWorkType.refactor || 0} mono helpText={getWorkTypeHelp('Refactor', stats.byWorkTypeByList)} />
            <StatRow label="Chore" value={stats.byWorkType.chore || 0} mono helpText={getWorkTypeHelp('Chore', stats.byWorkTypeByList)} />
            <StatRow label="Other" value={stats.byWorkType.other || 0} mono helpText={getWorkTypeHelp('Other', stats.byWorkTypeByList)} />
            <StatRow label="Reopened tasks" value={stats.reopenedTasks || 0} mono />
            <StatRow label="Testing bounce-back" value={stats.testingBounceBackTasks || 0} mono />
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>Estimate / tracked split</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 8 }}>
          <StatRow label="All estimated" value={`${stats.estimatedHours}h`} mono />
          <StatRow label="All tracked" value={`${stats.trackedHours}h`} mono />
          <StatRow label="Parent estimated" value={`${stats.parentEstimatedHours}h`} mono />
          <StatRow label="Parent tracked" value={`${stats.parentTrackedHours}h`} mono />
          <StatRow label="Subtask estimated" value={`${stats.subtaskEstimatedHours}h`} mono />
          <StatRow label="Subtask tracked" value={`${stats.subtaskTrackedHours}h`} mono />
          <StatRow label="Parent tasks" value={stats.parentTaskCount} mono />
          <StatRow label="Subtasks" value={stats.subtaskCount} mono />
        </div>
      </Card>

      {isSingleSprintSource && (
        <Card>
          <SectionTitle>Sprint-only metrics</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 8 }}>
            <StatRow label="Committed parent tasks" value={stats.committedParentTasks} mono />
            <StatRow label="Scope completion" value={`${stats.sprintCompletionPct}%`} mono />
            <StatRow label="Story points done" value={stats.totalPoints > 0 ? `${stats.donePoints}/${stats.totalPoints}` : '—'} mono />
            <StatRow label="Velocity" value={stats.velocityPct !== null ? `${stats.velocityPct}%` : '—'} mono />
          </div>
        </Card>
      )}

      {stats.statusChartData.length > 0 && (
        <Card>
          <SectionTitle>Tasks per status</SectionTitle>
          <div style={{ height: Math.max(160, stats.statusChartData.length * 30 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.statusChartData} layout="vertical" margin={{ left: 8, right: 40, top: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={155} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {stats.statusChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'var(--mono)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {stats.weeklyTrendData.length > 0 && (
        <Card>
          <SectionTitle>Weekly trends</SectionTitle>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.weeklyTrendData} margin={{ left: 8, right: 12, top: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="count" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    if (name === 'Reopen rate' || name === 'Testing bounce-back') return [`${value}%`, name]
                    return [value, name]
                  }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text2)' }} />
                <Line yAxisId="count" type="monotone" dataKey="throughput" name="Throughput" stroke="#4f7cff" strokeWidth={2} dot={{ r: 2 }} />
                <Line yAxisId="count" type="monotone" dataKey="bugFixes" name="Bug fixes" stroke="#f0524f" strokeWidth={2} dot={{ r: 2 }} />
                <Line yAxisId="pct" type="monotone" dataKey="reopenRatePct" name="Reopen rate" stroke="#f5a623" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line yAxisId="pct" type="monotone" dataKey="testingBounceBackPct" name="Testing bounce-back" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Pipeline bottlenecks — tasks waiting for handoff</SectionTitle>
        <PipelineBar pipeline={stats.pipeline} />
      </Card>

      {assigneeData.length > 0 && (
        <Card>
          <SectionTitle>Estimated vs tracked — per developer</SectionTitle>
          <div style={{ height: Math.max(180, assigneeData.length * 44 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assigneeData} layout="vertical" margin={{ left: 8, right: 24, top: 8 }}>
                <XAxis type="number" unit="h" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v}h`, n]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text2)' }} />
                <Bar dataKey="estimated" name="Estimated" fill="#333355" radius={[0, 3, 3, 0]} />
                <Bar dataKey="tracked" name="Tracked" fill="#4f7cff" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {stats.assigneeBreakdown.length > 0 && (
        <Card>
          <SectionTitle>Developer breakdown</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Developer', 'Done', 'Active', 'Not started', 'Estimated', 'Tracked', 'Completion', 'Est. accuracy'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 500, borderBottom: '0.5px solid rgba(255,255,255,0.12)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.assigneeBreakdown.map((a, i) => {
                const pct = a.tasks.length > 0 ? Math.round((a.done / a.tasks.length) * 100) : 0
                return (
                  <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={a.name} index={i} />
                        <span style={{ color: 'var(--text)' }}>{a.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: '#3ecf8e' }}>{a.done}</td>
                    <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: '#4f7cff' }}>{a.active || 0}</td>
                    <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{a.notStarted || 0}</td>
                    <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{msToHours(a.est)}h</td>
                    <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: '#4f7cff' }}>{msToHours(a.tracked)}h</td>
                    <td style={{ padding: '8px 8px', minWidth: 110 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}><ProgressBar pct={pct} /></div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', minWidth: 30 }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                      {a.est > 0 ? `${Math.min(100, Math.round(a.tracked / a.est * 100))}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {showCycleDetails && (
        <div
          onClick={() => setShowCycleDetails(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(1200px, 100%)',
              maxHeight: '80vh',
              overflow: 'hidden',
              background: 'var(--bg2)',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '1rem 1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Cycle time details
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <button
                  onClick={() => setShowCycleDetails(false)}
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
            </div>
            <div style={{ overflow: 'auto', maxHeight: 'calc(80vh - 72px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Task', 'Dev start', 'Dev end', 'Dev days', 'Full start', 'Full end', 'Full days'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--text3)', fontWeight: 500, borderBottom: '0.5px solid rgba(255,255,255,0.12)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cycleRows.map(row => (
                    <tr key={row.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px', minWidth: 260 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{row.id}</div>
                          {row.devDays !== null && (
                            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: '#3ecf8e', background: '#0d2b1a', padding: '1px 6px', borderRadius: 10 }}>
                              {row.devDays}d
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--text3)', fontSize: 11 }}>{row.name}</div>
                      </td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{formatDateTime(row.devStart?.ms)}</td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {row.devEnd ? `${row.devEnd.status} · ${formatDateTime(row.devEnd.ms)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: '#3ecf8e' }}>{row.devDays !== null ? row.devDays : '—'}</td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{formatDateTime(row.fullStart?.ms)}</td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {row.fullEnd ? `${row.fullEnd.status} · ${formatDateTime(row.fullEnd.ms)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', color: '#4f7cff' }}>{row.fullDays !== null ? row.fullDays : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

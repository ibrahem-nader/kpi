import React, { useMemo, useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { Card, SectionTitle, KpiRow, ScoreBadge, Avatar, StatRow, HelpLabel, TaskListModal } from './components.jsx'
import { calcMemberKPIs, classifyTaskType, getWorkTypeHelp } from './kpi.js'

const ACCENT = '#4f7cff'
const LEVEL_COLORS = {
  Strong: { color: '#3ecf8e', bg: '#0d2b1a' },
  Solid: { color: '#4f7cff', bg: '#0d1f3a' },
  Developing: { color: '#f5a623', bg: '#2b1f0a' },
  'Needs support': { color: '#f0524f', bg: '#2b0f0f' },
  'Insufficient data': { color: '#8a8a95', bg: '#1e1e22' },
}

function CompetencyBadge({ level }) {
  const cfg = LEVEL_COLORS[level] || LEVEL_COLORS['Insufficient data']
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20 }}>
      {level}
    </span>
  )
}

function CompetencyCard({ title, competency }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}><HelpLabel label={title} /></div>
        <CompetencyBadge level={competency.level} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>{competency.summary}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {competency.evidence.map(item => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
            <span style={{ color: 'var(--text2)' }}><HelpLabel label={item.label} /></span>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberCard({ member, index, tasks, bugTasks, onSelect, selected, cycleTimeMap = {}, cycleMetaMap = {} }) {
  const kpi = useMemo(() => calcMemberKPIs(member.id, tasks, bugTasks, cycleTimeMap, cycleMetaMap), [member, tasks, bugTasks, cycleTimeMap, cycleMetaMap])

  return (
    <div
      onClick={() => onSelect(selected ? null : member)}
      style={{
        background: selected ? 'var(--bg3)' : 'var(--bg2)',
        border: `0.5px solid ${selected ? ACCENT : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '1rem 1.25rem',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar name={member.username || member.email} index={index} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{member.username || member.email}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {kpi.totalTasks} tasks
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}><HelpLabel label="Weighted score" /></div>
          <ScoreBadge score={kpi.weightedScore} />
        </div>
      </div>

      <KpiRow label="Completion rate" pct={kpi.sprintCompletionPct} score={kpi.completionScore} weight="20%" />
      <KpiRow label="Estimate accuracy" pct={kpi.estimateAccuracyPct} score={kpi.estimateAccuracyScore} weight="10%" />
      <KpiRow label="On-time delivery" pct={kpi.onTimePct} score={kpi.onTimeScore} weight="10%" />
      <KpiRow label="Bug fix rate" pct={kpi.bugPct} score={kpi.bugScore} weight="10%" />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        <CompetencyBadge level={kpi.competencies.execution.level} />
        <CompetencyBadge level={kpi.competencies.planning.level} />
        <CompetencyBadge level={kpi.competencies.quality.level} />
        <CompetencyBadge level={kpi.competencies.flow.level} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{kpi.estimatedHours}h est · {kpi.trackedHours}h tracked</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          {kpi.avgCycleTimeDays !== null ? `dev ${kpi.avgCycleTimeDays}d` : ''}{kpi.avgFullCycleTimeDays !== null ? ` · full ${kpi.avgFullCycleTimeDays}d` : ''}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text3)' }}>
        parent {kpi.parentEstimatedHours}h/{kpi.parentTrackedHours}h · subtasks {kpi.subtaskEstimatedHours}h/{kpi.subtaskTrackedHours}h
      </div>
    </div>
  )
}

function MemberDetail({ member, index, tasks, bugTasks, cycleTimeMap = {}, cycleMetaMap = {} }) {
  const [taskListState, setTaskListState] = useState(null)
  const kpi = useMemo(() => calcMemberKPIs(member.id, tasks, bugTasks, cycleTimeMap, cycleMetaMap), [member, tasks, bugTasks, cycleTimeMap, cycleMetaMap])

  const radarData = [
    { subject: 'Completion', value: kpi.completionScore || 0, fullMark: 5 },
    { subject: 'Est. accuracy', value: kpi.estimateAccuracyScore || 0, fullMark: 5 },
    { subject: 'On-time', value: kpi.onTimeScore || 0, fullMark: 5 },
    { subject: 'Bug fix', value: kpi.bugScore || 0, fullMark: 5 },
  ]

  const myTasks = tasks.filter(t => t.assignees?.some(a => a.id == member.id))
  const myBugs = bugTasks.filter(t => t.assignees?.some(a => a.id == member.id))
  const byStatus = {}
  myTasks.forEach(t => {
    const s = t.status?.status || 'unknown'
    byStatus[s] = (byStatus[s] || 0) + 1
  })
  const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }))
  const workTypeData = kpi.workTypeData.map(item => ({ ...item, fill: item.color }))
  const openTaskList = (title, items, subtitle) => setTaskListState({ title, tasks: items, subtitle })
  const tasksByType = {
    feature: myTasks.filter(task => classifyTaskType(task) === 'feature'),
    bug: myTasks.filter(task => classifyTaskType(task) === 'bug'),
    support: myTasks.filter(task => classifyTaskType(task) === 'support'),
    refactor: myTasks.filter(task => classifyTaskType(task) === 'refactor'),
    chore: myTasks.filter(task => classifyTaskType(task) === 'chore'),
    other: myTasks.filter(task => classifyTaskType(task) === 'other'),
  }

  const tooltipStyle = { background: 'var(--bg3)', border: '0.5px solid var(--border2)', borderRadius: 6, fontSize: 12, color: 'var(--text)' }

  return (
    <>
    <Card style={{ borderColor: ACCENT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Avatar name={member.username || member.email} index={index} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{member.username || member.email}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{kpi.totalTasks} assigned tasks</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}><HelpLabel label="Weighted score" /></div>
          <ScoreBadge score={kpi.weightedScore} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <SectionTitle>KPI scores</SectionTitle>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border2)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--text2)' }} />
                <Radar dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.15} dot={{ r: 3, fill: ACCENT }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <SectionTitle>Task status breakdown</SectionTitle>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill={ACCENT} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <div>
          <SectionTitle>Work mix (main tasks)</SectionTitle>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workTypeData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {workTypeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <SectionTitle>Work profile</SectionTitle>
          <StatRow label="Features" value={kpi.byWorkType.feature || 0} mono helpText={getWorkTypeHelp('Features', kpi.byWorkTypeByList)} onClick={() => openTaskList(`${member.username || member.email} · Features`, tasksByType.feature, 'Main tasks classified as feature work.')} />
          <StatRow label="Classified bugs" value={kpi.classifiedBugCount} mono helpText={getWorkTypeHelp('Bugs', kpi.byWorkTypeByList)} onClick={() => openTaskList(`${member.username || member.email} · Classified bugs`, tasksByType.bug, 'Main tasks inferred as bugs from title, tags, list, or metadata.')} />
          <StatRow label="Bugs list assigned" value={kpi.bugListAssignedCount} mono helpText="Actual assigned tasks loaded from the separate Bugs list in ClickUp." onClick={() => openTaskList(`${member.username || member.email} · Bugs list assigned`, myBugs, 'Tasks assigned from the dedicated Bugs list.')} />
          <StatRow label="Support" value={kpi.byWorkType.support || 0} mono helpText={getWorkTypeHelp('Support', kpi.byWorkTypeByList)} onClick={() => openTaskList(`${member.username || member.email} · Support`, tasksByType.support, 'Main tasks classified as support work.')} />
          <StatRow label="Refactor" value={kpi.byWorkType.refactor || 0} mono helpText={getWorkTypeHelp('Refactor', kpi.byWorkTypeByList)} onClick={() => openTaskList(`${member.username || member.email} · Refactor`, tasksByType.refactor, 'Main tasks classified as refactor or technical debt work.')} />
          <StatRow label="Chores" value={kpi.byWorkType.chore || 0} mono helpText={getWorkTypeHelp('Chores', kpi.byWorkTypeByList)} onClick={() => openTaskList(`${member.username || member.email} · Chores`, tasksByType.chore, 'Main tasks classified as chores or maintenance work.')} />
          <StatRow label="Other" value={kpi.byWorkType.other || 0} mono helpText={getWorkTypeHelp('Other', kpi.byWorkTypeByList)} onClick={() => openTaskList(`${member.username || member.email} · Other`, tasksByType.other, 'Main tasks that did not match the current classification rules.')} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <SectionTitle>Competency Evidence · H1 2026</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <CompetencyCard title="Execution" competency={kpi.competencies.execution} />
          <CompetencyCard title="Planning" competency={kpi.competencies.planning} />
          <CompetencyCard title="Quality Ownership" competency={kpi.competencies.quality} />
          <CompetencyCard title="Flow Discipline" competency={kpi.competencies.flow} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <div>
          <SectionTitle>Time</SectionTitle>
          <StatRow label="Estimated" value={`${kpi.estimatedHours}h`} mono />
          <StatRow label="Tracked" value={`${kpi.trackedHours}h`} mono />
          <StatRow label="Parent est / tracked" value={`${kpi.parentEstimatedHours}h / ${kpi.parentTrackedHours}h`} mono />
          <StatRow label="Subtask est / tracked" value={`${kpi.subtaskEstimatedHours}h / ${kpi.subtaskTrackedHours}h`} mono />
          <StatRow label="Estimate accuracy" value={kpi.estimateAccuracyPct !== null ? `${kpi.estimateAccuracyPct}%` : '—'} mono />
          <StatRow label="Avg cycle time" value={kpi.avgCycleTimeDays !== null ? `${kpi.avgCycleTimeDays} days` : '—'} mono />
          <StatRow label="Avg lead time" value={kpi.avgLeadTimeDays !== null ? `${kpi.avgLeadTimeDays} days` : '—'} mono />
          <StatRow label="Aging WIP" value={kpi.avgAgingDays !== null ? `${kpi.avgAgingDays} days` : '—'} mono />
        </div>
        <div>
          <SectionTitle>Delivery / Quality</SectionTitle>
          <StatRow label="Assigned" value={kpi.totalBugs} mono />
          <StatRow label="Fixed" value={kpi.doneBugs} mono />
          <StatRow label="Fix rate" value={kpi.bugPct !== null ? `${kpi.bugPct}%` : '—'} mono />
          <StatRow label="Tasks total" value={`${kpi.doneTasks}/${kpi.totalTasks} done`} mono />
          <StatRow label="On-time delivery" value={kpi.onTimePct !== null ? `${kpi.onTimePct}%` : '—'} mono />
          <StatRow label="Blocked tasks" value={kpi.blockedTasks} mono />
          <StatRow label="Reopen rate" value={kpi.reopenRatePct !== null ? `${kpi.reopenRatePct}%` : '—'} mono />
          <StatRow label="Testing bounce-back" value={kpi.testingBounceBackPct !== null ? `${kpi.testingBounceBackPct}%` : '—'} mono />
          <StatRow label="Parent / subtasks" value={`${kpi.parentTaskCount} / ${kpi.subtaskCount}`} mono />
        </div>
      </div>
    </Card>
    <TaskListModal
      open={!!taskListState}
      title={taskListState?.title}
      subtitle={taskListState?.subtitle}
      tasks={taskListState?.tasks || []}
      onClose={() => setTaskListState(null)}
    />
    </>
  )
}

export function MemberDashboard({ members, tasks, bugTasks, assigneeFilter, cycleTimeMap = {}, cycleMetaMap = {} }) {
  const [selectedMember, setSelectedMember] = React.useState(null)

  const filtered = members
    .filter(m => assigneeFilter === 'all' || m.id == assigneeFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {selectedMember && (
        <MemberDetail
          member={selectedMember}
          index={members.indexOf(selectedMember)}
          tasks={tasks}
          bugTasks={bugTasks}
          cycleTimeMap={cycleTimeMap}
          cycleMetaMap={cycleMetaMap}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map((m, i) => (
          <MemberCard
            key={m.id}
            member={m}
            index={i}
            tasks={tasks}
            bugTasks={bugTasks}
            onSelect={setSelectedMember}
            selected={selectedMember?.id === m.id}
            cycleTimeMap={cycleTimeMap}
            cycleMetaMap={cycleMetaMap}
          />
        ))}
      </div>
    </div>
  )
}

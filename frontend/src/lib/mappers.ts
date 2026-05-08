import type { DbScenario, HealDetails, JsonObject, JsonValue, ProjectItem, Scenario, ScenarioStep, StepExecutionLog, StructuralTarget, TestRun, TestSuite } from '../types/core';

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const toRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toJsonValue = (value: unknown): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)])) as JsonObject;
  }
  return null;
};

const toJsonObject = (value: unknown): JsonObject => {
  const json = toJsonValue(value);
  return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
};

const toHealDetails = (value: unknown): HealDetails | null => {
  const json = toJsonObject(value);
  return Object.keys(json).length > 0 ? (json as HealDetails) : null;
};

const toStructuralTarget = (value: unknown): StructuralTarget | undefined => {
  const item = toRecord(value);
  const fallback = toRecord(item.fallback);
  const bounds = Array.isArray(fallback.bounds) && fallback.bounds.length === 4 ? fallback.bounds.map(Number) : null;
  if (!item.className && !item.class_name) return undefined;
  return {
    isDynamic: Boolean(item.isDynamic ?? item.is_dynamic),
    is_dynamic: Boolean(item.is_dynamic ?? item.isDynamic),
    rowIndex: typeof (item.rowIndex ?? item.row_index) === 'number' ? Number(item.rowIndex ?? item.row_index) : null,
    row_index: typeof (item.row_index ?? item.rowIndex) === 'number' ? Number(item.row_index ?? item.rowIndex) : null,
    className: toString(item.className ?? item.class_name),
    class_name: toString(item.class_name ?? item.className),
    textAnchor: typeof (item.textAnchor ?? item.text_anchor) === 'string' ? String(item.textAnchor ?? item.text_anchor) : null,
    text_anchor: typeof (item.text_anchor ?? item.textAnchor) === 'string' ? String(item.text_anchor ?? item.textAnchor) : null,
    resourceId: typeof (item.resourceId ?? item.resource_id) === 'string' ? String(item.resourceId ?? item.resource_id) : undefined,
    resource_id: typeof (item.resource_id ?? item.resourceId) === 'string' ? String(item.resource_id ?? item.resourceId) : undefined,
    text: typeof item.text === 'string' ? item.text : undefined,
    contentDesc: typeof (item.contentDesc ?? item.content_desc) === 'string' ? String(item.contentDesc ?? item.content_desc) : undefined,
    content_desc: typeof (item.content_desc ?? item.contentDesc) === 'string' ? String(item.content_desc ?? item.contentDesc) : undefined,
    fallback: {
      bounds: bounds ? [bounds[0] ?? 0, bounds[1] ?? 0, bounds[2] ?? 0, bounds[3] ?? 0] : [0, 0, 0, 0],
      x: toNumber(fallback.x),
      y: toNumber(fallback.y),
    },
  };
};

export const normalizeProject = (raw: unknown): ProjectItem => {
  const item = toRecord(raw);
  return {
    id: toNumber(item.id),
    name: toString(item.name, 'Untitled Project'),
    packageName: toString(item.packageName ?? item.package_name),
    package_name: toString(item.package_name ?? item.packageName),
    mainActivity: typeof (item.mainActivity ?? item.main_activity) === 'string' ? String(item.mainActivity ?? item.main_activity) : null,
    main_activity: typeof (item.main_activity ?? item.mainActivity) === 'string' ? String(item.main_activity ?? item.mainActivity) : null,
  };
};

export const normalizeStep = (raw: unknown, index: number): ScenarioStep => {
  const item = toRecord(raw);
  return {
    id: toNumber(item.id, Date.now() + index),
    action: toString(item.action, 'tap'),
    x: item.x === undefined ? undefined : toNumber(item.x),
    y: item.y === undefined ? undefined : toNumber(item.y),
    x1: item.x1 === undefined ? undefined : toNumber(item.x1),
    y1: item.y1 === undefined ? undefined : toNumber(item.y1),
    x2: item.x2 === undefined ? undefined : toNumber(item.x2),
    y2: item.y2 === undefined ? undefined : toNumber(item.y2),
    text: typeof item.text === 'string' ? item.text : undefined,
    inputText: typeof (item.inputText ?? item.input_text) === 'string' ? String(item.inputText ?? item.input_text) : undefined,
    duration: item.duration === undefined ? undefined : toNumber(item.duration),
    targetLabel: typeof (item.targetLabel ?? item.target_label) === 'string' ? String(item.targetLabel ?? item.target_label) : undefined,
    target_label: typeof item.target_label === 'string' ? item.target_label : undefined,
    description: toString(item.description, toString(item.action, 'step')),
    label: typeof item.label === 'string' ? item.label : '',
    selector: toJsonObject(item.selector),
    target: item.target === undefined ? undefined : toStructuralTarget(item.target),
  };
};

export const extractSteps = (raw: unknown): ScenarioStep[] => {
  const source = Array.isArray(raw) ? raw : toRecord(raw).steps;
  if (!Array.isArray(source)) return [];
  return source.map((step, index) => normalizeStep(step, index));
};

export const isValidScenarioJson = (raw: unknown) => extractSteps(raw).length > 0;

export const normalizeDbScenario = (raw: unknown): DbScenario => {
  const item = toRecord(raw);
  return {
    id: toNumber(item.id),
    name: toString(item.name ?? item.scriptName ?? item.script_name, 'Untitled Scenario.json'),
    steps: extractSteps(item.steps ?? raw),
    updatedAt: typeof (item.updatedAt ?? item.updated_at) === 'string' ? String(item.updatedAt ?? item.updated_at) : undefined,
    updated_at: typeof (item.updated_at ?? item.updatedAt) === 'string' ? String(item.updated_at ?? item.updatedAt) : undefined,
    createdAt: typeof (item.createdAt ?? item.created_at) === 'string' ? String(item.createdAt ?? item.created_at) : undefined,
    created_at: typeof (item.created_at ?? item.createdAt) === 'string' ? String(item.created_at ?? item.createdAt) : undefined,
  };
};

export const normalizeQueueScenario = (raw: unknown, fallbackName: string): Scenario => {
  const item = toRecord(raw);
  return {
    id: toString(item.id, `scenario_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    dbId: item.dbId === undefined ? undefined : toNumber(item.dbId),
    scriptName: toString(item.scriptName ?? item.script_name ?? item.name, fallbackName),
    steps: extractSteps(item.steps ?? raw),
    updatedAt: typeof (item.updatedAt ?? item.updated_at) === 'string' ? String(item.updatedAt ?? item.updated_at) : new Date().toISOString(),
    expanded: Boolean(item.expanded),
    runStatus: toString(item.runStatus ?? item.run_status, 'idle') as Scenario['runStatus'],
    message: typeof item.message === 'string' ? item.message : undefined,
    traceImage: typeof (item.traceImage ?? item.trace_image) === 'string' ? String(item.traceImage ?? item.trace_image) : null,
    stepLogs: Array.isArray(item.stepLogs ?? item.step_logs)
      ? ((item.stepLogs ?? item.step_logs) as unknown[]).map((log: unknown, index: number) => normalizeStepLog(log, index))
      : undefined,
    runningStepIndex: item.runningStepIndex === undefined ? undefined : toNumber(item.runningStepIndex),
  };
};

export const normalizeStepLog = (raw: unknown, fallbackIndex: number): StepExecutionLog => {
  const item = toRecord(raw);
  return {
    id: item.id === undefined ? undefined : toNumber(item.id),
    index: toNumber(item.index ?? item.stepIndex ?? item.step_index, fallbackIndex),
    stepIndex: item.stepIndex === undefined && item.step_index === undefined ? undefined : toNumber(item.stepIndex ?? item.step_index),
    action: toString(item.action, 'unknown'),
    description: typeof (item.description ?? item.label) === 'string' ? String(item.description ?? item.label) : undefined,
    success: Boolean(item.success),
    message: typeof item.message === 'string' ? item.message : undefined,
    verify: toJsonObject(item.verify),
    traceImage: typeof (item.traceImage ?? item.trace_image) === 'string' ? String(item.traceImage ?? item.trace_image) : null,
    trace_image: typeof (item.trace_image ?? item.traceImage) === 'string' ? String(item.trace_image ?? item.traceImage) : null,
    error: typeof item.error === 'string' ? item.error : null,
    isHealed: Boolean(item.isHealed ?? item.is_healed),
    is_healed: Boolean(item.is_healed ?? item.isHealed),
    healDetails: toHealDetails(item.healDetails ?? item.heal_details),
    heal_details: toHealDetails(item.heal_details ?? item.healDetails),
  };
};

export const normalizeTestRun = (raw: unknown): TestRun => {
  const item = toRecord(raw);
  const steps = Array.isArray(item.steps) ? item.steps.map((step, index) => normalizeStepLog(step, index)) : [];
  return {
    id: toNumber(item.id),
    scenarioName: toString(item.scenarioName ?? item.scenario_name, 'Untitled Scenario'),
    scenario_name: toString(item.scenario_name ?? item.scenarioName, 'Untitled Scenario'),
    projectName: typeof (item.projectName ?? item.project_name) === 'string' ? String(item.projectName ?? item.project_name) : undefined,
    project_name: typeof (item.project_name ?? item.projectName) === 'string' ? String(item.project_name ?? item.projectName) : undefined,
    status: toString(item.status, 'error') as TestRun['status'],
    duration: toNumber(item.duration),
    steps,
    createdAt: typeof (item.createdAt ?? item.created_at) === 'string' ? String(item.createdAt ?? item.created_at) : undefined,
    created_at: typeof (item.created_at ?? item.createdAt) === 'string' ? String(item.created_at ?? item.createdAt) : undefined,
  };
};

export const normalizeTestSuite = (raw: unknown): TestSuite => {
  const item = toRecord(raw);
  const project = toRecord(item.project);
  const runs = Array.isArray(item.runs) ? item.runs.map(normalizeTestRun) : [];
  return {
    id: toNumber(item.id),
    projectId: item.projectId === undefined && item.project_id === undefined ? undefined : toNumber(item.projectId ?? item.project_id),
    project_id: item.project_id === undefined && item.projectId === undefined ? undefined : toNumber(item.project_id ?? item.projectId),
    projectName: typeof (item.projectName ?? item.project_name) === 'string' ? String(item.projectName ?? item.project_name) : undefined,
    project_name: typeof (item.project_name ?? item.projectName) === 'string' ? String(item.project_name ?? item.projectName) : undefined,
    project: { name: typeof project.name === 'string' ? project.name : undefined },
    runAt: typeof item.runAt === 'string' ? item.runAt : undefined,
    createdAt: typeof (item.createdAt ?? item.created_at) === 'string' ? String(item.createdAt ?? item.created_at) : undefined,
    created_at: typeof (item.created_at ?? item.createdAt) === 'string' ? String(item.created_at ?? item.createdAt) : undefined,
    startedAt: typeof (item.startedAt ?? item.started_at) === 'string' ? String(item.startedAt ?? item.started_at) : undefined,
    started_at: typeof (item.started_at ?? item.startedAt) === 'string' ? String(item.started_at ?? item.startedAt) : undefined,
    totalDuration: toNumber(item.totalDuration ?? item.total_duration),
    total_duration: toNumber(item.total_duration ?? item.totalDuration),
    status: toString(item.status, 'error') as TestSuite['status'],
    runs,
  };
};

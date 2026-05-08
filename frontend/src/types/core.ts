import type { ReactNode } from 'react';

export type RunStatus = 'idle' | 'running' | 'success' | 'error' | 'failed' | 'completed';
export type StepAction = 'tap' | 'text' | 'swipe' | 'tap_structure' | 'wait' | string;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export interface SelectorSnapshot {
  resourceId?: string;
  resource_id?: string;
  text?: string;
  contentDesc?: string;
  content_desc?: string;
  className?: string;
  class_name?: string;
  xpath?: string;
  index?: number;
  bounds?: Bounds;
}

export type Bounds = [number, number, number, number];

export interface StructuralTarget {
  isDynamic: boolean;
  is_dynamic?: boolean;
  rowIndex?: number | null;
  row_index?: number | null;
  className: string;
  class_name?: string;
  textAnchor?: string | null;
  text_anchor?: string | null;
  resourceId?: string;
  resource_id?: string;
  text?: string;
  contentDesc?: string;
  content_desc?: string;
  fallback: {
    bounds: Bounds;
    x: number;
    y: number;
  };
}

export interface ScenarioStep {
  id: number;
  action: StepAction;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  text?: string;
  inputText?: string;
  input_text?: string;
  duration?: number;
  targetLabel?: string;
  target_label?: string;
  description: string;
  label?: string;
  selector?: SelectorSnapshot;
  target?: StructuralTarget;
}

export interface Scenario {
  id: string;
  dbId?: number;
  scriptName: string;
  steps: ScenarioStep[];
  updatedAt: string | null;
  expanded: boolean;
  runStatus: RunStatus;
  message?: string;
  traceImage?: string | null;
  stepLogs?: StepExecutionLog[];
  runningStepIndex?: number;
}

export interface DbScenario {
  id: number;
  name: string;
  steps: ScenarioStep[];
  updatedAt?: string;
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
}

export interface ProjectItem {
  id: number;
  name: string;
  packageName: string;
  package_name?: string;
  mainActivity: string | null;
  main_activity?: string | null;
}

export interface DeviceState {
  connected: boolean;
  width: number;
  height: number;
  checkedAt: number | null;
  streamReloadToken: number;
}

export interface ChatMessage {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface StepExecutionLog {
  id?: number;
  index: number;
  stepIndex?: number;
  action: StepAction;
  description?: string;
  success: boolean;
  message?: string;
  verify?: JsonObject | null;
  traceImage?: string | null;
  trace_image?: string | null;
  error?: string | null;
  isHealed?: boolean;
  is_healed?: boolean;
  healDetails?: HealDetails | null;
  heal_details?: HealDetails | null;
}

export interface HealDetails {
  original?: string;
  found?: string;
  confidence?: string;
  [key: string]: JsonValue | undefined;
}

export interface TestRun {
  id: number;
  scenarioName: string;
  scenario_name?: string;
  projectName?: string;
  project_name?: string;
  status: RunStatus;
  duration: number;
  steps: StepExecutionLog[];
  createdAt?: string;
  created_at?: string;
}

export interface TestSuite {
  id: number;
  projectId?: number;
  project_id?: number;
  projectName?: string;
  project_name?: string;
  project?: { name?: string };
  runAt?: string;
  createdAt?: string;
  created_at?: string;
  startedAt?: string;
  started_at?: string;
  totalDuration: number;
  total_duration?: number;
  status: RunStatus;
  runs: TestRun[];
}

export interface ModalBaseProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export interface FileSystemFileHandle {
  getFile(): Promise<File>;
}

export interface FileSystemWritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileSystemSaveFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

export interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

export interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemSaveFileHandle>;
  }
}

// Shared types for frontend and backend

// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  display_name?: string | null;
  /** Alias used by frontend components (camelCase of display_name) */
  displayName?: string | null;
  role: UserRole;
  is_active?: boolean;
  created_at: Date;
  last_login_at?: Date | null;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role?: UserRole;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  name: string;
  content: string;
  uploadedAt: Date;
  isPoisoned: boolean;
  attackType?: string;
}

export interface Attack {
  id: string;
  name: string;
  description: string;
  injectionText: string;
  category: 'override' | 'leak' | 'refuse' | 'jailbreak' | 'obfuscation' | 'indirect' | 'escalation' | 'baseline';
  tier: 'none' | 'basic' | 'intermediate' | 'advanced';
  howItWorks?: string;
  mechanism?: string;
  impact?: string;
  example?: string;
  isBuiltIn?: boolean;
}

export interface Defense {
  id: string;
  name: string;
  description: string;
  type: 'input' | 'output' | 'session';
  enabled: boolean;
  isBuiltIn?: boolean;
  countersAttacks?: string[];
  howItWorks?: string;
  researchBasis?: string;
  effectiveness?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  defenseState?: DefenseState;
}

export interface DefenseState {
  activeDefenses: string[];
  pipelineResult?: {
    allowed: boolean;
    pipelineConfidence?: number;
    pipelineConfidencePct?: number;
    verdicts: { defenseId: string; defenseName: string; triggered: boolean; confidence: number; details: string; blocked: boolean }[];
    defenseEconomics?: DefenseEconomics;
    summary: string;
  };
  flagged?: boolean;
}



export interface TestResult {
  id: string;
  prompt: string;
  attackType: string;
  beforeResponse: string;
  afterResponse: string;
  defenses: string[];
  timestamp: Date;
  effectiveness: 'neutralized' | 'partially_effective' | 'vulnerable';
  assessment: string;
  evaluatorConfidencePct?: number;
  pipelineConfidencePct?: number;
}

export interface QueryRequest {
  prompt: string;
  documentIds: string[];
  activeDefenses: string[];
}

export interface QueryResponse {
  response: string;
  defenseState: DefenseState;
  truncated: boolean;
  tokenCount?: number;
}

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type StressSeverityKind =
  | 'benign_safe'
  | 'false_positive'
  | 'attack_succeeded'
  | 'model_manipulated'
  | 'pipeline_blocked'
  | 'execution_error'
  | 'no_attack_signal';

export interface StressSeverityMetric {
  severity: SeverityLevel;
  score: number;
  kind: StressSeverityKind;
}

export interface DefenseEconomics {
  judgeCalls: number;
  addedLatencyMs: number;
  tokenOverhead: number;
  estimatedJudgeCostUsd?: number;
}

export interface StressEvaluationSummary {
  pipelineBlocked: boolean;
  attackSucceeded: boolean;
  modelManipulated: boolean;
  echoScore: number;
  finalScore: number;
  scoreThresholdUsed?: number;
  judgeSucceeded: boolean | null;
  reason: string;
}

export interface UploadResponse {
  document: Document;
}

export interface ComparisonData {
  beforeResponse: ChatMessage;
  afterResponse: ChatMessage;
  diff: DiffSegment[];
}

export interface DiffSegment {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

export interface ComparisonRequest {
  prompt: string;
  documentIds: string[];
  attackIds?: string[];
  defenseIds?: string[];
}

export interface ComparisonResponse {
  clean: QueryResponse;
  attacked?: QueryResponse;
  defended?: QueryResponse;
}

export interface TestTrace {
  id: string;
  testCaseId: string;
  attackId?: string;
  testRunId: number;
  llmProvider: string;
  prompt: string;
  response: string;
  expectedBehavior: string;
  actualBehavior: string;
  success: boolean;
  executionTimeMs: number;
  tokenCount?: number;
  defenseIds: string[];
  defenseState?: any;
  pipelineConfidence?: number;
  pipelineConfidencePct?: number;
  evaluatorConfidencePct?: number;
  severity?: SeverityLevel;
  severityMetric?: StressSeverityMetric;
  defenseEconomics?: DefenseEconomics;
  timestamp: Date;
  runName?: string;
  runStartedAt?: Date;
}

export interface TestTraceResponse {
  data: TestTrace[];
  total: number;
}

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
  /** Known adversarial fixture (e.g. InfoBank poisoned folder). */
  isPoisoned: boolean;
  attackType?: string;
  /**
   * True for end-user file uploads (.txt from disk). Unknown provenance —
   * treated as untrusted for simulator clean baselines and flagged in the UI.
   * InfoBank loads are never marked untrusted (clean or poisoned use isPoisoned instead).
   */
  untrustedUpload?: boolean;
}

export interface Attack {
  id: string;
  name: string;
  description: string;
  injectionText: string;
  category: 'override' | 'leak' | 'refuse' | 'jailbreak' | 'obfuscation' | 'indirect' | 'escalation' | 'baseline' | 'Fabricated Context';
  tier: 'none' | 'basic' | 'intermediate' | 'advanced';
  howItWorks?: string;
  mechanism?: string;
  impact?: string;
  example?: string;
  isBuiltIn?: boolean;
  createdAt?: string | Date;
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
  /** Present when document context was truncated server-side for this reply. */
  wasTruncated?: boolean;
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
    /** True when Turn Tracker had latched `forceLlmJudge` at judge decision time for this response. */
    forcedJudgeActive?: boolean;
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

/** Stress test runner (`POST /api/testing/execute`) — optional fields beyond `attackIds`. */
export interface StressTestConfig {
  useJudgeEvaluation?: boolean; // default false — when false, skips runLLMJudge in evaluateWithSignals to preserve API quota
}

export interface QueryResponse {
  response: string;
  defenseState: DefenseState;
  truncated: boolean;
  /** True when document context was partially omitted due to context limits (chat / simulator). */
  wasTruncated?: boolean;
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
  /** Optional upload-time scan (encoding / semantic heuristics). */
  scanResult?: { isPoisonSuspect: boolean; indicators: string[] };
}

export interface SimulationDiffData {
  beforeResponse: ChatMessage;
  afterResponse: ChatMessage;
  diff: DiffSegment[];
}

export interface DiffSegment {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

export interface SimulatorRequest {
  prompt: string;
  documentIds: string[];
  attackIds?: string[];
  defenseIds?: string[];
}

/** One column in the simulator (clean / breach / protected). */
export type SimulatorColumnResult = QueryResponse;

export interface SimulatorMeta {
  wasTruncated: boolean;
  truncatedDocs: string[];
  documentTokensUsed: number;
  documentTokensBudget: number;
}

export interface SimulatorResponse {
  clean: SimulatorColumnResult;
  breach: SimulatorColumnResult;
  /** Defended pipeline column (wire key is `protected`). */
  'protected': SimulatorColumnResult;
  meta?: SimulatorMeta;
}

export interface TestTrace {
  id: string;
  /** `test_results.id` — use to load full prompt/response after list fetch. */
  resultId?: number;
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

/** Row from `GET /api/testing/runs` (dates are ISO strings over the wire). */
export interface TestRunListItem {
  id: number;
  name: string;
  description: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  configuration: Record<string, unknown>;
}

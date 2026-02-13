
export enum AppPhase {
  LANDING = 'LANDING',
  DIAGNOSTIC = 'DIAGNOSTIC',
  ROLE_ANNOUNCEMENT = 'ROLE_ANNOUNCEMENT',
  INTERVIEW = 'INTERVIEW',
  EVALUATING = 'EVALUATING',
  REPORT = 'REPORT'
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface DiagnosticData {
  responses: Message[];
  confidence: number;
  assignedRole: string;
}

export interface InterviewData {
  interviewerName: string;
  questionIndex: number;
  questions: string[];
  responses: Message[];
}

export interface AssessorDashboard {
  rubricScoring: {
    clarity: number;
    pronunciation: number;
    vocabulary: number;
    fluency: number;
    grammar: number;
    engagement: number;
    responseQuality: number;
  };
  safeguardingCompetency: {
    status: 'Competent' | 'Emerging' | 'Insufficient';
    explanation: string;
  };
  starStructureReview: {
    status: 'Strong' | 'Partial' | 'Weak';
    details: string;
  };
  cefrAlignment: {
    level: string;
    reasoning: string;
  };
  readiness: {
    status: 'Not Ready' | 'Ready for Supported Interview' | 'Interview Ready' | 'Strong Candidate';
    justification: string;
  };
  teacherPlan: {
    speakingDrills: string[];
    safeguardingTasks: string[];
    practicePrompts: string[];
  };
}

export interface ProgressUpdate {
  improvementAreas: string[];
  persistentChallenges: string[];
  trend: 'Improved' | 'Slight Improvement' | 'No Significant Change';
}

export interface EvaluationReport {
  overallLevel: string;
  verdict: string;
  strengths: string[];
  developmentAreas: string[];
  grammarFeedback: string;
  starAnalysis: string;
  futurePhrases: string[];
  improvementPlan: { day: string; task: string }[];
  assessorDashboard: AssessorDashboard;
  progressUpdate?: ProgressUpdate;
  timestamp: number;
}

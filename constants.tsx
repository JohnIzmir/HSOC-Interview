
export const INTERVIEWERS = ['Sarah', 'David', 'Fatima'];

export const QUESTION_POOL = {
  CATEGORY_1: [
    "Why do you want to work in Health and Social Care?",
    "What qualities make you suitable for this role?",
    "Describe your previous experience.",
    "Why should we hire you?",
    "What does person-centred care mean to you?",
    "What are your strengths?",
    "What are your weaknesses?"
  ],
  CATEGORY_2: [
    "Describe a time you worked in a team.",
    "How do you deal with conflict?",
    "How would you communicate with someone who doesn’t speak English well?",
    "How do you build trust with service users?",
    "Describe a time you handled feedback.",
    "How do you manage stress?"
  ],
  CATEGORY_3: [
    "What is safeguarding?",
    "What would you do if you suspected abuse?",
    "What is confidentiality?",
    "Why is dignity important?",
    "What is the Care Act?",
    "What is duty of care?",
    "How do you report concerns?",
    "What is whistleblowing?"
  ],
  CATEGORY_4: [
    "A service user refuses medication. What do you do?",
    "A colleague is rude to a resident. What do you do?",
    "A family member complains. How do you respond?",
    "You notice bruises. What next?",
    "A resident is aggressive.",
    "You are short-staffed.",
    "A client falls.",
    "A colleague breaks confidentiality."
  ],
  CATEGORY_5: [
    "How do you improve your skills?",
    "What training would you like?",
    "How do you reflect on your work?",
    "Where do you see yourself in 3 years?",
    "How do you maintain professionalism?",
    "Why is equality and diversity important?"
  ]
};

export const SYSTEM_INSTRUCTIONS = {
  DIAGNOSTIC: `
    You are a Diagnostic Engine for a Health & Social Care Interview Sim.
    Goal: Determine the best role for the user (e.g., Care Assistant, Domiciliary Worker).
    Process: 
    1. Ask one adaptive question at a time.
    2. Focus on: Care home vs domiciliary, elderly/dementia exp, medication, team/independent, safeguarding awareness, resilience.
    3. Minimum 3 questions.
    4. Once confidence is high, respond ONLY with JSON: {"confidence": 95, "role": "Senior Care Assistant", "message": "Based on your responses..."}.
    Keep it friendly but professional.
  `,
  INTERVIEW: (interviewer: string, questions: string[]) => `
    You are ${interviewer}, an HR Manager in Health & Social Care.
    Conduct a formal mock interview using these 10 questions: ${JSON.stringify(questions)}.
    Rules:
    - Ask ONLY ONE question at a time.
    - DO NOT provide feedback or corrections.
    - For behavioural/scenario questions, look for structured examples.
    - If the user's response is very short (less than 20 words or likely under 60 seconds spoken), say: "Thank you. Could you add more detail or provide an example to strengthen your answer?"
    - Maintain a professional, supportive but formal tone.
  `,
  EVALUATION: `
    You are an expert Health and Social Care interview assessor reviewing transcript data.
    Conduct a structured evaluation using ESOL Functional Skills Level 1 & 2 standards.
    Weight safeguarding and relevance highly.
    
    STAR METHOD EVALUATION:
    For all behavioural and scenario-based questions, evaluate if the response includes Situation, Task, Action, and Result.
    
    ASSESSOR DASHBOARD REQUIREMENTS:
    1. Rubric Scoring (1-4): Clarity, Pronunciation, Vocabulary, Fluency, Grammar, Engagement, Response Quality.
    2. Safeguarding Competency: Evaluate reporting knowledge and legislation. Competent / Emerging / Insufficient.
    3. STAR Structure Review: Strong / Partial / Weak.
    4. CEFR & Employability: Below B1 / B1 Secure / Emerging B2 / Secure B2.
    5. Readiness: Not Ready / Ready for Supported Interview / Interview Ready / Strong Candidate.
    6. Teacher Intervention Plan: 3 drills, 3 tasks, 3 prompts.
    
    PROGRESS TRACKING:
    If a previous report is provided, compare performance and include:
    - improvementAreas: Specific skills that have improved.
    - persistentChallenges: Skills still needing work.
    - trend: "Improved", "Slight Improvement", or "No Significant Change".

    Crucial: If safeguarding awareness is weak, overall level MUST be capped at "Needs Development".
    Format the output EXACTLY as a structured report JSON matching the requested schema.
  `
};

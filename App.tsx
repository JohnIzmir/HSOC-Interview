
import React, { useState, useEffect, useRef } from 'react';
import { AppPhase, Message, DiagnosticData, InterviewData, EvaluationReport } from './types';
import { INTERVIEWERS, QUESTION_POOL, SYSTEM_INSTRUCTIONS } from './constants';
import { gemini } from './services/geminiService';
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User
} from "firebase/auth";
import { 
  BriefcaseIcon, 
  ChatBubbleLeftRightIcon, 
  ClipboardDocumentCheckIcon, 
  UserGroupIcon, 
  ExclamationTriangleIcon,
  AcademicCapIcon,
  PlayIcon,
  ArrowPathIcon,
  StarIcon,
  AdjustmentsVerticalIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  LightBulbIcon,
  ArrowTrendingUpIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  StopIcon,
  NoSymbolIcon,
  EnvelopeIcon,
  LockClosedIcon,
  ArrowLeftOnRectangleIcon
} from '@heroicons/react/24/outline';

// --- Firebase Configuration ---
// Note: Replace these with your actual Firebase project config values.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDyCaAo4ibko8ejFhwQ4Ff052WLC2USfTU",
  authDomain: "hsoc-interview.firebaseapp.com",
  projectId: "hsoc-interview",
  storageBucket: "hsoc-interview.firebasestorage.app",
  messagingSenderId: "849242505429",
  appId: "1:849242505429:web:b799c645b3ee53dd85225c",
  measurementId: "G-622N00YDF2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const HISTORY_KEY = 'care_path_session_history';

// --- Audio Utilities ---
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [phase, setPhase] = useState<AppPhase>(AppPhase.LANDING);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticData>({ responses: [], confidence: 0, assignedRole: '' });
  const [interview, setInterview] = useState<InterviewData | null>(null);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<EvaluationReport[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [muteAudio, setMuteAudio] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const saved = localStorage.getItem(`${HISTORY_KEY}_${currentUser.uid}`);
    if (saved) {
      try {
        setSessionHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-GB';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setUserInput(prev => prev + ' ' + finalTranscript.trim());
          setSpeechError(null);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition status:', event.error);
        setIsRecording(false);
        if (event.error === 'no-speech') {
          setSpeechError("I didn't hear anything. Please try again!");
        } else if (event.error === 'not-allowed') {
          setSpeechError("Microphone access denied.");
        } else {
          setSpeechError(`Speech error: ${event.error}`);
        }
        setTimeout(() => setSpeechError(null), 4000);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [currentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'model' && !isAiSpeaking && phase !== AppPhase.REPORT && !muteAudio) {
      speakMessage(lastMessage.text);
    }
  }, [messages]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (isLoginView) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    stopAiSpeech();
    await signOut(auth);
    reset();
  };

  const speakMessage = async (text: string) => {
    if (!text || muteAudio) return;
    if (activeSourceRef.current) {
      activeSourceRef.current.stop();
    }
    try {
      setIsAiSpeaking(true);
      const audioData = await gemini.generateSpeech(text);
      if (audioData) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        const decoded = decodeBase64(audioData);
        const buffer = await decodeAudioData(decoded, ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        activeSourceRef.current = source;
        source.onended = () => {
          setIsAiSpeaking(false);
          activeSourceRef.current = null;
        };
        source.start();
      } else {
        setIsAiSpeaking(false);
      }
    } catch (e) {
      console.error("TTS failed", e);
      setIsAiSpeaking(false);
    }
  };

  const stopAiSpeech = () => {
    if (activeSourceRef.current) {
      activeSourceRef.current.stop();
      setIsAiSpeaking(false);
      activeSourceRef.current = null;
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      stopAiSpeech();
      setUserInput('');
      setSpeechError(null);
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (e) {
        console.error("Failed to start speech recognition", e);
        setSpeechError("Speech recognition failed to start.");
      }
    }
  };

  const startDiagnostic = async () => {
    setPhase(AppPhase.DIAGNOSTIC);
    setIsLoading(true);
    const firstQ = await gemini.getChatResponse(SYSTEM_INSTRUCTIONS.DIAGNOSTIC, []);
    setMessages([{ role: 'model', text: firstQ || "Hello! I'm here to help determine the best care role for you today. To start, do you prefer working in a care home environment or visiting people in their own homes?" }]);
    setIsLoading(false);
  };

  const handleDiagnosticStep = async (input: string) => {
    const newHistory = [...messages, { role: 'user', text: input } as Message];
    setMessages(newHistory);
    setUserInput('');
    setIsLoading(true);
    const formattedHistory = newHistory.map(m => ({ parts: [{ text: m.text }], role: m.role }));
    const rawResponse = await gemini.getChatResponse(SYSTEM_INSTRUCTIONS.DIAGNOSTIC, formattedHistory);
    try {
      const data = JSON.parse(rawResponse || "");
      if (data.role && data.confidence >= 80) {
        setDiagnostic({ responses: newHistory, confidence: data.confidence, assignedRole: data.role });
        setMessages([...newHistory, { role: 'model', text: data.message }]);
        setPhase(AppPhase.ROLE_ANNOUNCEMENT);
      } else {
        setMessages([...newHistory, { role: 'model', text: rawResponse || "I see. Let me ask you another thing..." }]);
      }
    } catch (e) {
      setMessages([...newHistory, { role: 'model', text: rawResponse || "Thank you. Let's continue." }]);
    }
    setIsLoading(false);
  };

  const startInterview = () => {
    const selectedInterviewer = INTERVIEWERS[Math.floor(Math.random() * INTERVIEWERS.length)];
    const lastSession = sessionHistory[0];
    let questions: string[] = [];
    if (!lastSession) {
      questions = [
        ...QUESTION_POOL.CATEGORY_1.sort(() => 0.5 - Math.random()).slice(0, 2),
        ...QUESTION_POOL.CATEGORY_2.sort(() => 0.5 - Math.random()).slice(0, 2),
        ...QUESTION_POOL.CATEGORY_3.sort(() => 0.5 - Math.random()).slice(0, 2),
        ...QUESTION_POOL.CATEGORY_4.sort(() => 0.5 - Math.random()).slice(0, 2),
        ...QUESTION_POOL.CATEGORY_5.sort(() => 0.5 - Math.random()).slice(0, 2)
      ];
    } else {
      const rubric = lastSession.assessorDashboard.rubricScoring;
      const scores = [
        { cat: 'CATEGORY_2', score: rubric.clarity + rubric.pronunciation },
        { cat: 'CATEGORY_5', score: rubric.vocabulary + rubric.grammar },
        { cat: 'CATEGORY_1', score: rubric.responseQuality },
        { cat: 'CATEGORY_3', score: (lastSession.assessorDashboard.safeguardingCompetency.status === 'Competent' ? 4 : 1) },
        { cat: 'CATEGORY_4', score: (lastSession.assessorDashboard.starStructureReview.status === 'Strong' ? 4 : 1) }
      ].sort((a, b) => a.score - b.score);
      const weakestCategory = scores[0].cat as keyof typeof QUESTION_POOL;
      questions.push(...QUESTION_POOL[weakestCategory].sort(() => 0.5 - Math.random()).slice(0, 4));
      const safeguardingStatus = lastSession.assessorDashboard.safeguardingCompetency.status;
      const safeguardingCount = safeguardingStatus !== 'Competent' ? 3 : 1;
      questions.push(...QUESTION_POOL.CATEGORY_3.sort(() => 0.5 - Math.random()).slice(0, safeguardingCount));
      const starStatus = lastSession.assessorDashboard.starStructureReview.status;
      const starCount = starStatus !== 'Strong' ? 2 : 1;
      questions.push(...QUESTION_POOL.CATEGORY_4.sort(() => 0.5 - Math.random()).slice(0, starCount));
      questions.push(...QUESTION_POOL.CATEGORY_5.sort(() => 0.5 - Math.random()).slice(0, 1));
      questions = Array.from(new Set(questions)).slice(0, 10);
      while(questions.length < 10) {
        const randomCat = Object.values(QUESTION_POOL)[Math.floor(Math.random()*5)];
        const randomQ = randomCat[Math.floor(randomCat.length)];
        if(!questions.includes(randomQ)) questions.push(randomQ);
      }
    }
    setInterview({
      interviewerName: selectedInterviewer,
      questionIndex: 0,
      questions,
      responses: []
    });
    setPhase(AppPhase.INTERVIEW);
    setMessages([{ role: 'model', text: `Hello, I'm ${selectedInterviewer}. I'll be conducting your interview for the ${diagnostic.assignedRole} position. Let's begin.\n\nQuestion 1: ${questions[0]}` }]);
  };

  const handleInterviewResponse = async (input: string) => {
    if (!interview) return;
    const currentQIndex = interview.questionIndex;
    const nextQIndex = currentQIndex + 1;
    const newMessages = [...messages, { role: 'user', text: input } as Message];
    setMessages(newMessages);
    setUserInput('');
    setIsLoading(true);
    if (nextQIndex < 10) {
      const systemPrompt = SYSTEM_INSTRUCTIONS.INTERVIEW(interview.interviewerName, interview.questions);
      const formattedHistory = newMessages.map(m => ({ parts: [{ text: m.text }], role: m.role }));
      const geminiResponse = await gemini.getChatResponse(systemPrompt, formattedHistory);
      setInterview({
        ...interview,
        questionIndex: nextQIndex,
        responses: [...interview.responses, { role: 'user', text: input }]
      });
      setMessages([...newMessages, { role: 'model', text: geminiResponse || `Thank you. Question ${nextQIndex + 1}: ${interview.questions[nextQIndex]}` }]);
    } else {
      setPhase(AppPhase.EVALUATING);
      const transcript = newMessages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join("\n");
      const lastSessionData = sessionHistory.length > 0 ? {
          overallLevel: sessionHistory[0].overallLevel,
          rubric: sessionHistory[0].assessorDashboard.rubricScoring,
          safeguarding: sessionHistory[0].assessorDashboard.safeguardingCompetency.status
      } : null;
      const evalData = await gemini.getEvaluation(transcript, lastSessionData);
      const reportWithMeta: EvaluationReport = {
        ...evalData,
        timestamp: Date.now()
      };
      setReport(reportWithMeta);
      saveToHistory(reportWithMeta);
      setPhase(AppPhase.REPORT);
    }
    setIsLoading(false);
  };

  const saveToHistory = (newReport: EvaluationReport) => {
    if (!currentUser) return;
    const updatedHistory = [newReport, ...sessionHistory];
    setSessionHistory(updatedHistory);
    localStorage.setItem(`${HISTORY_KEY}_${currentUser.uid}`, JSON.stringify(updatedHistory));
  };

  const reset = () => {
    stopAiSpeech();
    setPhase(AppPhase.LANDING);
    setMessages([]);
    setDiagnostic({ responses: [], confidence: 0, assignedRole: '' });
    setInterview(null);
    setReport(null);
    setShowDashboard(false);
    setIsRecording(false);
    setSpeechError(null);
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 px-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
          <div className="p-8">
            <div className="flex justify-center mb-6">
              <div className="bg-indigo-600 p-4 rounded-2xl shadow-xl shadow-indigo-100">
                <AcademicCapIcon className="h-10 w-10 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-center text-gray-900 mb-2">CarePath AI</h2>
            <p className="text-center text-gray-500 mb-8 font-medium">Professional Social Care Interview Simulation</p>
            
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Email Address</label>
                <div className="relative">
                  <EnvelopeIcon className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="email" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Password</label>
                <div className="relative">
                  <LockClosedIcon className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium"
                  />
                </div>
              </div>
              
              {authError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
                  {authError}
                </div>
              )}
              
              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {isLoginView ? 'Login to Portal' : 'Create Account'}
              </button>
            </form>
            
            <div className="mt-8 text-center">
              <button 
                onClick={() => setIsLoginView(!isLoginView)}
                className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {isLoginView ? "Don't have an account? Sign up" : "Already have an account? Login"}
              </button>
            </div>
          </div>
          <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Secure Career Development Environment</p>
          </div>
        </div>
      </div>
    );
  }

  const renderScore = (label: string, value: number) => (
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-gray-600 font-medium">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`h-2 w-6 rounded-full ${s <= value ? 'bg-indigo-600' : 'bg-gray-200'}`} />
        ))}
        <span className="ml-2 text-xs font-black text-indigo-900">{value}/4</span>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 h-screen flex flex-col">
      <header className="flex items-center justify-between mb-8 border-b pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-200 h-12 w-12 flex items-center justify-center">
            <UserGroupIcon className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-none mb-1">CarePath AI</h1>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest">Mock Interview Engine {sessionHistory.length > 0 && `(#${sessionHistory.length + 1})`}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMuteAudio(!muteAudio)}
            className={`p-2 rounded-lg transition-colors no-print ${muteAudio ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'}`}
            title={muteAudio ? 'Unmute AI' : 'Mute AI'}
          >
            {muteAudio ? <NoSymbolIcon className="h-5 w-5" /> : <SpeakerWaveIcon className="h-5 w-5" />}
          </button>
          
          <button 
            onClick={handleLogout}
            className="p-2 rounded-lg text-gray-400 bg-gray-50 hover:text-red-600 hover:bg-red-50 transition-colors no-print"
            title="Logout"
          >
            <ArrowLeftOnRectangleIcon className="h-5 w-5" />
          </button>

          {phase !== AppPhase.LANDING && (
            <button onClick={reset} className="text-gray-500 hover:text-red-500 transition-colors flex items-center gap-1 text-sm font-medium no-print px-3 py-1 hover:bg-red-50 rounded-lg">
              <ArrowPathIcon className="h-4 w-4" /> Restart
            </button>
          )}
          <div className={`bg-white p-1 rounded-lg shadow-md ring-1 ring-gray-100 overflow-hidden h-12 w-12 flex items-center justify-center relative transition-transform ${isAiSpeaking ? 'scale-110' : ''}`}>
            <img 
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${interview?.interviewerName || 'Sarah'}&backgroundColor=b6e3f4&hairColor=transparent`} 
              alt="Interviewer"
              className="h-10 w-10 rounded-md object-cover"
            />
            {isAiSpeaking && (
              <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center backdrop-blur-[1px]">
                <SpeakerWaveIcon className="h-6 w-6 text-indigo-700 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100">
        {phase === AppPhase.LANDING && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-white to-indigo-50/30 overflow-y-auto">
            <AcademicCapIcon className="h-20 w-20 text-indigo-500 mb-6 animate-bounce-slow" />
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4 leading-tight">Master Your Care Interview</h2>
            <p className="text-lg text-gray-600 mb-2 max-w-lg leading-relaxed">
              Experience a realistic Health and Social Care mock interview. Speak your answers, hear the questions, and get a professional ESOL assessment.
            </p>
            <p className="text-sm font-black text-indigo-900 mb-8 tracking-widest uppercase opacity-60">
              Created by John Efes
            </p>
            <div className="flex flex-col gap-4">
              <button 
                onClick={startDiagnostic}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center gap-3 active:scale-95 mx-auto"
              >
                <PlayIcon className="h-6 w-6" />
                {sessionHistory.length > 0 ? 'Start Next Session' : 'Begin Simulation'}
              </button>
              
              <div className="flex items-center gap-6 justify-center mt-4">
                <div className="flex flex-col items-center gap-1">
                  <SpeakerWaveIcon className="h-5 w-5 text-indigo-400" />
                  <span className="text-[10px] uppercase font-black text-gray-400">Audio ON</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <MicrophoneIcon className="h-5 w-5 text-indigo-400" />
                  <span className="text-[10px] uppercase font-black text-gray-400">Speech-to-Text</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {(phase === AppPhase.DIAGNOSTIC || phase === AppPhase.INTERVIEW || phase === AppPhase.ROLE_ANNOUNCEMENT) && (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="bg-gray-50 border-b px-6 py-3 flex justify-between items-center shrink-0">
               <span className="text-sm font-bold text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                 {phase === AppPhase.DIAGNOSTIC ? 'Phase 1: Diagnostic Engine' : 'Phase 2: Mock Interview'}
               </span>
               {interview && (
                 <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 uppercase">Progression</span>
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 transition-all duration-500" 
                        style={{ width: `${(interview.questionIndex + 1) * 10}%` }}
                      ></div>
                    </div>
                 </div>
               )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-5">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-5 py-4 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed ${
                    m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none ring-1 ring-gray-200/50'
                  }`}>
                    {m.text.split('\n').map((line, idx) => (
                      <p key={idx} className="mb-2 last:mb-0">
                        {line}
                      </p>
                    ))}
                    {m.role === 'model' && (
                      <button 
                        onClick={() => speakMessage(m.text)}
                        className="mt-2 text-indigo-500 hover:text-indigo-700 flex items-center gap-1 text-[10px] font-black uppercase tracking-tighter"
                      >
                        <SpeakerWaveIcon className="h-3 w-3" /> Replay Audio
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none flex gap-2">
                    <span className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce"></span>
                    <span className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
                    <span className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.4s]"></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-6 bg-white border-t border-gray-100 shrink-0">
              {phase === AppPhase.ROLE_ANNOUNCEMENT ? (
                <button onClick={startInterview} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-transform hover:-translate-y-1 active:scale-95">
                  Confirm & Start Formal Interview
                </button>
              ) : (
                <div className="flex flex-col gap-4">
                  {isRecording && (
                    <div className="flex items-center gap-3 text-indigo-600 font-bold text-sm animate-pulse justify-center bg-indigo-50 py-3 rounded-xl border border-indigo-100 shadow-inner">
                      <div className="relative h-3 w-3">
                        <div className="absolute inset-0 bg-indigo-600 rounded-full animate-ping opacity-75"></div>
                        <div className="relative h-3 w-3 bg-indigo-600 rounded-full"></div>
                      </div>
                      <span className="uppercase tracking-widest text-xs">Capturing spoken response... Click stop when finished.</span>
                    </div>
                  )}
                  {speechError && (
                    <div className="bg-red-50 text-red-600 text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300">
                      <ExclamationTriangleIcon className="h-4 w-4" />
                      {speechError}
                    </div>
                  )}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!userInput.trim() || isLoading) return;
                      if (isRecording) recognitionRef.current?.stop();
                      phase === AppPhase.DIAGNOSTIC ? handleDiagnosticStep(userInput) : handleInterviewResponse(userInput);
                    }}
                    className="relative flex gap-3"
                  >
                    <button 
                      type="button"
                      onClick={toggleRecording}
                      className={`p-4 rounded-xl shadow-lg transition-all active:scale-90 flex items-center justify-center ${isRecording ? 'bg-red-600 text-white ring-4 ring-red-100' : 'bg-white border-2 border-gray-100 text-gray-400 hover:text-indigo-600 hover:border-indigo-100'}`}
                      title={isRecording ? 'Stop Recording' : 'Answer with Voice'}
                    >
                      {isRecording ? <StopIcon className="h-7 w-7" /> : <MicrophoneIcon className="h-7 w-7" />}
                    </button>
                    <input 
                      autoFocus 
                      value={userInput} 
                      onChange={(e) => setUserInput(e.target.value)} 
                      placeholder={isRecording ? "Listening..." : "Type or speak your answer..."} 
                      className="flex-1 border-2 border-gray-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 rounded-xl px-5 py-4 outline-none transition-all text-gray-800 font-medium disabled:bg-gray-50 text-base" 
                      disabled={isLoading} 
                    />
                    <button 
                      type="submit" 
                      className="bg-indigo-600 text-white p-4 rounded-xl shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none hover:bg-indigo-700" 
                      disabled={isLoading || !userInput.trim()}
                    >
                      <svg className="h-7 w-7 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  </form>
                  <p className="text-[10px] text-center font-bold text-gray-400 uppercase tracking-tighter">Tip: Provide detailed examples using the STAR method (Situation, Task, Action, Result)</p>
                </div>
              )}
            </div>
          </div>
        )}

        {phase === AppPhase.EVALUATING && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-indigo-50/20">
            <div className="relative">
              <div className="h-24 w-24 border-8 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <ChartBarIcon className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-indigo-600" />
            </div>
            <h3 className="mt-8 text-2xl font-bold text-gray-900">Generating Professional Report</h3>
            <p className="mt-2 text-gray-600 text-center max-w-sm">Comparing your session transcript against Functional Skills Sector standards...</p>
          </div>
        )}

        {phase === AppPhase.REPORT && report && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50">
            <div className="max-w-3xl mx-auto space-y-8 print:p-0">
              
              <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100 no-print">
                <button 
                  onClick={() => setShowDashboard(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${!showDashboard ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <ClipboardDocumentCheckIcon className="h-5 w-5" /> Detailed Feedback
                </button>
                <button 
                  onClick={() => setShowDashboard(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${showDashboard ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <AdjustmentsVerticalIcon className="h-5 w-5" /> Assessor Dashboard
                </button>
              </div>

              {!showDashboard ? (
                <>
                  <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 h-32 w-32 bg-indigo-600 rotate-45 translate-x-16 -translate-y-16"></div>
                    <h2 className="text-3xl font-black text-gray-900 mb-6">Mock Interview Report</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100 ring-1 ring-indigo-200/50">
                        <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">Overall Performance</p>
                        <p className="text-2xl font-black text-indigo-900">{report.overallLevel}</p>
                      </div>
                      <div className={`p-6 rounded-2xl border ${report.verdict === 'Interview Ready' ? 'bg-green-50 border-green-100 text-green-900' : 'bg-orange-50 border-orange-100 text-orange-900'}`}>
                        <p className="text-xs font-black opacity-50 uppercase tracking-widest mb-1">Employment Verdict</p>
                        <p className="text-2xl font-black">{report.verdict}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-3xl shadow-xl text-white">
                    <h3 className="text-lg font-black uppercase tracking-widest mb-4 flex items-center gap-2"><StarIcon className="h-6 w-6 text-yellow-400" /> STAR Method Analysis</h3>
                    <p className="text-indigo-100 leading-relaxed font-medium bg-white/10 p-5 rounded-2xl border border-white/20">{report.starAnalysis}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100">
                      <h3 className="text-lg font-black text-green-600 uppercase tracking-widest mb-6 flex items-center gap-2">Three Key Strengths</h3>
                      <ul className="space-y-4">
                        {report.strengths.map((s, i) => (
                          <li key={i} className="flex gap-4 items-start"><span className="bg-green-100 text-green-600 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">✓</span><p className="text-gray-700 font-medium">{s}</p></li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100">
                      <h3 className="text-lg font-black text-orange-600 uppercase tracking-widest mb-6 flex items-center gap-2">Areas to Develop</h3>
                      <ul className="space-y-4">
                        {report.developmentAreas.map((s, i) => (
                          <li key={i} className="flex gap-4 items-start"><span className="bg-orange-100 text-orange-600 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">!</span><p className="text-gray-700 font-medium">{s}</p></li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
                    <h3 className="text-xl font-black text-indigo-900 mb-6 flex items-center gap-2"><ChartBarIcon className="h-6 w-6" /> Section 1: Rubric Scoring</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
                      {renderScore('Clarity', report.assessorDashboard.rubricScoring.clarity)}
                      {renderScore('Pronunciation', report.assessorDashboard.rubricScoring.pronunciation)}
                      {renderScore('Vocabulary', report.assessorDashboard.rubricScoring.vocabulary)}
                      {renderScore('Fluency', report.assessorDashboard.rubricScoring.fluency)}
                      {renderScore('Grammar', report.assessorDashboard.rubricScoring.grammar)}
                      {renderScore('Engagement', report.assessorDashboard.rubricScoring.engagement)}
                      {renderScore('Response Quality', report.assessorDashboard.rubricScoring.responseQuality)}
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black text-indigo-900 flex items-center gap-2"><ShieldCheckIcon className="h-6 w-6" /> Section 2: Safeguarding</h3>
                      <span className={`px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                        report.assessorDashboard.safeguardingCompetency.status === 'Competent' ? 'bg-green-100 text-green-700' :
                        report.assessorDashboard.safeguardingCompetency.status === 'Emerging' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {report.assessorDashboard.safeguardingCompetency.status}
                      </span>
                    </div>
                    <p className="text-gray-600 leading-relaxed bg-gray-50 p-6 rounded-2xl border border-gray-100">{report.assessorDashboard.safeguardingCompetency.explanation}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-indigo-900 text-white p-8 rounded-3xl shadow-xl">
                      <h4 className="text-indigo-300 font-black uppercase tracking-widest text-xs mb-2">CEFR Alignment</h4>
                      <p className="text-2xl font-black mb-4">{report.assessorDashboard.cefrAlignment.level}</p>
                      <p className="text-sm text-indigo-100/80 leading-relaxed italic">{report.assessorDashboard.cefrAlignment.reasoning}</p>
                    </div>
                    <div className="bg-white p-8 rounded-3xl shadow-xl border-2 border-indigo-600">
                      <h4 className="text-indigo-600 font-black uppercase tracking-widest text-xs mb-2">Readiness Verdict</h4>
                      <p className="text-2xl font-black text-indigo-900 mb-4">{report.assessorDashboard.readiness.status}</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{report.assessorDashboard.readiness.justification}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-center pb-12 gap-4 no-print">
                <button onClick={() => window.print()} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 active:scale-95"><ClipboardDocumentCheckIcon className="h-5 w-5" /> Save PDF Report</button>
                <button onClick={reset} className="bg-white text-indigo-600 border-2 border-indigo-600 px-8 py-3 rounded-xl font-bold flex items-center gap-2 active:scale-95"><ArrowPathIcon className="h-5 w-5" /> New Session</button>
              </div>
            </div>
          </div>
        )}
      </main>
      
      <footer className="py-4 text-center text-gray-400 text-[10px] font-bold uppercase tracking-[0.2em] shrink-0">
        CarePath Simulation Engine &copy; {new Date().getFullYear()} | Professional Development Portal
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s infinite;
        }
        @media print {
          header, footer, .no-print, button { display: none !important; }
          body { background: white; padding: 0; margin: 0; }
          .max-w-4xl { max-width: 100% !important; border: none !important; shadow: none !important; }
          main { overflow: visible !important; border: none !important; height: auto !important; }
          .flex-1 { flex: none !important; height: auto !important; }
        }
      `}} />
    </div>
  );
};

export default App;

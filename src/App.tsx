import { useEffect, useState, useRef } from 'react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, doc, setDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { LogOut, Send, Bot, User as UserIcon, RefreshCw, FileText, Map, Mic } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Ensure payload has zero undefined properties for Firestore
function sanitizePayload<T extends Record<string, any>>(payload: T): T {
  const result = { ...payload };
  Object.keys(result).forEach(key => {
    if (result[key] === undefined) {
      delete result[key];
    }
  });
  return result;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'resume' | 'roadmap' | 'interview'>('roadmap');
  
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setInteractions([]);
      return;
    }
    const q = query(
      collection(db, `users/${user.uid}/interactions`),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInteractions(data);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, (error) => {
      console.error("Firestore Listen Error", error);
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login Error", err);
    }
  };

  const generateId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    const userPrompt = input.trim();
    setInput(''); // Clear input for responsiveness, will restore if network fails
    setErrorMsg('');
    setLoadingAI(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: userPrompt, mode })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch AI response');
      }

      // Safe Firestore Write Payload - exact keys enforced by Rules
      const interactionId = generateId();
      const payload = sanitizePayload({
        prompt: userPrompt.substring(0, 5000), // Enforce length constraint
        response: data.response.substring(0, 30000),
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, `users/${user.uid}/interactions/${interactionId}`), payload);

    } catch (err: any) {
      console.error("Interaction Error", err);
      setErrorMsg(err.message || 'An error occurred during communication.');
      // Input Preservation on Failure
      setInput(userPrompt);
    } finally {
      setLoadingAI(false);
    }
  };

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-slate-400" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 text-center p-8 text-slate-800"
        >
          <Bot className="w-16 h-16 mx-auto mb-6 text-blue-600" />
          <h1 className="text-3xl font-serif text-slate-900 mb-2 tracking-tight">CareerPath AI</h1>
          <p className="text-slate-500 mb-8">Your personal AI Career Planner and Learning Coach.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Helvetica,Arial,sans-serif]">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Bot className="text-blue-500 w-8 h-8" />
            <span className="text-white font-bold text-xl tracking-tight">CareerPath AI</span>
          </div>
          <div className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest">Learning Coach & Planner</div>
        </div>
        
        <div className="mt-4 flex-1 px-4 space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">Coaching Modes</p>
          
          <button onClick={() => setMode('resume')} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer", mode === 'resume' ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white")}>
            <FileText className="w-5 h-5" /> Resume Analysis
          </button>
          <button onClick={() => setMode('roadmap')} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer", mode === 'roadmap' ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white")}>
            <Map className="w-5 h-5" /> Learning Roadmap
          </button>
          <button onClick={() => setMode('interview')} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer", mode === 'interview' ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white")}>
            <Mic className="w-5 h-5" /> Mock Interview
          </button>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center space-x-3 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full shadow-sm shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0"><UserIcon className="w-4 h-4 text-white" /></div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
              <p className="text-[10px] text-slate-400 truncate uppercase tracking-tighter">User</p>
            </div>
            <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-white transition-colors shrink-0" aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Interaction Area */}
      <div className="flex-1 flex flex-col relative h-[100dvh] bg-slate-50 text-slate-800">
        {/* Header (Mobile) */}
        <div className="md:hidden flex items-center p-4 border-b border-slate-200 bg-white">
          <span className="font-bold text-slate-800 capitalize">{mode} Coach</span>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
          <div className="max-w-3xl mx-auto space-y-6">
            {interactions.length === 0 && (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 mb-6">
                  {mode === 'resume' ? <FileText className="w-8 h-8" /> : mode === 'roadmap' ? <Map className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  {mode === 'resume' ? 'Ready for a Resume Review?' : mode === 'roadmap' ? 'Plan Your Next Move' : 'Start Your Mock Interview'}
                </h2>
                <p className="text-slate-500 max-w-sm mx-auto text-sm">
                  {mode === 'resume' ? 'Paste your resume or tell me your skills to get actionable gap analysis.' : 
                   mode === 'roadmap' ? 'Tell me your dream job and current skills to get a step-by-step path.' : 
                   'Tell me the role you are interviewing for to start the mock session.'}
                </p>
              </div>
            )}
            
            {interactions.map((interaction) => (
              <div key={interaction.id} className="space-y-6">
                <div className="flex items-start space-x-3 flex-row-reverse space-x-reverse">
                  <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center shrink-0 font-bold text-[10px]">U</div>
                  <div className="bg-blue-600 p-4 rounded-2xl rounded-tr-none text-sm leading-relaxed text-white shadow-md max-w-[85%]">
                    <p className="whitespace-pre-wrap">{interaction.prompt}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-[10px] border border-indigo-200">AI</div>
                  <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed text-slate-700 max-w-[85%]">
                    <div className="prose prose-sm prose-slate max-w-none">
                      <p className="whitespace-pre-wrap leading-relaxed">{interaction.response}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {loadingAI && (
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-[10px] border border-indigo-200">AI</div>
                <div className="flex items-center gap-1.5 px-4 py-4 bg-slate-100 rounded-2xl rounded-tl-none">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-2 h-2 rounded-full bg-slate-400" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-2 h-2 rounded-full bg-slate-400" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-2 h-2 rounded-full bg-slate-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
          <div className="max-w-3xl mx-auto">
            {errorMsg && (
              <div className="mb-3 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center justify-between">
                <span>{errorMsg}</span>
                <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700 font-medium">Dismiss</button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder={`Type here for ${mode}... (Shift+Enter for new line)`}
                className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 shadow-sm text-sm text-slate-900 resize-none"
                rows={1}
                style={{ minHeight: '60px', maxHeight: '200px' }}
                disabled={loadingAI}
              />
              <button
                type="submit"
                disabled={!input.trim() || loadingAI}
                className="absolute right-2 bottom-2 h-10 w-10 bg-blue-600 text-white rounded-lg flex items-center justify-center cursor-pointer hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="text-center mt-3">
               <p className="text-[10px] text-slate-400">Interactions are securely saved to your private journal.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

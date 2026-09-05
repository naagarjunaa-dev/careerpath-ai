import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';

admin.initializeApp();

const app = express();
const PORT = 3000;

// Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json());

const secretClient = new SecretManagerServiceClient();

async function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || await secretClient.getProjectId();
    const name = `projects/${projectId}/secrets/GEMINI_API_KEY/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    return version.payload?.data?.toString() || '';
  } catch (error) {
    console.warn("Could not retrieve GEMINI_API_KEY from Secret Manager. Ensure it's set.", error);
    return '';
  }
}

let ai: GoogleGenAI | null = null;
async function getAIClient() {
  if (!ai) {
    const key = await getGeminiApiKey();
    if (key) {
      ai = new GoogleGenAI({ apiKey: key });
    }
  }
  return ai;
}

// Authentication Middleware
async function verifyToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: Token verification failed' });
  }
}

// Resilient Model Fallback Ladder
async function generateContentWithFallback(prompt: string, systemInstruction?: string) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  const aiClient = await getAIClient();
  
  if (!aiClient) {
    throw new Error('AI Client not initialized (missing API Key)');
  }

  let lastError = null;

  for (const model of models) {
    try {
      const response = await aiClient.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
        }
      });
      return { response: response.text, modelUsed: model };
    } catch (error: any) {
      lastError = error;
      const status = error.status || error.code || 500;
      // Recoverable errors
      if ([429, 503, 500].includes(status) || error.message?.includes('UNAVAILABLE')) {
        console.warn(`Model ${model} failed with ${status}. Falling back...`);
        continue; // Try next model
      }
      throw error; // Unrecoverable error (e.g. 400 Bad Request, auth failure)
    }
  }
  throw lastError; // If all failed
}

// API Routes FIRST
app.post('/api/chat', verifyToken, async (req, res) => {
  // Defensive Payload Ingestion (Null-Safe Destructuring)
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const { prompt, mode } = body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Invalid prompt provided' });
    return;
  }

  let systemInstruction = "You are CareerPath AI, an expert AI Career Planner and Learning Coach. Provide highly structured, actionable, and encouraging advice.";
  if (mode === 'resume') {
    systemInstruction += " Analyze the user's resume, identify missing skills, and suggest improvements.";
  } else if (mode === 'roadmap') {
    systemInstruction += " Generate a personalized step-by-step roadmap for the user's target career.";
  } else if (mode === 'interview') {
    systemInstruction += " Conduct a Socratic mock interview. Ask one thoughtful question at a time and evaluate the user's response constructively.";
  }

  try {
    const result = await generateContentWithFallback(prompt, systemInstruction);
    res.json(result);
  } catch (error: any) {
    console.error("AI Generation failed:", error);
    res.status(500).json({ error: error.message || 'Failed to generate response' });
  }
});


async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

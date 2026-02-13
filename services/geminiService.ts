
import { GoogleGenAI, Type, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY || "";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  async getEvaluation(transcript: string, previousReport: any = null) {
    const contents = [
      { 
        role: 'user',
        parts: [{ 
          text: `Evaluate this interview transcript:\n\n${transcript}${
            previousReport ? `\n\nPREVIOUS SESSION SUMMARY FOR PROGRESS COMPARISON:\n${JSON.stringify(previousReport)}` : ""
          }` 
        }] 
      }
    ];

    const response = await this.ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents,
      config: {
        systemInstruction: `
          Conduct a structured evaluation using ESOL Functional Skills Level 1 & 2 standards.
          Apply strict STAR method analysis and safeguarding competency checks.
          If previous session data is provided, fill out the 'progressUpdate' field.
          
          Output JSON format matching the schema provided.
        `,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallLevel: { type: Type.STRING },
            verdict: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            developmentAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
            grammarFeedback: { type: Type.STRING },
            starAnalysis: { type: Type.STRING },
            futurePhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvementPlan: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING },
                  task: { type: Type.STRING }
                }
              }
            },
            progressUpdate: {
              type: Type.OBJECT,
              properties: {
                improvementAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
                persistentChallenges: { type: Type.ARRAY, items: { type: Type.STRING } },
                trend: { type: Type.STRING }
              }
            },
            assessorDashboard: {
              type: Type.OBJECT,
              properties: {
                rubricScoring: {
                  type: Type.OBJECT,
                  properties: {
                    clarity: { type: Type.NUMBER },
                    pronunciation: { type: Type.NUMBER },
                    vocabulary: { type: Type.NUMBER },
                    fluency: { type: Type.NUMBER },
                    grammar: { type: Type.NUMBER },
                    engagement: { type: Type.NUMBER },
                    responseQuality: { type: Type.NUMBER }
                  }
                },
                safeguardingCompetency: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  }
                },
                starStructureReview: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING },
                    details: { type: Type.STRING }
                  }
                },
                cefrAlignment: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING },
                    reasoning: { type: Type.STRING }
                  }
                },
                readiness: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING },
                    justification: { type: Type.STRING }
                  }
                },
                teacherPlan: {
                  type: Type.OBJECT,
                  properties: {
                    speakingDrills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    safeguardingTasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                    practicePrompts: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  }

  async getChatResponse(systemInstruction: string, history: any[]) {
    const contents = history.length > 0 
      ? history 
      : [{ role: 'user', parts: [{ text: "Hello, please begin the session." }] }];

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: { systemInstruction, temperature: 0.7 }
    });
    return response.text;
  }

  async generateSpeech(text: string, voiceName: string = 'Zephyr') {
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  }
}

export const gemini = new GeminiService();

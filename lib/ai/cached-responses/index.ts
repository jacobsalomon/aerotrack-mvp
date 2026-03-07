// Pre-cached fallback responses for demo reliability
// Used when ALL models in a fallback chain fail — the demo still works
// These responses are structurally identical to real AI outputs

import sessionAnalysis from "./session-analysis.json";
import generatedDocuments from "./generated-documents.json";
import verificationResult from "./verification-result.json";

export const cachedSessionAnalysis = sessionAnalysis;
export const cachedGeneratedDocuments = generatedDocuments;
export const cachedVerificationResult = verificationResult;

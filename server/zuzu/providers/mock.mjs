// Local provider for development. No network, environment access, credentials or SDK.
export const mockProvider = Object.freeze({
  async generate({ systemPrompt, message, history, session, signal, maxOutputChars }) {
    signal.throwIfAborted();
    const reply = "Local mock, not AI: I have inspected your question. My official finding is that snacks would improve this meeting.";
    return reply.slice(0, maxOutputChars);
  }
});

import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-5.4-mini",
  // This turn is a short, low-stakes decision (log the check-in? call one
  // tool? reply warmly in a sentence or two) — it doesn't need deep hidden
  // reasoning, and that reasoning time was the dominant cost in a measured
  // check-in turn (~8s between the stream opening and the first output).
  // "minimal" isn't a supported value for this model snapshot (AI Gateway
  // rejects it: only "none"/"low"/"medium"/"high"/"xhigh" are valid) — "low"
  // is the closest equivalent.
  reasoning: "low",
});

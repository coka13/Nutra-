-- OpenRouter now defaults to free models. Rows still on the previous paid default (never changed
-- by an administrator) move to the free list at zero cost; any other chosen model is kept.
UPDATE "AIProvider"
SET "textModel" = 'nvidia/nemotron-3.5-super-vl:free, nvidia/nemotron-3-ultra-550b-a55b:free, nvidia/nemotron-3.5-lightning:free, google/gemma-4-31b-it:free',
    "inputCostPerM" = 0,
    "outputCostPerM" = 0
WHERE "id" = 'openrouter' AND "textModel" = 'openai/gpt-4.1-mini';

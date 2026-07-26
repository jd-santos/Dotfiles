---
name: study-lyrics
description: Translates and studies user-provided song lyrics, especially between English and Spanish, using faithful and idiomatic alternatives, a reconciled recommendation, line-level language notes, and sourced cultural context. Use when the user pastes or shares lyric excerpts, asks what lyrics mean, or wants help with lyric translation, slang, grammar, imagery, culture, or history.
metadata:
  version: "1.0.0"
  category: workflow
---

# Skill: Study Lyrics

## Description

Analyze lyric text the user supplies. Treat translation, language learning, interpretation, and cultural context as parts of one workflow, while keeping the response proportional to the excerpt and the user's question.

## Instructions

### 1. Pre-flight checks

1. **Verify the input**: Work from lyrics present in the conversation. If the user provides only a song title or link, ask them to paste or share the relevant lines. Do not search for, reconstruct, or continue missing lyrics.
2. **Determine the direction**: Detect the source language and infer the target from context. For English lyrics, default to Spanish; for Spanish lyrics, default to English. State the assumption briefly. Ask one concise question only when the intended direction or locale is materially ambiguous.
3. **Preserve context**: Extract title, artist, link, and other metadata when the shared text includes them. Treat metadata as context, not as lyric text.
4. **Respect the source**: Preserve line breaks, repetitions, tense, point of view, explicit language, and ambiguity. Do not silently clean up or censor the excerpt.

### 2. Analyze the excerpt

1. Remove obvious share-sheet boilerplate without changing the lyric lines.
2. Assign stable line numbers so translations and notes remain aligned.
3. Create two translations independently from the source:
   - **Faithful**: Prioritize literal meaning, syntax, imagery, and ambiguity.
   - **Idiomatic**: Prioritize natural target-language phrasing while retaining tone, register, and intent.
4. Compare the candidates using semantic fidelity, naturalness, tone, metaphor, ambiguity, consistency, and completeness.
5. Produce a recommended translation. Select either candidate when it is clearly stronger, or reconcile them line by line when that produces a better result. Never introduce meaning that the source does not support.
6. Retain meaningful alternatives. Explain why the recommendation differs when the choice is not obvious.

### 3. Build the learning material

Explain only what adds value:

- words or phrases whose meaning is not captured by a direct gloss
- grammar, syntax, contractions, or wordplay
- slang, dialect, register, and regional usage
- metaphor, imagery, double meanings, and unresolved ambiguity
- cultural or historical context needed to understand the lines

For Spanish, identify a regional reading when it affects the translation. Do not imply that one regional variety is universally neutral. For mixed-language lyrics, analyze each line in its actual language.

Separate interpretation from fact. Phrase interpretive claims as readings supported by the text, not as the artist's confirmed intent.

### 4. Research factual context

Browse when the user requests cultural or historical depth, or when a factual claim is necessary to explain an idiom, event, person, place, tradition, or confirmed artist context.

1. Prefer primary or authoritative sources.
2. Cite each factual claim near the sentence it supports.
3. Use artist commentary only when a reliable source actually attributes the statement to the artist.
4. Never invent a citation or URL.
5. If browsing is unavailable or evidence is weak, label the material as unverified interpretation and keep it brief.

Do not browse merely to identify the song from a lyric fragment or to obtain additional lyrics.

### 5. Present the result

Lead with the useful result, not a description of the workflow.

For a short excerpt, use:

1. **Recommended translation**: Show the original and recommended lines side by side.
2. **Alternatives**: Show the faithful and idiomatic versions only where they meaningfully differ.
3. **Language notes**: Tie each note to a line number.
4. **Context**: Include cultural, historical, or interpretive context only when it clarifies the excerpt.

For longer excerpts, group the analysis by stanza and keep every source line accounted for. Keep routine observations out of the response. Invite a follow-up about a particular line only when deeper exploration would be useful.

### 6. Handle follow-ups

Maintain the established line numbers, translation direction, locale, and song context. Answer the new question directly instead of repeating the full analysis. When the user changes an interpretation or supplies more context, revise the affected translation and dependent notes explicitly.

### 7. Error handling

- **No lyric text**: Ask the user to paste the excerpt.
- **Unclear language or target**: State what is ambiguous and ask one focused question.
- **Several credible meanings**: Preserve the ambiguity and explain the alternatives rather than forcing certainty.
- **Unsupported factual context**: Omit it or label it as interpretation.
- **Very long input**: Work stanza by stanza, preserve line coverage, and summarize cross-stanza themes after the translations.
- **Explicit or sensitive language**: Translate it faithfully and explain register without moralizing. If a model or tool refuses, report the limitation and offer a narrower line-level analysis. Never fabricate or silently sanitize an answer.
- **Request for missing or complete lyrics**: Explain that the skill analyzes user-provided text and ask for the relevant excerpt.

## Examples

### Shared English excerpt

**User:** "Use study-lyrics on these Apple Music lines and translate them into Mexican Spanish."

**Result:** Strip the share link and attribution from the lyric text, provide the recommended aligned translation, retain meaningful faithful and idiomatic alternatives, then explain any grammar, imagery, or regional choices.

### Spanish slang

**User:** "What does this mean in English, and what should I learn from it? `Me fui de pinta por el barrio / y la luna me cobró la renta.`"

**Result:** Explain the regional reading of `irse de pinta`, translate both lines without flattening the imagery, distinguish literal meaning from interpretation, and research the idiom only if a factual regional claim needs support.

### Follow-up

**User:** "Why did you translate line 2 that way? Could it sound more poetic?"

**Result:** Revisit line 2 only, explain the tradeoff, and offer a more poetic alternative without repeating the entire excerpt analysis.

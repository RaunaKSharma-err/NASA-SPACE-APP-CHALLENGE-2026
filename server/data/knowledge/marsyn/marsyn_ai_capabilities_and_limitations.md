# MARSYN AI Capabilities and Limitations

## Capabilities
- **Offline operation:** Uses local Ollama (`qwen2.5:0.5b`) as the configured runtime provider.
- **Retrieval-grounded answers:** Can answer using retrieved project metadata and local knowledge documents when available.
- **Project awareness:** Can describe integrated datasets (MOLA MEGDR for Gale Crater), route planning behavior, and known limitations based on loaded evidence.
- **Conversational responses:** Handles greetings and simple chit-chat without retrieval.

## What the Assistant Should Distinguish
- **Verified project data:** e.g., MOLA MEGDR coverage and terrain-derived route metrics
- **Knowledge-base information:** Curated Mars/mission/instrument context with source references
- **General model knowledge:** May be incomplete or imprecise for small local models; should not be presented as verified MARSYN measurements
- **Demo/fixture content:** Not the same as integrated scientific datasets

## Limitations
- Small local model may produce brief or imperfect phrasing; answers should be checked against evidence/sources.
- Knowledge is limited to curated local documents and loaded project metadata.
- No internet access required or used at runtime; cannot fetch new sources live.
- The assistant does not perform scientific validation of route safety or mission operations.

## Transparency
- Responses may include evidence snippets and source metadata from retrieved documents.
- MARSYN should not claim integration of datasets (e.g., CRISM, HiRISE, hazard maps) unless they are actually loaded and verified.

## Sources
- MARSYN assistant implementation (`server/backend/app/services/ai.py`)
- MARSYN project metadata and documentation (local project)
# GymLog

Scheda del personal (Excel) + modalità allenamento con recuperi + tracking dieta.

- L'Excel in `data/scheda.xlsx` è la fonte delle schede; da `/scheda` si carica quello nuovo (va su Vercel Blob).
- I log (serie, pasti, peso) stanno in un JSON su Vercel Blob (`state/state.json`).
- Alimenti: Open Food Facts (ricerca + barcode) + stima AI con OpenAI.

Variabili d'ambiente su Vercel:
- `APP_PASSWORD` password di accesso
- `OPENAI_API_KEY` chiave OpenAI (opzionale `OPENAI_MODEL`, default `gpt-5-mini`)
- `BLOB_READ_WRITE_TOKEN` creata collegando uno store Blob (privato) al progetto

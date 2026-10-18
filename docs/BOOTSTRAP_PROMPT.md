CONTINUE the "Tel Baghdad AI Sales Assistant" project. Do not redo what exists.
1. Read docs/ROADMAP.md (source of truth), PROJECT_STATE.md, docs/CONTRACTS.md,
   docs/ARCHITECTURE.md, docs/CONVENTIONS.md, and docs/ESCALATION.md if it exists.
2. Run `git status` and `git log --oneline -10`. If the repo state disagrees with
   PROJECT_STATE.md, trust the repo, and say so in Arabic.
3. If docs/ESCALATION.md exists and is unresolved: tell me in Arabic what the problem is and
   which model I should use, then STOP.
4. Otherwise execute ONLY the first unchecked batch in docs/ROADMAP.md, following every
   Standing rule there. Work sequentially. Write files immediately.
5. Finish with the End-of-batch procedure from docs/ROADMAP.md (checks with full output,
   tick the batch, update PROJECT_STATE.md, commit, Arabic summary, recommended model, and
   print this same prompt again). Then STOP.
Never run destructive commands. Never write "تقنية بغداد" or "تقنية العراق".

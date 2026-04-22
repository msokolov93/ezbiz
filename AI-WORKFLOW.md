# AI Workflow & Collaboration (`AI-WORKFLOW.md`)

This document outlines the AI tools, methodologies, and collaboration dynamics used during the development of the EasyBiz Reconciliation PoC. 

## 🛠️ AI Tools Used
* **Gemini:** Utilized for high-level architectural brainstorming, common-sense advice, and mapping out the general layout of the application.
* **Claude Code (Agentic):** Handled the heavy lifting for environment setup (NPM, Docker), fixing dependencies, and fine-tuning the codebase (e.g., cross-referencing frontend functions with API requirements and PostgreSQL schemas).
* **Claude / Gemini (Web):** Used concurrently to increment hypotheses and iterate on logic. 
* *(Note: This multi-model approach provided excellent, rapid results while keeping costs down, avoiding the need to provision more expensive models.)*

## 🛑 When I Overrode the AI (And Why)
**The "Yes-Man" Automation Trap**
At one point, the AI successfully generated a backend script that ingested data, estimated matches, and provided a fully reconciled output. However, it was rigidly optimized for a *single, perfect use-case*. 

* **Why I overrode it:** The AI acted as a "yes-man," delivering a mathematically correct but functionally narrow solution with a glamorous presentation. In real-world accounting, perfectly matching numbers is the easy part; the actual work is resolving edge cases by digging into agreements or email chains. Because the AI failed to account for this real-world flexibility, I overrode its approach. I restructured the project to pull back on backend automation and instead focus the PoC heavily on the human-in-the-loop UX (the swipe interface).

## ⚡ When the AI Saved Me Hours
**First-Time Setup & System-Wide Refactoring**
While the AI struggled with nuanced accounting reality, it was an incredible accelerator for chore work and boilerplate. It saved countless hours by:
* **Environment Setup:** Instantly resolving initial boilerplate, Docker configurations, and complex NPM dependency conflicts.
* **Library Discovery:** Rapidly proposing the right libraries for very specific functional requirements.
* **Contextual Refactoring:** Whenever a core operation or data structure changed within the application, the AI was able to track that logic and make short, but highly significant, cascading changes across the entire application instantly.

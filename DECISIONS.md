# DECISIONS.md

Core architectural and product decisions for the EasyBiz Reconciliation Proof of Concept (PoC).

## ⚖️ Tradeoffs
* **Iterative over Extreme Programming:** Minimized rigid upfront design in favor of progressive development to keep the PoC adaptable to future pivots.
* **AI Assistance vs. Cost/Ownership:** Leveraged multiple AI models for speed, balanced by strict human oversight to control subscription budgets and retain architectural ownership.
* **Raw Data over ETL:** Skipped robust data ingestion/ETL pipelines; opted to read directly from raw `.json` and `.csv` files for speed.
* **Layered vs. Fully Automated Matching:** Automated only obvious exact matches; deferred difficult and ambiguous matches to a human-in-the-loop "Tinder-swipe" UI.

## ✂️ Scope Cuts
* **Analytics & BI:** Cut heavy dashboards, deep analytics, and third-party integrations to focus purely on testing the novel reconciliation UX (views, clicks, customer feel).
* **Complex Algorithmic Matching:** Avoided probabilistic matching, intentionally pushing ambiguities to the manual UI.

## 🛑 Deferred Accounting Edge Cases (And Why)
* **Multi-Transaction/Multi-Invoice Pooling:** Enforced a strict "per-invoice" resolution to bypass the complexity of partial refunds and staggered transaction pooling.
* **Floating Credit Balances:** Simplified credit notes by having them point directly to a `related_invoice_id`, avoiding the complex lifecycle of independent unapplied credits.
* **Deep Exceptions (FX, missing refs):** Kept these out of backend automation specifically to validate how easily a user can handle these edge cases manually via the swipe interface.

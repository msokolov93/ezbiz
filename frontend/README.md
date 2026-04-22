# Frontend

React single-page application bundled with Webpack and served by Nginx.

## Login

The app is fully gated behind a login form. Credentials are verified against the backend and a JWT is stored in `sessionStorage` for the duration of the browser session. The token is sent with every API request. Sign Out clears the token and returns to the login screen.

## Company filter

A dropdown at the top of the page lists every unique company present across all invoices. Selecting a company filters both tables to show only that company's invoices. Selecting **ALL** restores the full view.

When a company is selected, a summary bar appears showing:
- **Total** — sum of all invoice totals for that company
- **Paid** — sum of all amounts reconciled so far
- **Difference** — remaining outstanding balance (green when zero, red when positive)

## Reconciled invoices table

Shows invoices with `status = paid`. Clicking a row expands an inline JSON panel with the full invoice details fetched from the API. Clicking again collapses it.

## Unreconciled invoices table

Shows invoices still requiring payment (`open` or `partially_paid`). Clicking a row:

1. Selects it as the active invoice for the transaction matcher below
2. Expands the same inline JSON detail panel

The **Amount Paid** column updates live as you swipe transactions in the matcher — no page reload needed. When the running total meets or exceeds the invoice total, the row turns green.

## Transaction matcher

A Tinder-style card swiper that appears once an invoice is selected.

- Each card shows the full transaction JSON and a counter (e.g. **Transaction 3/19**) so you always know where you are in the stack
- **Swipe right / Match** — marks this transaction as a match for the selected invoice
- **Swipe left / Skip** — moves past without matching
- **Undo** — restores the last swiped card

Matched transactions are excluded from the stack when you switch to a different invoice, so the same transaction cannot be matched twice in the same session.

## Complete Work

Once you are satisfied with your matches, click **Complete Work**. The app sends one `POST /api/reconcile` request per right-swipe in order, then reloads the page to reflect the updated state from the database. Requires `admin` role.

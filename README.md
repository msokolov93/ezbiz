# ReconSwipe

A three-module financial reconciliation app that matches incoming bank transactions against outstanding invoices.
Choose a plane - by Company or All; Choose Invoice that needs reconcilation, Swipe on lonely transactions for a match! 

## Modules

| Folder | Role |
|--------|------|
| `frontend/` | React UI served by Nginx |
| `backend/` | Fastify REST API + ingestion engine |
| `database/` | PostgreSQL schema |

All three run as Docker containers orchestrated by `docker-compose.yml`. They communicate over an internal Docker network, so each module can be moved to a separate host by updating the connection strings in `.env`.

## Environment variables

Copy `example.env` to `.env` and adjust before first run (`firstrun.sh` does this automatically if `.env` is missing).

| Variable | Purpose |
|----------|---------|
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Postgres credentials |
| `DATABASE_URL` | Full connection string used by the backend |
| `JWT_SECRET` | Secret used to sign login tokens |
| `ADMIN_PASSWORD` | Reserved for future admin operations |
| `FRONT_USER` / `FRONT_EMAIL` / `FRONT_ROLE` | Credentials for the seeded app user |

## First run

```bash
bash firstrun.sh
```

- Installs Docker if not already present
- Copies `example.env` to `.env` if missing
- Builds and starts all containers

Once running:
- Frontend is available at **http://localhost:80**
- Login credentials are written to **`backend/output/access.json`** after the first successful ingestion

## Redeployment

```bash
./redeploy.sh
```

`redeploy.sh` always runs `docker compose down -v` before rebuilding, which wipes the database volume and re-runs ingestion from the input files. This is intentional during development — use proper migrations before moving to production.

## What is missing

Right now there is no verification of customer state or deduplication of API requests. 
In future, injestion and analytical service can grow into standalone application and become more sophisticated than just algorythm boiled down from edge cases in example.
General assumption was made, that invoices needed reconciliation. In future user story might change to transaction reconciliation or moving funds between overpaid invoices. Integration with mail services, billing systems and fully-developed SaaS features.
Overall this solution strikes a balance between PoC for a bold idea and replaceable parts for it. 

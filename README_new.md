# Sevil Kids Backend Notes

## Scope Of The Latest Fixes

This pass did not replace the project architecture. The work was limited to stabilizing the current NestJS/TypeScript/Prisma codebase and preserving the already-added:

- persistent chat sessions
- booking drafts
- payment finalization
- bot/human handoff
- Bitrix Open Lines ready scaffolding

## Main Bug That Was Fixed

### Symptom

Incoming WhatsApp messages were processed, the backend generated a reply, logs showed `[OUTBOUND:BOT]`, but the client never received the message in real WhatsApp.

### Actual Cause

The outbound layer did not have a reliable direct send path to `whatsapp-web.js`.

In practice, the old router could:

- log outbound activity
- create or expect DB queue items
- skip real delivery when transport was not used directly

So logs could look healthy while `client.sendMessage(...)` never happened for the live chat.

### What Was Changed

In [src/modules/whatsapp/outbound-router.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/outbound-router.service.ts):

- added direct transport registration for live WhatsApp delivery
- kept DB-backed message logging and queue support
- added explicit target resolution
- added explicit skip reasons for blocked bot replies
- added explicit success/error logging with target and message id

In [src/modules/whatsapp/whatsapp.client.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.client.ts):

- registered the router transport with `client.sendMessage(...)`
- preserved the background worker for pending queued messages
- added queue send success/failure logs

## Current WhatsApp Outbound Logic

Target resolution order:

1. `session.whatsappChatId`
2. `session.externalChatId`
3. `${normalizedPhone}@c.us`

Incoming messages now keep the real WhatsApp chat id in the session, so the bot does not depend only on a normalized phone number.

## Built-In Chat Console

A simple internal chat console is now available at:

- `GET /api/whatsapp/console`

The page uses the existing backend and embedded WhatsApp transport, so manual messages sent from the console are delivered from the same authorized WhatsApp number that `whatsapp-web.js` is using.

Console login:

- login: `sevilkids`
- password: `sevil2026`

Console startup flow:

1. open the console page
2. enter console credentials
3. if the WhatsApp session is not authorized yet, the page shows QR
4. after QR scan and `ready` state, chats and manual sending become available

Important runtime note:

- `npm run dev` already starts the embedded WhatsApp client inside the Nest backend
- `npm run wa:test` should not be run in parallel with `npm run dev`
- running both at the same time can break the Puppeteer/WhatsApp session and cause `Execution context was destroyed` or `browser is already running` errors

Console API:

- `POST /api/whatsapp/console/login`
- `GET /api/whatsapp/console/status`
- `GET /api/whatsapp/chats`
- `GET /api/whatsapp/chats/:sessionKey/messages`
- `POST /api/whatsapp/chats/:sessionKey/send`
- `POST /api/whatsapp/chats/:sessionKey/bot-toggle`

Per-chat bot toggle behavior:

- on: set chat back to `AUTO`
- off: move chat to `HUMAN`

So switching the toggle off disables automatic bot replies for that chat only, while preserving manual sending from the console.

Latest console stabilization:

- the UI is now fully Russian
- chat selection no longer depends only on a Prisma session id
- console routing now uses a stable `sessionKey` (`session.id` or fallback `normalizedPhone`)
- this means chat opening, manual sending, and bot toggle continue to work even when Prisma is temporarily disconnected
- if Prisma is down, message history falls back to a temporary JSON file in `runtime/whatsapp-history.json`
- that temporary JSON history is cleared automatically on every backend start

## Chat Mode Rules

### `AUTO`

- bot replies are allowed

### `HUMAN`

- bot does not reply to the client
- operator replies can still be sent to WhatsApp

### `ASSIST`

- bot does not reply to the client
- reserved for operator-assist flows

### `WAITING_OPERATOR`

- bot does not continue the normal dialog
- session stays available for operator completion

Mode flag handling was stabilized in [src/modules/whatsapp/whatsapp.session.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.session.ts) so returning a chat to `AUTO` restores bot reply capability predictably.

## Booking Draft / Payment / Finalization

The current draft-first flow remains intact:

- no early Dentist Plus visit for prepayment scenarios
- booking draft keeps collected service/date/time/patient context
- operator can continue the scenario after handoff
- manual payment confirmation finalizes the real visit later

Main implementation files:

- [src/modules/whatsapp/booking-draft.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/booking-draft.service.ts)
- [src/modules/whatsapp/whatsapp.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.service.ts)
- [prisma/schema.prisma](/C:/Users/Acer/Desktop/crm-api/prisma/schema.prisma)

## Bitrix Open Lines / Local App Preparation

This project is now ready for the next integration step, but not falsely advertised as fully connected.

Prepared endpoints:

- `POST /api/whatsapp/bitrix/openline/install`
- `POST /api/whatsapp/bitrix/openline/app-event`
- `POST /api/whatsapp/bitrix/openline/delivery`
- `POST /api/whatsapp/bitrix/operator-message`
- `POST /api/whatsapp/bitrix/operator-event`
- `POST /api/whatsapp/sessions/:sessionId/mode`
- `POST /api/whatsapp/bookings/:draftId/confirm-payment`

Prepared service:

- [src/modules/integrations/bitrix/bitrix-openlines.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/integrations/bitrix/bitrix-openlines.service.ts)

Install callback parsing details:

- manual JSON `POST` tests without OAuth fields are expected to return `hasAuthPayload: false`
- real Bitrix local app install callback is sent automatically by Bitrix and may use `application/json` or `application/x-www-form-urlencoded`
- supported auth sources now include:
  - `body.auth.access_token`
  - `body.auth.refresh_token`
  - `body.AUTH_ID`
  - `body.REFRESH_ID`
  - form-style keys like `auth[access_token]`, `auth[refresh_token]`
- install logs now include:
  - `event`
  - `contentType`
  - `bodyKeys`
  - `memberId`
  - `domain`
  - masked auth preview
- full tokens are not logged
- install auth is now persisted in Prisma and survives backend restarts
- after successful auth persistence the backend automatically attempts `imconnector.register`
- after successful registration the backend automatically attempts `imconnector.activate`
- if `BITRIX_OPENLINE_LINE_ID` is missing, activation is skipped and logs explicitly say that install/auth is ready but line id is missing
- persisted install auth is stored in the `BitrixAppInstallation` table

Still required before production Open Lines activation:

- public HTTPS URL
- Bitrix local app credentials
- line binding / activation if `BITRIX_OPENLINE_LINE_ID` is not configured yet
- real operator event payload mapping from the deployed Bitrix app

## Environment Variables

```env
DATABASE_URL=
DENTIST_API_BASE_URL=
DENTIST_API_LOGIN=
DENTIST_API_PASSWORD=
BITRIX_WEBHOOK_URL=
BITRIX_DEFAULT_ASSIGNED_BY_ID=1
DEFAULT_BRANCH_ID=5061
DEFAULT_PATIENT_LASTNAME=Patient

BOT_HANDOFF_ENABLED=true
BITRIX_OPENLINE_ENABLED=false
BITRIX_OPENLINE_CONNECTOR_ID=
BITRIX_OPENLINE_LINE_ID=
BITRIX_OPENLINE_APP_MODE=webhook
BITRIX_OPENLINE_PUBLIC_BASE_URL=
ETHICS_CODE_URL=
PAYMENT_MANUAL_CONFIRMATION_ENABLED=true
BOOKING_DRAFT_FORCE_ALL=false
BOOKING_DRAFT_EXPIRY_MINUTES=90
```

After successful install callback the flow is now:

1. normalize and validate install payload
2. persist OAuth install data in Prisma
3. attempt `imconnector.register` automatically
4. attempt `imconnector.activate` automatically if `BITRIX_OPENLINE_LINE_ID` is configured

If `BITRIX_OPENLINE_LINE_ID` is missing, that does not block auth persistence or connector registration; only activation is skipped with an explicit log.

## Exact Clinic Scripts

The clinic texts are centralized in:

- [src/modules/whatsapp/whatsapp.script-catalog.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.script-catalog.ts)

The purpose is to keep the provided clinic scripts centralized instead of scattering business text across service logic.

## Commands Run

```bash
npm install
npx prisma generate
npm run build
node -e "require('./dist/app.module.js'); console.log('app-module-ok')"
```

Also attempted:

```bash
npx prisma migrate dev --name whatsapp_handoff_booking_drafts
```

That migration command may still fail depending on your local Prisma engine / DB environment. Fallback SQL is available at:

- [prisma/migration_whatsapp_handoff_booking_drafts.sql](/C:/Users/Acer/Desktop/crm-api/prisma/migration_whatsapp_handoff_booking_drafts.sql)
- [prisma/migration_bitrix_app_installation.sql](/C:/Users/Acer/Desktop/crm-api/prisma/migration_bitrix_app_installation.sql)

## Files Changed In This Stabilization Pass

- [src/modules/whatsapp/outbound-router.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/outbound-router.service.ts)
- [src/modules/whatsapp/whatsapp.client.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.client.ts)
- [src/modules/whatsapp/whatsapp.session.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.session.ts)
- [src/modules/whatsapp/whatsapp.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.service.ts)
- [src/modules/whatsapp/whatsapp.controller.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.controller.ts)
- [src/modules/integrations/bitrix/bitrix-openlines.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/integrations/bitrix/bitrix-openlines.service.ts)
- [README.md](/C:/Users/Acer/Desktop/crm-api/README.md)
- [README_new.md](/C:/Users/Acer/Desktop/crm-api/README_new.md)

## What Still Needs Real External Setup

- working `DATABASE_URL`
- working `BITRIX_WEBHOOK_URL`
- real Bitrix local app credentials and callback mapping
- real public HTTPS deployment URL
- `ETHICS_CODE_URL`
- optional payment webhook provider integration

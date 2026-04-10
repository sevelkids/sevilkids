# CRM API

NestJS/TypeScript/Prisma backend for Sevil Kids with WhatsApp, Dentist Plus, Bitrix CRM, booking drafts, payment finalization, and bot-to-operator handoff support.

See the detailed implementation notes in [README_new.md](/C:/Users/Acer/Desktop/crm-api/README_new.md).

## What Was Fixed

- Fixed the main outbound WhatsApp bug: `OutboundRouterService` no longer treats `[OUTBOUND:BOT]` log lines as a successful send.
- Restored real WhatsApp delivery through `whatsapp-web.js` by registering a direct outbound transport in [src/modules/whatsapp/whatsapp.client.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.client.ts).
- Preserved queue-based delivery and message log persistence through `ChatMessageLog`.
- Stabilized chat modes so a session switched back to `AUTO` can reply again.
- Added honest app-ready Bitrix Open Lines endpoints for future local app / install flow.
- Added a built-in chat console page for manual chat handling.

## Root Cause Of The Outbound Bug

The previous outbound flow could log `[OUTBOUND:BOT]` without actually calling `client.sendMessage(...)`.

This happened because the old router depended on DB-backed pending messages and did not have a direct WhatsApp transport path. If Prisma was unavailable, or if the message was only logged but not really dispatched, the bot looked active in logs but nothing reached the real WhatsApp chat.

## How WhatsApp Target Is Chosen Now

Outbound target resolution is centralized in [src/modules/whatsapp/outbound-router.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/outbound-router.service.ts).

Priority order:

1. `session.whatsappChatId`
2. `session.externalChatId`
3. fallback `${normalizedPhone}@c.us`

The real chat target from `message.from` is saved into the session on every incoming WhatsApp message.

## Chat Modes

- `AUTO`: bot replies are allowed
- `HUMAN`: bot does not reply to the client; operator replies are allowed
- `ASSIST`: bot does not reply to the client; reserved for operator-assist scenarios
- `WAITING_OPERATOR`: bot does not continue the normal dialog while the chat is waiting for a human

## Chat Console UI

The backend now exposes a simple built-in chat console at:

- `GET /api/whatsapp/console`

When the backend starts, it also logs the local console URL. In non-production mode it tries to open the console automatically in an extra browser tab/window.

Console capabilities:

- login screen before console access
- WhatsApp client status and QR display
- list tracked chats
- open a chat and read message history
- send manual messages through the currently authorized WhatsApp number
- toggle bot replies per chat
- Russian UI for the built-in chat page
- stable chat routing even when Prisma is temporarily unavailable and a session has no DB `id`

New endpoints used by the console:

- `GET /api/whatsapp/chats`
- `GET /api/whatsapp/chats/:sessionKey/messages`
- `POST /api/whatsapp/chats/:sessionKey/send`
- `POST /api/whatsapp/chats/:sessionKey/bot-toggle`

Current temporary console credentials:

- login: `sevilkids`
- password: `sevil2026`

If the WhatsApp session is not authorized yet, the console first shows the QR code. Chats and manual sending become available only after the authorized number scans the QR and the embedded WhatsApp client reaches `ready`.

`npm run dev` already starts both:

- the Nest backend
- the embedded WhatsApp client used by the console

So `npm run wa:test` is only a separate fallback/debug path and should not be run together with `npm run dev`, otherwise both processes will fight for the same `.wwebjs_auth` session.

Bot toggle behavior:

- enabled: chat is moved to `AUTO`
- disabled: chat is moved to `HUMAN`

That means when the toggle is off, the bot will stop auto-replying to that specific number, while manual messages from the console can still be sent out through the authorized WhatsApp session.

New chats start in `AUTO`.

Mode changes are handled in [src/modules/whatsapp/whatsapp.session.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.session.ts) and [src/modules/whatsapp/whatsapp.controller.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.controller.ts).

If `DATABASE_URL` is invalid or Prisma is disconnected:

- chats can still appear from in-memory WhatsApp sessions
- manual sending still works
- bot toggle still works
- message history falls back to a temporary JSON runtime file
- that JSON history is cleared automatically on every backend start

In that case the console routes chats by a stable `sessionKey` (`session.id` or `normalizedPhone`) instead of relying only on a DB id.

## Booking Draft / Payment Flow

The existing late-finalization flow was preserved:

- booking drafts are stored in Prisma
- payment-dependent scenarios do not create Dentist Plus visits too early
- manual payment confirmation finalizes the real Dentist Plus visit
- Bitrix sync remains in place

Key files:

- [src/modules/whatsapp/booking-draft.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/booking-draft.service.ts)
- [src/modules/whatsapp/whatsapp.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.service.ts)

## Exact Clinic Scripts

The clinic texts are centralized in [src/modules/whatsapp/whatsapp.script-catalog.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.script-catalog.ts).

They were kept as catalog entries so the business scripts are not scattered across the logic.

## Bitrix Open Lines / Local App Readiness

This codebase is prepared for a future Bitrix local app / Open Lines connector flow, but it does not pretend that production Open Lines is already fully connected.

Current app-ready endpoints:

- `POST /api/whatsapp/bitrix/openline/install`
- `POST /api/whatsapp/bitrix/openline/app-event`
- `POST /api/whatsapp/bitrix/openline/delivery`
- `POST /api/whatsapp/bitrix/operator-message`
- `POST /api/whatsapp/bitrix/operator-event`
- `POST /api/whatsapp/sessions/:sessionId/mode`
- `POST /api/whatsapp/bookings/:draftId/confirm-payment`

Install callback behavior:

- manual JSON tests like `{"event":"ONAPPINSTALL"}` usually do not include OAuth install data, so `hasAuthPayload` will correctly remain `false`
- real Bitrix local app install callback is sent automatically by Bitrix and may arrive as either `application/json` or `application/x-www-form-urlencoded`
- the backend now extracts auth from nested `auth.access_token` / `auth.refresh_token`, alternative `AUTH_ID` / `REFRESH_ID`, and form keys like `auth[access_token]`
- install debug logs now show `event`, `content-type`, `bodyKeys`, `memberId`, `domain`, and a masked auth preview without printing full tokens
- install auth payload is now persisted in Prisma and survives backend restarts
- after successful auth persistence the backend automatically attempts `imconnector.register`
- after successful registration the backend automatically attempts `imconnector.activate`
- if `BITRIX_OPENLINE_LINE_ID` is missing, auth persistence still succeeds and activation is skipped with an explicit log message
- connector auth is stored in the `BitrixAppInstallation` table

Before real Bitrix local app activation you still need:

- public HTTPS base URL
- Bitrix local app install flow
- real Open Line binding if `BITRIX_OPENLINE_LINE_ID` is still empty

## Required Environment Variables

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

## Local Commands

```bash
npm install
npx prisma generate
npx prisma migrate dev --name bitrix_app_installation
npm run build
```

If `prisma migrate dev` fails in your local environment, use the fallback SQL:

- [prisma/migration_bitrix_app_installation.sql](/C:/Users/Acer/Desktop/crm-api/prisma/migration_bitrix_app_installation.sql)

## Verified Locally

- `npm install`
- `npx prisma generate`
- `npm run build`
- `node -e "require('./dist/app.module.js'); console.log('app-module-ok')"`

## Important Files

- [prisma/schema.prisma](/C:/Users/Acer/Desktop/crm-api/prisma/schema.prisma)
- [src/modules/whatsapp/whatsapp.client.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.client.ts)
- [src/modules/whatsapp/outbound-router.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/outbound-router.service.ts)
- [src/modules/whatsapp/whatsapp.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.service.ts)
- [src/modules/whatsapp/whatsapp.session.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.session.ts)
- [src/modules/whatsapp/whatsapp.controller.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/whatsapp/whatsapp.controller.ts)
- [src/modules/integrations/bitrix/bitrix-openlines.service.ts](/C:/Users/Acer/Desktop/crm-api/src/modules/integrations/bitrix/bitrix-openlines.service.ts)

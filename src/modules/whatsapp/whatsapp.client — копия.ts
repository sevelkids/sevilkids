import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';

const BACKEND_URL = 'http://localhost:3000';
const GEMINI_API_KEY = 'AIzaSyDSb5IQ7JEAIa8FqKVXEckUZF2dCRwfTOU';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type Language = 'ru' | 'kk';

type PatientLookupResponse =
    | {
    id?: number;
    patientId?: number;
    fullName?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    phone?: string;
}
    | null;

type CreatePatientResponse = {
    id?: number;
    patientId?: number;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
};

type ParsedIntent = {
    language: Language;
    intent:
        | 'greeting'
        | 'ask_services'
        | 'ask_price'
        | 'choose_service'
        | 'booking_request'
        | 'provide_datetime'
        | 'choose_doctor'
        | 'cancel_request'
        | 'reschedule_request'
        | 'unknown';
    service: 'consultation' | 'cleaning' | null;
    cleaning_type:
        | 'light_milk_bite'
        | 'medium_milk_bite'
        | 'airflow_glycine_upto9'
        | 'airflow_glycine_10_16'
        | 'prophylaxis_master'
        | null;
    age: number | null;
    datetime_text: string | null;
    doctor_preference: 'any' | 'specific' | null;
    needs_clarification: boolean;
    clarification_for: 'service' | 'datetime' | 'age' | 'cleaning_type' | null;
};

type ChatSession = {
    language: Language;
    greeted: boolean;
    patientChecked: boolean;
    patientFound: boolean;
    patientId: number | null;
    patientName: string | null;
    awaitingName: boolean;
    creatingPatient: boolean;
    awaitingConsultationAge: boolean;
    awaitingCleaningType: boolean;
    awaitingDateTime: boolean;
    awaitingBookingConfirmation: boolean;
    selectedService: 'consultation' | 'cleaning' | null;
    selectedCleaningType:
        | 'light_milk_bite'
        | 'medium_milk_bite'
        | 'airflow_glycine_upto9'
        | 'airflow_glycine_10_16'
        | 'prophylaxis_master'
        | null;
    selectedPrice: number | null;
    selectedDateTimeText: string | null;
};

const sessions = new Map<string, ChatSession>();
const processedMessages = new Set<string>();

function getSession(phone: string): ChatSession {
    if (!sessions.has(phone)) {
        sessions.set(phone, {
            language: 'ru',
            greeted: false,
            patientChecked: false,
            patientFound: false,
            patientId: null,
            patientName: null,
            awaitingName: false,
            creatingPatient: false,
            awaitingConsultationAge: false,
            awaitingCleaningType: false,
            awaitingDateTime: false,
            awaitingBookingConfirmation: false,
            selectedService: null,
            selectedCleaningType: null,
            selectedPrice: null,
            selectedDateTimeText: null,
        });
    }
    return sessions.get(phone)!;
}

function normalizePhone(phone: string): string {
    let value = String(phone).trim().replace(/[^\d+]/g, '');

    if (value.startsWith('+7') && value.length === 12) {
        value = '8' + value.slice(2);
    } else if (value.startsWith('7') && value.length === 11) {
        value = '8' + value.slice(1);
    }

    return value;
}

function extractPhoneNumber(from: string): string {
    return from.replace('@c.us', '').trim();
}

function getPatientName(data: PatientLookupResponse): string | null {
    if (!data) return null;
    if (data.fullName) return data.fullName;
    if (data.name) return data.name;

    const parts = [data.lastName, data.firstName, data.middleName].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
}

function getDisplayName(patient: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
} | null): string | null {
    if (!patient) return null;

    const firstName = patient.firstName?.trim() || null;
    const lastName = patient.lastName?.trim() || null;

    if (lastName === 'Пациент' && firstName) {
        return firstName;
    }

    if (firstName) {
        return firstName;
    }

    if (patient.fullName) {
        const parts = patient.fullName.trim().split(/\s+/);
        if (parts.length >= 2 && parts[0] === 'Пациент') {
            return parts[1];
        }
        return parts[0] || patient.fullName;
    }

    return null;
}

function t(lang: Language, ru: string, kk: string): string {
    return lang === 'kk' ? kk : ru;
}

function getMainGreeting(lang: Language, name?: string | null): string {
    if (name) {
        return t(
            lang,
            `${name}, здравствуйте! Я бот Жансая клиники Sevil Kids. Помогу вам с записью на приём. Сейчас у нас доступны консультация и чистка. Что вас интересует?`,
            `${name}, сәлеметсіз бе! Мен Sevil Kids клиникасының Жансая ботымын. Қабылдауға жазылуға көмектесемін. Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар. Сізді қайсысы қызықтырады?`,
        );
    }

    return t(
        lang,
        'Здравствуйте! Я бот Жансая клиники Sevil Kids. С радостью помогу вам с записью на приём. Сейчас у нас доступны консультация и чистка. Что вас интересует?',
        'Сәлеметсіз бе! Мен Sevil Kids клиникасының Жансая ботымын. Қабылдауға жазылуға көмектесемін. Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар. Сізді қайсысы қызықтырады?',
    );
}

function getNotFoundAskName(lang: Language): string {
    return t(
        lang,
        'Здравствуйте! Я бот Жансая клиники Sevil Kids. Не смогла найти вас в базе. Подскажите, пожалуйста, ваше имя, и я продолжу оформление записи.',
        'Сәлеметсіз бе! Мен Sevil Kids клиникасының Жансая ботымын. Сізді базадан таба алмадым. Жазылуды жалғастыру үшін атыңызды жаза аласыз ба?',
    );
}

function getAskNameAgain(lang: Language): string {
    return t(
        lang,
        'Подскажите, пожалуйста, ваше имя, чтобы я продолжила оформление записи.',
        'Жазылуды жалғастыру үшін атыңызды жаза аласыз ба?',
    );
}

function getServicesText(lang: Language): string {
    return t(
        lang,
        'Сейчас у нас доступны консультация и чистка. Что вас интересует?',
        'Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар. Сізді қайсысы қызықтырады?',
    );
}

function getConsultationAgePrompt(lang: Language): string {
    return t(
        lang,
        'Подскажите, пожалуйста, возраст пациента, чтобы я точно подсказала стоимость консультации.',
        'Консультация бағасын нақты айту үшін пациенттің жасын жаза аласыз ба?',
    );
}

function getConsultationPrice(lang: Language, age: number): string {
    if (age < 16) {
        return t(
            lang,
            'Стоимость консультации до 16 лет — 8 000 тг.',
            '16 жасқа дейінгі консультация құны — 8 000 тг.',
        );
    }

    return t(
        lang,
        'Стоимость консультации от 16 лет — 10 000 тг.',
        '16 жастан бастап консультация құны — 10 000 тг.',
    );
}

function getCleaningPriceList(lang: Language): string {
    return t(
        lang,
        [
            'По чистке у нас доступны такие варианты:',
            '• лёгкая (молочный прикус) — 10 000 тг',
            '• средняя (молочный прикус) — 16 000 тг',
            '• Air Flow с глицином (до 9 лет) — 25 000 тг',
            '• Air Flow с глицином (10–16 лет) — 35 000 тг',
            '• Prophylaxis Master — 50 000 тг',
            '',
            'Если хотите, я помогу подобрать подходящий вариант.',
        ].join('\n'),
        [
            'Тіс тазалау бойынша бізде мынадай нұсқалар бар:',
            '• жеңіл (сүт тістемі) — 10 000 тг',
            '• орташа (сүт тістемі) — 16 000 тг',
            '• Air Flow глицинмен (9 жасқа дейін) — 25 000 тг',
            '• Air Flow глицинмен (10–16 жас) — 35 000 тг',
            '• Prophylaxis Master — 50 000 тг',
            '',
            'Қаласаңыз, сізге лайықты нұсқаны таңдауға көмектесемін.',
        ].join('\n'),
    );
}

function getCleaningTypePrompt(lang: Language): string {
    return t(
        lang,
        [
            'Қай түрі қызықтырады / Какой вариант вас интересует?',
            '• лёгкая (молочный прикус)',
            '• средняя (молочный прикус)',
            '• Air Flow с глицином (до 9 лет)',
            '• Air Flow с глицином (10–16 лет)',
            '• Prophylaxis Master',
        ].join('\n'),
        [
            'Қай нұсқа сізді қызықтырады?',
            '• жеңіл (сүт тістемі)',
            '• орташа (сүт тістемі)',
            '• Air Flow глицинмен (9 жасқа дейін)',
            '• Air Flow глицинмен (10–16 жас)',
            '• Prophylaxis Master',
        ].join('\n'),
    );
}

function getPostRegistrationPrompt(lang: Language, firstName: string): string {
    return t(
        lang,
        `${firstName}, отлично, я зарегистрировала вас в системе. Сейчас у нас доступны консультация и чистка. Что вас интересует?`,
        `${firstName}, керемет, мен сізді жүйеге тіркедім. Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар. Сізді қайсысы қызықтырады?`,
    );
}

function getAskDateTimeText(lang: Language, serviceLabel: string): string {
    return t(
        lang,
        `Хорошо, записываем на ${serviceLabel}. Подскажите, пожалуйста, удобную дату или время.`,
        `Жақсы, сізді ${serviceLabel} қызметіне жазамыз. Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?`,
    );
}

function getDateTimeAccepted(lang: Language, serviceLabel: string, datetimeText: string): string {
    return t(
        lang,
        `Приняла. Вы хотите записаться на ${serviceLabel} — ${datetimeText}. Сейчас следующим шагом я проверю доступные свободные окна и врачей.`,
        `Түсіндім. Сіз ${serviceLabel} қызметіне ${datetimeText} уақытына жазылғыңыз келеді. Келесі қадамда мен бос уақыттарды және қолжетімді дәрігерлерді тексеремін.`,
    );
}

function detectCleaningTypeFromText(text: string): ParsedIntent['cleaning_type'] {
    const lower = text.toLowerCase();

    if (lower.includes('prophylaxis')) return 'prophylaxis_master';
    if (lower.includes('air flow') || lower.includes('airflow')) {
        if (lower.includes('10') || lower.includes('16')) return 'airflow_glycine_10_16';
        return 'airflow_glycine_upto9';
    }
    if (lower.includes('лёгк') || lower.includes('жеңіл')) return 'light_milk_bite';
    if (lower.includes('средн') || lower.includes('орташа')) return 'medium_milk_bite';

    return null;
}

function getCleaningTypeLabel(lang: Language, type: NonNullable<ParsedIntent['cleaning_type']>): string {
    const mapRu: Record<NonNullable<ParsedIntent['cleaning_type']>, string> = {
        light_milk_bite: 'лёгкая чистка (молочный прикус)',
        medium_milk_bite: 'средняя чистка (молочный прикус)',
        airflow_glycine_upto9: 'Air Flow с глицином (до 9 лет)',
        airflow_glycine_10_16: 'Air Flow с глицином (10–16 лет)',
        prophylaxis_master: 'Prophylaxis Master',
    };

    const mapKk: Record<NonNullable<ParsedIntent['cleaning_type']>, string> = {
        light_milk_bite: 'жеңіл тазалау (сүт тістемі)',
        medium_milk_bite: 'орташа тазалау (сүт тістемі)',
        airflow_glycine_upto9: 'Air Flow глицинмен (9 жасқа дейін)',
        airflow_glycine_10_16: 'Air Flow глицинмен (10–16 жас)',
        prophylaxis_master: 'Prophylaxis Master',
    };

    return lang === 'kk' ? mapKk[type] : mapRu[type];
}

function getCleaningTypePrice(type: NonNullable<ParsedIntent['cleaning_type']>): number {
    const prices: Record<NonNullable<ParsedIntent['cleaning_type']>, number> = {
        light_milk_bite: 10000,
        medium_milk_bite: 16000,
        airflow_glycine_upto9: 25000,
        airflow_glycine_10_16: 35000,
        prophylaxis_master: 50000,
    };

    return prices[type];
}

async function askGeminiForIntent(text: string): Promise<ParsedIntent> {
    const prompt = `
Ты анализируешь входящие сообщения клиентов стоматологической клиники Sevil Kids.

Твоя задача:
- определить язык сообщения: ru или kk
- понять намерение клиента
- извлечь полезные параметры
- ничего не выдумывать

Возвращай только JSON без markdown.

Разрешенные intent:
- greeting
- ask_services
- ask_price
- choose_service
- booking_request
- provide_datetime
- choose_doctor
- cancel_request
- reschedule_request
- unknown

Разрешенные услуги:
- consultation
- cleaning

Разрешенные cleaning_type:
- light_milk_bite
- medium_milk_bite
- airflow_glycine_upto9
- airflow_glycine_10_16
- prophylaxis_master

Правила:
1. Клиника стоматологическая.
2. Нельзя придумывать другие услуги и специальности.
3. Если клиент пишет про консультацию — service = consultation.
4. Если клиент пишет про чистку / профгигиену / air flow — service = cleaning.
5. Если клиент спрашивает, какие услуги есть — intent = ask_services.
6. Если клиент спрашивает цену — intent = ask_price.
7. Если клиент пишет "без разницы" — doctor_preference = any.
8. Если в сообщении есть возраст — извлекай age.
9. Если есть слова про дату или время, положи исходный фрагмент в datetime_text.
10. Если данных недостаточно, не выдумывай.
11. language должен быть только "ru" или "kk".

Сообщение клиента:
"${text}"

Формат ответа:
{
  "language": "ru | kk",
  "intent": "greeting | ask_services | ask_price | choose_service | booking_request | provide_datetime | choose_doctor | cancel_request | reschedule_request | unknown",
  "service": "consultation | cleaning | null",
  "cleaning_type": "light_milk_bite | medium_milk_bite | airflow_glycine_upto9 | airflow_glycine_10_16 | prophylaxis_master | null",
  "age": number | null,
  "datetime_text": "string | null",
  "doctor_preference": "any | specific | null",
  "needs_clarification": true,
  "clarification_for": "service | datetime | age | cleaning_type | null"
}
`.trim();

    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
            'x-goog-api-key': GEMINI_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [{ text: prompt }],
                },
            ],
        }),
    });

    const raw = await response.text();

    if (!response.ok) {
        throw new Error(`Gemini HTTP ${response.status}: ${raw}`);
    }

    let data: any;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(`Gemini returned non-JSON envelope: ${raw}`);
    }

    const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!textOut) {
        throw new Error(`Gemini returned empty content: ${raw}`);
    }

    try {
        return JSON.parse(textOut) as ParsedIntent;
    } catch {
        const cleaned = textOut.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
        return JSON.parse(cleaned) as ParsedIntent;
    }
}

async function findPatientByPhone(phoneNumber: string): Promise<{
    found: boolean;
    patientId: number | null;
    patientName: string | null;
    displayName: string | null;
    raw: PatientLookupResponse;
}> {
    const normalizedPhone = normalizePhone(phoneNumber);

    const url = new URL(`${BACKEND_URL}/api/dentist/patients/find-by-phone`);
    url.searchParams.set('phone', normalizedPhone);

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(`Backend HTTP ${response.status}: ${text}`);
    }

    if (!text.trim()) {
        return {
            found: false,
            patientId: null,
            patientName: null,
            displayName: null,
            raw: null,
        };
    }

    let data: PatientLookupResponse = null;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Backend returned non-JSON: ${text}`);
    }

    if (!data) {
        return {
            found: false,
            patientId: null,
            patientName: null,
            displayName: null,
            raw: null,
        };
    }

    return {
        found: true,
        patientId: data.id ?? data.patientId ?? null,
        patientName: getPatientName(data),
        displayName: getDisplayName(data),
        raw: data,
    };
}

async function createPatient(phoneNumber: string, firstName: string): Promise<{
    patientId: number | null;
    patientName: string | null;
    displayName: string | null;
    raw: CreatePatientResponse;
}> {
    const normalizedPhone = normalizePhone(phoneNumber);

    const response = await fetch(`${BACKEND_URL}/api/dentist/patients`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            firstName,
            lastName: 'Пациент',
            phone: normalizedPhone,
            branchId: 5061,
        }),
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(`Create patient HTTP ${response.status}: ${text}`);
    }

    let data: CreatePatientResponse = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`Create patient returned non-JSON: ${text}`);
    }

    const patientId = data.id ?? data.patientId ?? null;
    const patientName =
        data.fullName || [data.lastName, data.firstName].filter(Boolean).join(' ').trim() || firstName;
    const displayName = getDisplayName(data) || firstName;

    return {
        patientId,
        patientName,
        displayName,
        raw: data,
    };
}

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'sevil-kids-main',
    }),
    puppeteer: {
        headless: false,
    },
});

client.on('qr', (qr: string) => {
    console.log('QR RECEIVED. Scan it in WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready');
});

client.on('authenticated', () => {
    console.log('WhatsApp authenticated');
});

client.on('auth_failure', (msg: string) => {
    console.error('WhatsApp auth failure:', msg);
});

client.on('disconnected', (reason: string) => {
    console.log('WhatsApp disconnected:', reason);
});

client.on('message', async (message: Message) => {
    try {
        console.log('Incoming:', message.from, '|', message.body);

        if (message.fromMe) return;
        if (!message.body?.trim()) return;
        if (message.from === 'status@broadcast') return;

        const messageId = message.id._serialized;
        if (processedMessages.has(messageId)) {
            console.log('Duplicate message skipped:', messageId);
            return;
        }
        processedMessages.add(messageId);
        setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

        const phoneNumber = extractPhoneNumber(message.from);
        const text = message.body.trim();
        const session = getSession(phoneNumber);

        console.log('USER PHONE:', phoneNumber);
        console.log('USER TEXT:', text);
        console.log('SESSION BEFORE:', session);

        // 1. Если ждем имя — создаем пациента
        if (session.awaitingName) {
            if (session.creatingPatient) {
                console.log('Create patient already in progress for:', phoneNumber);
                return;
            }

            session.creatingPatient = true;
            try {
                const created = await createPatient(phoneNumber, text);

                session.awaitingName = false;
                session.patientFound = true;
                session.patientChecked = true;
                session.patientId = created.patientId;
                session.patientName = created.displayName;
                session.greeted = true;

                await message.reply(getPostRegistrationPrompt(session.language, created.displayName || text));
            } finally {
                session.creatingPatient = false;
            }
            return;
        }

        // 2. Если ждем возраст для консультации
        if (session.awaitingConsultationAge) {
            const match = text.match(/\b(\d{1,2})\b/);
            const age = match ? Number(match[1]) : null;

            if (age === null || Number.isNaN(age)) {
                await message.reply(getConsultationAgePrompt(session.language));
                return;
            }

            session.awaitingConsultationAge = false;
            session.selectedService = 'consultation';
            session.selectedPrice = age < 16 ? 8000 : 10000;

            await message.reply(
                `${getConsultationPrice(session.language, age)} ${t(
                    session.language,
                    'Если хотите, я сразу помогу записаться на консультацию.',
                    'Қаласаңыз, мен бірден консультацияға жазылуға көмектесемін.',
                )}`,
            );
            return;
        }

        // 3. Всегда сначала разбираем язык/намерение
        let parsed: ParsedIntent = {
            language: session.language,
            intent: 'unknown',
            service: null,
            cleaning_type: null,
            age: null,
            datetime_text: null,
            doctor_preference: null,
            needs_clarification: false,
            clarification_for: null,
        };

        try {
            parsed = await askGeminiForIntent(text);
            session.language = parsed.language || session.language;
        } catch (e) {
            console.error('Gemini parse error:', e);
        }

        console.log('PARSED INTENT:', parsed);

        // 4. Всегда сначала проверяем пациента, если еще не проверяли
        if (!session.patientChecked || !session.patientFound) {
            const patient = await findPatientByPhone(phoneNumber);

            if (patient.found) {
                session.patientChecked = true;
                session.patientFound = true;
                session.patientId = patient.patientId;
                session.patientName = patient.displayName;
                session.awaitingName = false;

                if (parsed.intent === 'greeting') {
                    session.greeted = true;
                    await message.reply(getMainGreeting(session.language, patient.displayName));
                    return;
                }
            } else {
                session.patientChecked = true;
                session.patientFound = false;
                session.patientId = null;
                session.patientName = null;
                session.awaitingName = true;

                if (!session.greeted) {
                    session.greeted = true;
                    await message.reply(getNotFoundAskName(session.language));
                    return;
                }

                await message.reply(getAskNameAgain(session.language));
                return;
            }
        }

        // 5. Если пациент найден, но это просто приветствие
        if (parsed.intent === 'greeting' && !session.greeted) {
            session.greeted = true;
            await message.reply(getMainGreeting(session.language, session.patientName));
            return;
        }

        // 6. Какие услуги есть
        if (parsed.intent === 'ask_services') {
            await message.reply(getServicesText(session.language));
            return;
        }

        // 7. Цена консультации
        if (parsed.intent === 'ask_price' && parsed.service === 'consultation') {
            session.selectedService = 'consultation';

            if (parsed.age === null) {
                session.awaitingConsultationAge = true;
                await message.reply(getConsultationAgePrompt(session.language));
                return;
            }

            session.selectedPrice = parsed.age < 16 ? 8000 : 10000;
            await message.reply(
                `${getConsultationPrice(session.language, parsed.age)} ${t(
                    session.language,
                    'Если хотите, я сразу помогу записаться на консультацию.',
                    'Қаласаңыз, мен бірден консультацияға жазылуға көмектесемін.',
                )}`,
            );
            return;
        }

        // 8. Цена/виды чистки
        if (parsed.intent === 'ask_price' && parsed.service === 'cleaning') {
            session.selectedService = 'cleaning';
            await message.reply(getCleaningPriceList(session.language));
            return;
        }

        // 9. Выбор консультации
        if (
            (parsed.intent === 'choose_service' || parsed.intent === 'booking_request') &&
            parsed.service === 'consultation'
        ) {
            session.selectedService = 'consultation';
            session.awaitingDateTime = true;
            await message.reply(getAskDateTimeText(session.language, t(session.language, 'консультацию', 'консультацияға')));
            return;
        }

        // 10. Выбор чистки
        if (
            (parsed.intent === 'choose_service' || parsed.intent === 'booking_request') &&
            parsed.service === 'cleaning'
        ) {
            session.selectedService = 'cleaning';

            if (parsed.cleaning_type) {
                session.selectedCleaningType = parsed.cleaning_type;
                session.selectedPrice = getCleaningTypePrice(parsed.cleaning_type);
                session.awaitingDateTime = true;

                await message.reply(
                    `${t(
                        session.language,
                        `Хорошо, выбираем ${getCleaningTypeLabel(session.language, parsed.cleaning_type)}. Стоимость — ${session.selectedPrice} тг.`,
                        `${getCleaningTypeLabel(session.language, parsed.cleaning_type)} таңдалды. Құны — ${session.selectedPrice} тг.`,
                    )} ${t(
                        session.language,
                        'Подскажите, пожалуйста, удобную дату или время.',
                        'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                    )}`,
                );
                return;
            }

            session.awaitingCleaningType = true;
            await message.reply(getCleaningTypePrompt(session.language));
            return;
        }

        // 11. Если ждем тип чистки
        if (session.awaitingCleaningType) {
            const type = detectCleaningTypeFromText(text);

            if (!type) {
                await message.reply(getCleaningTypePrompt(session.language));
                return;
            }

            session.awaitingCleaningType = false;
            session.selectedCleaningType = type;
            session.selectedService = 'cleaning';
            session.selectedPrice = getCleaningTypePrice(type);
            session.awaitingDateTime = true;

            await message.reply(
                `${t(
                    session.language,
                    `Хорошо, выбрана ${getCleaningTypeLabel(session.language, type)}. Стоимость — ${session.selectedPrice} тг.`,
                    `${getCleaningTypeLabel(session.language, type)} таңдалды. Құны — ${session.selectedPrice} тг.`,
                )} ${t(
                    session.language,
                    'Подскажите, пожалуйста, удобную дату или время.',
                    'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                )}`,
            );
            return;
        }

        // 12. Дата/время
        if (parsed.intent === 'provide_datetime' || session.awaitingDateTime) {
            if (!session.selectedService) {
                await message.reply(getServicesText(session.language));
                return;
            }

            if (!parsed.datetime_text) {
                await message.reply(
                    t(
                        session.language,
                        'Подскажите, пожалуйста, удобную дату или время, чтобы я проверила свободные окна.',
                        'Бос уақыттарды тексеру үшін ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                    ),
                );
                return;
            }

            session.selectedDateTimeText = parsed.datetime_text;
            session.awaitingDateTime = false;
            session.awaitingBookingConfirmation = true;

            const serviceLabel =
                session.selectedService === 'consultation'
                    ? t(session.language, 'консультацию', 'консультацияға')
                    : session.selectedCleaningType
                        ? getCleaningTypeLabel(session.language, session.selectedCleaningType)
                        : t(session.language, 'чистку', 'тазалауға');

            await message.reply(getDateTimeAccepted(session.language, serviceLabel, parsed.datetime_text));
            return;
        }

        // 13. Запасной ответ
        await message.reply(
            t(
                session.language,
                'Я помогу вам с записью. Сейчас у нас доступны консультация и чистка. Напишите, пожалуйста, что вас интересует.',
                'Мен сізге жазылуға көмектесемін. Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар. Сізді не қызықтыратынын жаза аласыз ба?',
            ),
        );
    } catch (error) {
        console.error('Message handler error:', error);
        await message.reply(
            'Извините, произошла ошибка при обработке сообщения. Попробуйте, пожалуйста, ещё раз чуть позже.',
        );
    }
});

client.initialize();
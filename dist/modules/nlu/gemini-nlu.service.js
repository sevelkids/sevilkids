"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GeminiNluService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiNluService = void 0;
const common_1 = require("@nestjs/common");
let GeminiNluService = GeminiNluService_1 = class GeminiNluService {
    constructor() {
        this.logger = new common_1.Logger(GeminiNluService_1.name);
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        this.url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }
    async parseIntent(text, currentLanguage = 'ru') {
        const fallback = this.fallbackIntent(text, currentLanguage);
        try {
            const prompt = this.buildPrompt(text, currentLanguage);
            const response = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'x-goog-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: prompt }],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1,
                    },
                }),
            });
            const raw = await response.text();
            if (!response.ok) {
                this.logger.warn(`Gemini HTTP ${response.status}: ${raw}`);
                return fallback;
            }
            let envelope;
            try {
                envelope = JSON.parse(raw);
            }
            catch {
                this.logger.warn(`Gemini envelope parse failed: ${raw}`);
                return fallback;
            }
            const textOut = envelope?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!textOut) {
                this.logger.warn(`Gemini returned empty content: ${raw}`);
                return fallback;
            }
            const parsed = this.safeParseJson(textOut);
            if (!parsed) {
                this.logger.warn(`Gemini JSON parse failed: ${textOut}`);
                return fallback;
            }
            return {
                language: parsed.language === 'kk' ? 'kk' : 'ru',
                intent: this.normalizeIntent(parsed.intent),
                service: this.normalizeService(parsed.service),
                cleaning_type: this.normalizeCleaningType(parsed.cleaning_type),
                age: this.normalizeAge(parsed.age),
                datetime_text: typeof parsed.datetime_text === 'string' ? parsed.datetime_text.trim() : null,
                doctor_preference: parsed.doctor_preference === 'any'
                    ? 'any'
                    : parsed.doctor_preference === 'specific'
                        ? 'specific'
                        : null,
                needs_clarification: Boolean(parsed.needs_clarification),
                clarification_for: this.normalizeClarification(parsed.clarification_for),
            };
        }
        catch (error) {
            this.logger.warn(`Gemini parse failed: ${error?.message || error}`);
            return fallback;
        }
    }
    buildPrompt(text, currentLanguage) {
        return `
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
- sedation
- allergy_test
- online_consultation
- existing_patient_check
- collect_child_data
- payment_flow
- receipt_waiting
- appointment_confirmation
- request_human
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

Важные правила:
1. Клиника стоматологическая.
2. Нельзя придумывать другие услуги и специальности.
3. Если клиент пишет про консультацию — service = consultation.
4. Если клиент пишет про чистку / профгигиену / air flow — service = cleaning.
5. Если клиент спрашивает, какие услуги есть — intent = ask_services.
6. Если клиент спрашивает цену — intent = ask_price.
7. Если клиент пишет "без разницы" — doctor_preference = any.
8. Если в сообщении есть возраст — извлекай age.
9. Если есть слова про дату или время, положи исходный фрагмент в datetime_text.
10. Если клиент пишет "хочу за 50к" и речь про чистку — это cleaning_type = prophylaxis_master.
11. Если данных недостаточно, не выдумывай.
12. Текущий язык сессии: ${currentLanguage}.

Примеры:
- "Инфу про консультацию" => ask_price, consultation
- "Расскажи про консультацию" => ask_price, consultation
- "Консультация" => choose_service, consultation
- "Какие чистки есть" => ask_price, cleaning
- "Чистка" => choose_service, cleaning
- "Чиста" => choose_service, cleaning
- "Хочу за 50к" => choose_service, cleaning, prophylaxis_master
- "Сегодня в 5" => provide_datetime
- "Завтра вечером" => provide_datetime
- "Қандай қызметтер бар?" => ask_services
- "Тазалау бағасы қанша?" => ask_price, cleaning

Сообщение клиента:
"${text}"

Формат ответа:
{
  "language": "ru | kk",
  "intent": "greeting | ask_services | ask_price | choose_service | booking_request | provide_datetime | choose_doctor | cancel_request | reschedule_request | sedation | allergy_test | online_consultation | existing_patient_check | collect_child_data | payment_flow | receipt_waiting | appointment_confirmation | request_human | unknown",
  "service": "consultation | cleaning | sedation | allergy_test | online_consultation | null",
  "cleaning_type": "light_milk_bite | medium_milk_bite | airflow_glycine_upto9 | airflow_glycine_10_16 | prophylaxis_master | null",
  "age": number | null,
  "datetime_text": "string | null",
  "doctor_preference": "any | specific | null",
  "needs_clarification": true,
  "clarification_for": "service | datetime | age | cleaning_type | null"
}
`.trim();
    }
    safeParseJson(text) {
        try {
            return JSON.parse(text);
        }
        catch {
            try {
                const cleaned = text
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/```$/i, '')
                    .trim();
                return JSON.parse(cleaned);
            }
            catch {
                return null;
            }
        }
    }
    fallbackIntent(text, currentLanguage) {
        const lower = text.toLowerCase();
        const consultation = lower.includes('консульта') ||
            lower.includes('консл') ||
            lower.includes('consult');
        const cleaning = lower.includes('чистк') ||
            lower.includes('чиста') ||
            lower.includes('тазала') ||
            lower.includes('профгиги') ||
            lower.includes('air flow') ||
            lower.includes('airflow') ||
            lower.includes('prophylaxis') ||
            lower.includes('50к') ||
            lower.includes('50000');
        const asksPrice = lower.includes('цен') ||
            lower.includes('стоим') ||
            lower.includes('сколько') ||
            lower.includes('прайс') ||
            lower.includes('инф') ||
            lower.includes('подроб') ||
            lower.includes('расскажи') ||
            lower.includes('баға') ||
            lower.includes('бағасы') ||
            lower.includes('какие чистки');
        const asksServices = lower.includes('какие услуги') ||
            lower.includes('какие есть услуги') ||
            lower.includes('что есть') ||
            lower.includes('қандай қызмет');
        const greeting = lower.includes('привет') ||
            lower.includes('здравств') ||
            lower.includes('сәлем') ||
            lower.includes('салем');
        const hasDateTime = lower.includes('сегодня') ||
            lower.includes('завтра') ||
            lower.includes('послезавтра') ||
            lower.includes('бүгін') ||
            lower.includes('ертең') ||
            /\b\d{1,2}(:\d{2})?\b/.test(lower);
        let intent = 'unknown';
        let service = null;
        if (greeting)
            intent = 'greeting';
        if (asksServices)
            intent = 'ask_services';
        if (asksPrice && consultation) {
            intent = 'ask_price';
            service = 'consultation';
        }
        if (asksPrice && cleaning) {
            intent = 'ask_price';
            service = 'cleaning';
        }
        if (consultation && hasDateTime) {
            intent = 'booking_request';
            service = 'consultation';
        }
        if (cleaning && hasDateTime) {
            intent = 'booking_request';
            service = 'cleaning';
        }
        if (consultation && intent === 'unknown') {
            intent = 'choose_service';
            service = 'consultation';
        }
        if (cleaning && intent === 'unknown') {
            intent = 'choose_service';
            service = 'cleaning';
        }
        if (hasDateTime && intent === 'unknown') {
            intent = 'provide_datetime';
        }
        const language = /[әіңғүұқөһ]/i.test(text) || lower.includes('сәлем') || lower.includes('қандай')
            ? 'kk'
            : currentLanguage || 'ru';
        return {
            language,
            intent,
            service,
            cleaning_type: this.detectCleaningType(text),
            age: this.normalizeAge(this.extractAge(text)),
            datetime_text: hasDateTime ? text : null,
            doctor_preference: lower.includes('без разницы') ? 'any' : null,
            needs_clarification: false,
            clarification_for: null,
        };
    }
    extractAge(text) {
        const match = text.match(/\b(\d{1,2})\b/);
        if (!match)
            return null;
        const age = Number(match[1]);
        if (Number.isNaN(age) || age <= 0 || age > 99)
            return null;
        return age;
    }
    detectCleaningType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('50к') || lower.includes('50000') || lower.includes('50 000')) {
            return 'prophylaxis_master';
        }
        if (lower.includes('prophylaxis'))
            return 'prophylaxis_master';
        if (lower.includes('air flow') || lower.includes('airflow')) {
            if (lower.includes('10') || lower.includes('16'))
                return 'airflow_glycine_10_16';
            return 'airflow_glycine_upto9';
        }
        if (lower.includes('лёгк') || lower.includes('легк') || lower.includes('жеңіл')) {
            return 'light_milk_bite';
        }
        if (lower.includes('средн') || lower.includes('орташа')) {
            return 'medium_milk_bite';
        }
        return null;
    }
    normalizeIntent(value) {
        const allowed = [
            'greeting',
            'ask_services',
            'ask_price',
            'choose_service',
            'booking_request',
            'provide_datetime',
            'choose_doctor',
            'cancel_request',
            'reschedule_request',
            'sedation',
            'allergy_test',
            'online_consultation',
            'existing_patient_check',
            'collect_child_data',
            'payment_flow',
            'receipt_waiting',
            'appointment_confirmation',
            'request_human',
            'unknown',
        ];
        return allowed.includes(value) ? value : 'unknown';
    }
    normalizeService(value) {
        return value === 'consultation' ||
            value === 'cleaning' ||
            value === 'sedation' ||
            value === 'allergy_test' ||
            value === 'online_consultation'
            ? value
            : null;
    }
    normalizeCleaningType(value) {
        const allowed = [
            'light_milk_bite',
            'medium_milk_bite',
            'airflow_glycine_upto9',
            'airflow_glycine_10_16',
            'prophylaxis_master',
        ];
        return allowed.includes(value) ? value : null;
    }
    normalizeAge(value) {
        if (typeof value !== 'number')
            return null;
        if (!Number.isFinite(value) || value <= 0 || value > 99)
            return null;
        return value;
    }
    normalizeClarification(value) {
        return value === 'service' ||
            value === 'datetime' ||
            value === 'age' ||
            value === 'cleaning_type'
            ? value
            : null;
    }
};
exports.GeminiNluService = GeminiNluService;
exports.GeminiNluService = GeminiNluService = GeminiNluService_1 = __decorate([
    (0, common_1.Injectable)()
], GeminiNluService);
//# sourceMappingURL=gemini-nlu.service.js.map
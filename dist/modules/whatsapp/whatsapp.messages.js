"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppMessagesService = void 0;
const common_1 = require("@nestjs/common");
let WhatsAppMessagesService = class WhatsAppMessagesService {
    t(lang, ru, kk) {
        return lang === 'kk' ? kk : ru;
    }
    getMainGreeting(lang, name) {
        if (name) {
            return this.t(lang, `${name}, здравствуйте! Я бот Жансая клиники Sevil Kids.
Помогу вам с записью на приём.
Сейчас у нас доступны консультация и чистка.
Что вас интересует?`, `${name}, сәлеметсіз бе! Мен Sevil Kids клиникасының Жансая ботымын.
Қабылдауға жазылуға көмектесемін.
Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар.
Сізді қайсысы қызықтырады?`);
        }
        return this.t(lang, `Здравствуйте! Я бот Жансая клиники Sevil Kids.
Помогу вам с записью на приём.
Сейчас у нас доступны консультация и чистка.
Что вас интересует?`, `Сәлеметсіз бе! Мен Sevil Kids клиникасының Жансая ботымын.
Қабылдауға жазылуға көмектесемін.
Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар.
Сізді қайсысы қызықтырады?`);
    }
    getNotFoundAskName(lang) {
        return this.t(lang, `Здравствуйте! Я бот Жансая клиники Sevil Kids.
Не смогла найти вас в базе.
Подскажите, пожалуйста, ваше имя, и я продолжу оформление записи.`, `Сәлеметсіз бе! Мен Sevil Kids клиникасының Жансая ботымын.
Сізді базадан таба алмадым.
Жазылуды жалғастыру үшін атыңызды жаза аласыз ба?`);
    }
    getAskNameAgain(lang) {
        return this.t(lang, 'Подскажите, пожалуйста, ваше имя, чтобы я продолжила оформление записи.', 'Жазылуды жалғастыру үшін атыңызды жаза аласыз ба?');
    }
    getServicesText(lang) {
        return this.t(lang, `Сейчас у нас доступны:
• консультация
• чистка

Что вас интересует?`, `Қазіргі таңда бізде:
• консультация
• тіс тазалау

Қайсысы сізді қызықтырады?`);
    }
    getConsultationInfo(lang) {
        return this.t(lang, `Консультация у нас проводится по предварительной записи.
Стоимость консультации
до 16 лет — 8 000 тг,
от 16 лет — 10 000 тг.

Если хотите, я помогу подобрать удобное время.
Подскажите, пожалуйста, возраст пациента, чтобы я точно подсказала стоимость консультации.`, `Консультация бізде алдын ала жазылу арқылы жүргізіледі.
Консультация құны
16 жасқа дейін — 8 000 тг,
16 жастан бастап — 10 000 тг.

Қаласаңыз, ыңғайлы уақытты таңдауға көмектесемін.
Нақты құнын айту үшін пациенттің жасын жаза аласыз ба?`);
    }
    getConsultationAgePrompt(lang) {
        return this.t(lang, 'Подскажите, пожалуйста, возраст пациента, чтобы я точно подсказала стоимость консультации.', 'Консультация бағасын нақты айту үшін пациенттің жасын жаза аласыз ба?');
    }
    getConsultationPrice(lang, age) {
        if (age < 16) {
            return this.t(lang, 'Стоимость консультации до 16 лет — 8 000 тг.', '16 жасқа дейінгі консультация құны — 8 000 тг.');
        }
        return this.t(lang, 'Стоимость консультации от 16 лет — 10 000 тг.', '16 жастан бастап консультация құны — 10 000 тг.');
    }
    getCleaningPriceList(lang) {
        return this.t(lang, `По чистке у нас доступны такие варианты:
• лёгкая (молочный прикус) — 10 000 тг
• средняя (молочный прикус) — 16 000 тг
• Air Flow с глицином (до 9 лет) — 25 000 тг
• Air Flow с глицином (10–16 лет) — 35 000 тг
• Prophylaxis Master — 50 000 тг`, `Тіс тазалау бойынша бізде мынадай нұсқалар бар:
• жеңіл (сүт тістемі) — 10 000 тг
• орташа (сүт тістемі) — 16 000 тг
• Air Flow глицинмен (9 жасқа дейін) — 25 000 тг
• Air Flow глицинмен (10–16 жас) — 35 000 тг
• Prophylaxis Master — 50 000 тг`);
    }
    getCleaningTypePrompt(lang) {
        return this.t(lang, `Какой вариант чистки вас интересует?
• лёгкая (молочный прикус)
• средняя (молочный прикус)
• Air Flow с глицином (до 9 лет)
• Air Flow с глицином (10–16 лет)
• Prophylaxis Master`, `Қай тазалау түрі сізді қызықтырады?
• жеңіл (сүт тістемі)
• орташа (сүт тістемі)
• Air Flow глицинмен (9 жасқа дейін)
• Air Flow глицинмен (10–16 жас)
• Prophylaxis Master`);
    }
    getPostRegistrationPrompt(lang, firstName) {
        return this.t(lang, `${firstName}, отлично, я зарегистрировала вас в системе.
Сейчас у нас доступны консультация и чистка.
Что вас интересует?`, `${firstName}, керемет, мен сізді жүйеге тіркедім.
Қазіргі таңда бізде консультация және тіс тазалау қызметтері бар.
Сізді қайсысы қызықтырады?`);
    }
    getThinkingNudge(lang) {
        return this.t(lang, 'Если хотите, я помогу подобрать удобное время для записи.', 'Қаласаңыз, жазылуға ыңғайлы уақытты таңдап бере аламын.');
    }
    getAskDateTime(lang, serviceLabel) {
        return this.t(lang, `Хорошо, записываем на ${serviceLabel}.
Подскажите, пожалуйста, удобную дату или время.`, `Жақсы, сізді ${serviceLabel} қызметіне жазамыз.
Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?`);
    }
    getBookedReply(lang, input) {
        const prefix = input.patientName ? `${input.patientName}, ` : '';
        return this.t(lang, `${prefix}записала вас.
Дата и время: ${input.dateTime}
Врач: ${input.doctorName}`, `${prefix}сізді жазып қойдым.
Күні мен уақыты: ${input.dateTime}
Дәрігер: ${input.doctorName}`);
    }
    getNoSlotReply(lang) {
        return this.t(lang, 'На это время свободных окон не нашлось. Могу предложить ближайшие варианты.', 'Бұл уақытқа бос орын табылмады. Жақын уақыттарды ұсына аламын.');
    }
};
exports.WhatsAppMessagesService = WhatsAppMessagesService;
exports.WhatsAppMessagesService = WhatsAppMessagesService = __decorate([
    (0, common_1.Injectable)()
], WhatsAppMessagesService);
//# sourceMappingURL=whatsapp.messages.js.map
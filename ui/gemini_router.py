import json
import requests


class GeminiRouter:
    def __init__(self):
        self.api_key = "AIzaSyDSb5IQ7JEAIa8FqKVXEckUZF2dCRwfTOU"
        self.model = "gemini-2.5-flash"
        self.gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"

        self.backend_url = "http://localhost:3000"

        self.check_patient_url = ""
        self.create_patient_url = ""

        self.dialog_state = {
            "awaiting_new_patient_name": False,
            "pending_phone_number": None,
            "patient_found": False,
            "patient_id": None,
            "patient_name": None,
        }

        self.system_prompt = """
Ты — WhatsApp-ассистент клиники Sevil Kids.

Правила:
1. Не выдумывай данные о пациентах, врачах, услугах, ценах, слотах и записях.
2. Используй только данные, переданные системой.
3. Не показывай клиенту JSON, внутренние id и служебные поля.
4. Отвечай кратко, естественно, профессионально и по-человечески.
5. Если данных недостаточно, задай только один следующий уместный вопрос.
6. Если пациент не найден в базе, помоги оформить его как нового пациента.
7. Если пациент найден, мягко веди к записи.
8. Не пиши лишний канцелярит.
""".strip()

    def normalize_phone(self, phone: str) -> str:
        phone = str(phone).strip()
        phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")

        if phone.startswith("+7") and len(phone) == 12:
            phone = "8" + phone[2:]
        elif phone.startswith("7") and len(phone) == 11:
            phone = "8" + phone[1:]

        return phone

    def ask_gemini(self, prompt: str) -> str:
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }

        response = requests.post(
            self.gemini_url,
            headers={
                "x-goog-api-key": self.api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )

        if response.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {response.status_code}: {response.text}")

        data = response.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            raise RuntimeError(f"Неожиданный ответ Gemini: {data}")

    def call_check_patient(self, phone_number: str) -> dict:
        phone_number = self.normalize_phone(phone_number)

        if self.check_patient_url:
            response = requests.post(
                self.check_patient_url,
                json={"phone_number": phone_number},
                timeout=30,
            )

            if response.status_code != 200:
                raise RuntimeError(f"FaaS HTTP {response.status_code}: {response.text}")

            try:
                return response.json()
            except Exception:
                return {
                    "ok": False,
                    "action": "check_patient_by_phone",
                    "found": False,
                    "message": "FaaS вернула не JSON",
                    "raw_text": response.text,
                }

        response = requests.get(
            f"{self.backend_url}/api/dentist/patients/find-by-phone",
            params={"phone": phone_number},
            timeout=30,
        )

        if response.status_code != 200:
            raise RuntimeError(f"Backend HTTP {response.status_code}: {response.text}")

        raw_text = response.text.strip()

        if not raw_text:
            return {
                "ok": True,
                "action": "check_patient_by_phone",
                "found": False,
                "message": "Клиент не в базе",
            }

        try:
            data = response.json()
        except Exception:
            return {
                "ok": False,
                "action": "check_patient_by_phone",
                "found": False,
                "message": "Backend вернул не JSON",
                "raw_text": raw_text,
            }

        if not data:
            return {
                "ok": True,
                "action": "check_patient_by_phone",
                "found": False,
                "message": "Клиент не в базе",
            }

        patient_id = data.get("id") or data.get("patientId")
        patient_name = data.get("fullName") or data.get("name")

        if not patient_name:
            parts = [
                data.get("lastName"),
                data.get("firstName"),
                data.get("middleName"),
            ]
            patient_name = " ".join([p for p in parts if p]) or "Пациент найден"

        return {
            "ok": True,
            "action": "check_patient_by_phone",
            "found": True,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "raw": data,
        }

    def call_create_patient(self, phone_number: str, first_name: str) -> dict:
        phone_number = self.normalize_phone(phone_number)

        if self.create_patient_url:
            response = requests.post(
                self.create_patient_url,
                json={
                    "fname": first_name,
                    "lname": "Пациент",
                    "phone_number": phone_number,
                },
                timeout=30,
            )

            if response.status_code not in (200, 201):
                raise RuntimeError(f"Create patient FaaS HTTP {response.status_code}: {response.text}")

            try:
                data = response.json()
            except Exception:
                raise RuntimeError(f"Create patient FaaS вернул не JSON: {response.text}")

            return {
                "ok": True,
                "action": "create_patient",
                "patient_id": data.get("patient_id") or data.get("id"),
                "patient_name": data.get("patient_name") or first_name,
                "raw": data,
            }

        response = requests.post(
            f"{self.backend_url}/api/dentist/patients",
            json={
                "firstName": first_name,
                "lastName": "Пациент",
                "phone": phone_number,
                "branchId": 5061,
            },
            timeout=30,
        )

        if response.status_code not in (200, 201):
            raise RuntimeError(f"Create patient HTTP {response.status_code}: {response.text}")

        try:
            data = response.json()
        except Exception:
            raise RuntimeError(f"Create patient вернул не JSON: {response.text}")

        patient_id = data.get("id") or data.get("patientId")
        patient_name = data.get("fullName") or f'{data.get("lastName", "")} {data.get("firstName", "")}'.strip()

        return {
            "ok": True,
            "action": "create_patient",
            "patient_id": patient_id,
            "patient_name": patient_name or first_name,
            "raw": data,
        }

    def route_message(self, user_text: str, phone_number: str) -> dict:
        text = (user_text or "").strip()
        lower = text.lower()
        phone_number = self.normalize_phone(phone_number)

        if not text:
            return {
                "reply": "Пустое сообщение.",
                "action": "none",
                "debug": None,
            }

        if self.dialog_state["awaiting_new_patient_name"]:
            first_name = text.strip()

            try:
                result = self.call_create_patient(phone_number, first_name)

                self.dialog_state["awaiting_new_patient_name"] = False
                self.dialog_state["pending_phone_number"] = None
                self.dialog_state["patient_found"] = True
                self.dialog_state["patient_id"] = result.get("patient_id")
                self.dialog_state["patient_name"] = result.get("patient_name")

                prompt = f"""
{self.system_prompt}

Создан новый пациент:
{json.dumps(result, ensure_ascii=False, indent=2)}

Сформируй ответ клиенту:
- коротко подтверди, что регистрация прошла успешно
- сразу предложи выбрать услугу
- пока не перечисляй несуществующие услуги
- можно сказать, что сейчас поможешь с записью
""".strip()

                reply = self.ask_gemini(prompt)

                return {
                    "reply": reply,
                    "action": "create_patient",
                    "debug": result,
                }

            except Exception as e:
                return {
                    "reply": f"Не удалось создать пациента: {e}",
                    "action": "create_patient",
                    "debug": None,
                }

        trigger_words = [
            "привет",
            "здравствуйте",
            "запис",
            "пациент",
            "клиент",
            "номер",
            "в базе",
            "консультац",
            "чистк",
            "лечени",
            "болит",
            "хочу",
        ]

        if any(word in lower for word in trigger_words):
            try:
                result = self.call_check_patient(phone_number)
            except Exception as e:
                return {
                    "reply": f"Ошибка при проверке пациента: {e}",
                    "action": "check_patient_by_phone",
                    "debug": None,
                }

            if not result.get("found"):
                self.dialog_state["awaiting_new_patient_name"] = True
                self.dialog_state["pending_phone_number"] = phone_number
                self.dialog_state["patient_found"] = False
                self.dialog_state["patient_id"] = None
                self.dialog_state["patient_name"] = None

                prompt = f"""
{self.system_prompt}

Пользователь написал: "{text}"
Номер клиента: {phone_number}

Результат проверки:
{json.dumps(result, ensure_ascii=False, indent=2)}

Сформируй ответ:
- сообщи, что клиента не нашли в базе
- попроси только имя для оформления нового пациента
- не показывай JSON
""".strip()

                reply = self.ask_gemini(prompt)

                return {
                    "reply": reply,
                    "action": "check_patient_by_phone",
                    "debug": result,
                }

            self.dialog_state["patient_found"] = True
            self.dialog_state["patient_id"] = result.get("patient_id")
            self.dialog_state["patient_name"] = result.get("patient_name")

            prompt = f"""
{self.system_prompt}

Пользователь написал: "{text}"
Номер клиента: {phone_number}

Результат проверки пациента:
{json.dumps(result, ensure_ascii=False, indent=2)}

Сформируй ответ:
- если пациент найден, можно обратиться по имени
- мягко переведи диалог к записи или выбору услуги
- не показывай JSON
""".strip()

            reply = self.ask_gemini(prompt)

            return {
                "reply": reply,
                "action": "check_patient_by_phone",
                "debug": result,
            }

        reply = self.ask_gemini(
            f"""
{self.system_prompt}

Пользователь написал: "{text}"
Номер клиента: {phone_number}

Сформируй короткий и вежливый ответ.
""".strip()
        )

        return {
            "reply": reply,
            "action": "gemini_only",
            "debug": None,
        }
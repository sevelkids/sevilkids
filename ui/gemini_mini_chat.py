import os
import tkinter as tk
from tkinter import scrolledtext, messagebox
import requests

API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyDSb5IQ7JEAIa8FqKVXEckUZF2dCRwfTOU").strip()
MODEL = "gemini-2.5-flash"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


class GeminiMiniChat(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Gemini Mini Chat")
        self.geometry("720x560")
        self.configure(bg="#111111")

        self.chat = scrolledtext.ScrolledText(
            self,
            wrap=tk.WORD,
            bg="#1e1e1e",
            fg="white",
            insertbackground="white",
            font=("Segoe UI", 11),
            bd=0,
            padx=12,
            pady=12,
        )
        self.chat.pack(fill="both", expand=True, padx=12, pady=(12, 8))
        self.chat.insert(tk.END, "Gemini: Привет. Напиши сообщение.\n\n")
        self.chat.config(state="disabled")

        bottom = tk.Frame(self, bg="#111111")
        bottom.pack(fill="x", padx=12, pady=(0, 12))

        self.entry = tk.Entry(
            bottom,
            bg="#1e1e1e",
            fg="white",
            insertbackground="white",
            font=("Segoe UI", 11),
            bd=0,
        )
        self.entry.pack(side="left", fill="x", expand=True, ipady=10, padx=(0, 8))
        self.entry.bind("<Return>", lambda e: self.send_message())

        send_btn = tk.Button(
            bottom,
            text="Отправить",
            command=self.send_message,
            bg="#2ea043",
            fg="white",
            activebackground="#2c974b",
            activeforeground="white",
            bd=0,
            padx=16,
            pady=10,
            cursor="hand2",
        )
        send_btn.pack(side="right")

    def append_chat(self, speaker: str, text: str):
        self.chat.config(state="normal")
        self.chat.insert(tk.END, f"{speaker}: {text}\n\n")
        self.chat.see(tk.END)
        self.chat.config(state="disabled")

    def ask_gemini(self, prompt: str) -> str:
        if not API_KEY:
            raise RuntimeError("Не найден GEMINI_API_KEY в переменных окружения.")

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
            URL,
            headers={
                "x-goog-api-key": API_KEY,
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
            raise RuntimeError(f"Неожиданный ответ API: {data}")

    def send_message(self):
        text = self.entry.get().strip()
        if not text:
            return

        self.entry.delete(0, tk.END)
        self.append_chat("Вы", text)

        try:
            self.append_chat("Gemini", "Думаю...")
            self.chat.config(state="normal")
            content = self.chat.get("1.0", tk.END)
            if content.endswith("Gemini: Думаю...\n\n"):
                self.chat.delete("end-3l", tk.END)
            self.chat.config(state="disabled")

            answer = self.ask_gemini(text)
            self.append_chat("Gemini", answer)
        except Exception as e:
            messagebox.showerror("Ошибка", str(e))


if __name__ == "__main__":
    app = GeminiMiniChat()
    app.mainloop()

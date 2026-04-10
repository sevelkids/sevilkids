import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime
from gemini_router import GeminiRouter


class ChatBubble(tk.Frame):
    def __init__(self, parent, text, time_text, outgoing=False, max_width=560):
        super().__init__(parent, bg=parent["bg"])
        bubble_bg = "#144d37" if outgoing else "#202c33"

        outer = tk.Frame(self, bg=parent["bg"])
        outer.pack(fill="x", padx=0, pady=3)

        bubble = tk.Frame(outer, bg=bubble_bg)
        bubble.pack(
            anchor="e" if outgoing else "w",
            padx=(120 if outgoing else 14, 14 if outgoing else 120),
        )

        msg = tk.Label(
            bubble,
            text=text,
            justify="left",
            wraplength=max_width,
            bg=bubble_bg,
            fg="#e9edef",
            font=("Segoe UI", 12),
            padx=14,
            pady=10,
        )
        msg.pack(anchor="w")

        meta = tk.Label(
            bubble,
            text=time_text,
            bg=bubble_bg,
            fg="#8696a0",
            font=("Segoe UI", 8),
            padx=12,
            pady=0,
        )
        meta.pack(anchor="e", pady=(0, 6))


class SettingsDialog(tk.Toplevel):
    def __init__(self, parent, current_phone):
        super().__init__(parent)
        self.result = None
        self.title("Настройки")
        self.geometry("430x245")
        self.resizable(False, False)
        self.configure(bg="#111b21")
        self.transient(parent)
        self.grab_set()

        tk.Label(
            self,
            text="Настройки тестового клиента",
            bg="#111b21",
            fg="#e9edef",
            font=("Segoe UI", 16, "bold"),
        ).pack(anchor="w", padx=20, pady=(20, 10))

        tk.Label(
            self,
            text="Номер телефона, с которого пишет клиент",
            bg="#111b21",
            fg="#aebac1",
            font=("Segoe UI", 10),
        ).pack(anchor="w", padx=20, pady=(4, 6))

        self.phone_var = tk.StringVar(value=current_phone)

        field = tk.Frame(self, bg="#202c33", height=46)
        field.pack(fill="x", padx=20)
        field.pack_propagate(False)

        entry = tk.Entry(
            field,
            textvariable=self.phone_var,
            bd=0,
            bg="#202c33",
            fg="#e9edef",
            insertbackground="#e9edef",
            font=("Segoe UI", 12),
        )
        entry.pack(fill="both", expand=True, padx=14, pady=11)
        entry.focus_set()

        tk.Label(
            self,
            text="Этот номер будет подставляться в вызовы роутера и FaaS.",
            bg="#111b21",
            fg="#8696a0",
            font=("Segoe UI", 9),
        ).pack(anchor="w", padx=20, pady=(10, 0))

        actions = tk.Frame(self, bg="#111b21")
        actions.pack(side="bottom", fill="x", padx=20, pady=20)

        tk.Button(
            actions,
            text="Отмена",
            command=self.destroy,
            bg="#202c33",
            fg="#d1d7db",
            bd=0,
            padx=18,
            pady=8,
            cursor="hand2",
            font=("Segoe UI", 10),
        ).pack(side="right", padx=(8, 0))

        tk.Button(
            actions,
            text="Сохранить",
            command=self.save,
            bg="#25d366",
            fg="#111b21",
            bd=0,
            padx=18,
            pady=8,
            cursor="hand2",
            font=("Segoe UI", 10, "bold"),
        ).pack(side="right")

    def save(self):
        phone = self.phone_var.get().strip()
        if not phone:
            messagebox.showerror("Ошибка", "Введите номер телефона.")
            return
        self.result = phone
        self.destroy()


class WhatsAppClone(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Sevil Kids Test Chat")
        self.geometry("1380x800")
        self.minsize(1220, 740)
        self.configure(bg="#111b21")

        self.router = GeminiRouter()
        self.user_phone = "77009845374"
        self.selected_chat = "Sevil Kids"
        self.search_var = tk.StringVar()
        self.message_var = tk.StringVar()

        self.chats = [
            {"name": "Sevil Kids", "subtitle": "Бот клиники · Gemini + FaaS", "time": "20:23", "unread": 0, "color": "#53bdeb"},
            {"name": "CRM-Sevil kids", "subtitle": "~ Nartay: Проверка логики записи", "time": "19:42", "unread": 1, "color": "#8b5cf6"},
            {"name": "Жаным❤️", "subtitle": "Спишь", "time": "19:43", "unread": 0, "color": "#f87171"},
            {"name": "Гульчитай Мырзагали", "subtitle": "Ок", "time": "19:41", "unread": 0, "color": "#fb7185"},
            {"name": "Жансая Sevil", "subtitle": "Завтра в 14:00 вам удобно будет?", "time": "19:17", "unread": 2, "color": "#a78bfa"},
            {"name": "Туракбаевтар💰❤️", "subtitle": "Рқоша: 🎤 0:35", "time": "18:33", "unread": 11, "color": "#f59e0b"},
            {"name": "Нуртас 2GIS", "subtitle": "Хорошо, завтра созвонимся", "time": "18:01", "unread": 0, "color": "#34d399"},
            {"name": "Elite Force League", "subtitle": "Регламент уже финальный?", "time": "17:48", "unread": 3, "color": "#60a5fa"},
            {"name": "Casa Interiors", "subtitle": "Нужен еще один рендер", "time": "17:15", "unread": 0, "color": "#c084fc"},
            {"name": "Алина", "subtitle": "Нурали уже дома", "time": "16:22", "unread": 0, "color": "#fb923c"},
        ]

        self.messages = {
            "Sevil Kids": [
                {"from_me": False, "text": "Здравствуйте! Это тестовый бот Sevil Kids.", "time": "18:00"},
                {"from_me": False, "text": f"Текущий номер клиента для теста: {self.user_phone}", "time": "18:00"},
                {"from_me": False, "text": "Можно писать обычным языком. Для проверки FaaS попробуй: «Проверь клиента по номеру».", "time": "18:01"},
            ]
        }
        for chat in self.chats:
            self.messages.setdefault(chat["name"], [])

        self.style = ttk.Style()
        self.style.theme_use("clam")
        self.style.configure("Vertical.TScrollbar", background="#202c33", troughcolor="#111b21", borderwidth=0, arrowcolor="#8696a0")

        self.build_ui()
        self.populate_chat_list()
        self.render_messages()
        self.bind("<Return>", lambda e: self.send_message())

    def build_ui(self):
        self.grid_columnconfigure(0, weight=0, minsize=72)
        self.grid_columnconfigure(1, weight=0, minsize=390)
        self.grid_columnconfigure(2, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self.build_navbar()
        self.build_sidebar()
        self.build_chat_area()

    def icon_button(self, parent, text, command=None, size=16):
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=parent["bg"],
            fg="#aebac1",
            activebackground="#2a3942",
            activeforeground="#ffffff",
            bd=0,
            relief="flat",
            cursor="hand2",
            font=("Segoe UI Symbol", size),
            highlightthickness=0,
        )

    def build_navbar(self):
        nav = tk.Frame(self, bg="#202c33", width=72)
        nav.grid(row=0, column=0, sticky="ns")
        nav.grid_propagate(False)

        top = tk.Frame(nav, bg="#202c33")
        top.pack(fill="x", pady=(10, 0))

        for char in ["☰", "◉", "◔", "◌"]:
            self.icon_button(top, char).pack(pady=10)

        bottom = tk.Frame(nav, bg="#202c33")
        bottom.pack(side="bottom", fill="x", pady=10)

        self.icon_button(bottom, "🖼", size=14).pack(pady=8)
        self.icon_button(bottom, "⚙", command=self.open_settings).pack(pady=8)

        avatar = tk.Canvas(bottom, width=38, height=38, bg="#202c33", highlightthickness=0)
        avatar.pack(pady=(10, 6))
        avatar.create_oval(1, 1, 37, 37, fill="#53bdeb", outline="")
        avatar.create_text(19, 19, text="Д", fill="#111b21", font=("Segoe UI", 14, "bold"))

    def build_sidebar(self):
        self.sidebar = tk.Frame(self, bg="#111b21", width=390)
        self.sidebar.grid(row=0, column=1, sticky="nsew")
        self.sidebar.grid_propagate(False)
        self.sidebar.grid_rowconfigure(3, weight=1)
        self.sidebar.grid_columnconfigure(0, weight=1)

        header = tk.Frame(self.sidebar, bg="#111b21", height=78)
        header.grid(row=0, column=0, sticky="ew")
        header.grid_propagate(False)

        tk.Label(header, text="WhatsApp", bg="#111b21", fg="#f3f4f6", font=("Segoe UI", 22, "bold")).pack(side="left", padx=18, pady=18)

        header_icons = tk.Frame(header, bg="#111b21")
        header_icons.pack(side="right", padx=10)
        self.icon_button(header_icons, "⊞").pack(side="left", padx=8, pady=18)
        self.icon_button(header_icons, "⋮").pack(side="left", padx=4, pady=18)

        search_wrap = tk.Frame(self.sidebar, bg="#111b21")
        search_wrap.grid(row=1, column=0, sticky="ew", padx=14, pady=(0, 10))

        search_box = tk.Frame(search_wrap, bg="#202c33", height=42)
        search_box.pack(fill="x")
        search_box.pack_propagate(False)

        tk.Label(search_box, text="⌕", bg="#202c33", fg="#8696a0", font=("Segoe UI Symbol", 14)).pack(side="left", padx=(14, 10))
        search = tk.Entry(
            search_box,
            textvariable=self.search_var,
            bd=0,
            bg="#202c33",
            fg="#d1d7db",
            insertbackground="#d1d7db",
            font=("Segoe UI", 11),
        )
        search.pack(side="left", fill="both", expand=True, pady=11)
        search.bind("<KeyRelease>", lambda e: self.populate_chat_list())

        filters = tk.Frame(self.sidebar, bg="#111b21")
        filters.grid(row=2, column=0, sticky="ew", padx=14, pady=(0, 8))
        self.make_chip(filters, "Все", active=True).pack(side="left", padx=(0, 8))
        self.make_chip(filters, "Непрочитанное 31").pack(side="left", padx=(0, 8))
        self.make_chip(filters, "Избранное").pack(side="left", padx=(0, 8))
        self.make_chip(filters, "⌄").pack(side="left")

        chat_container = tk.Frame(self.sidebar, bg="#111b21")
        chat_container.grid(row=3, column=0, sticky="nsew")
        chat_container.grid_rowconfigure(0, weight=1)
        chat_container.grid_columnconfigure(0, weight=1)

        self.chat_canvas = tk.Canvas(chat_container, bg="#111b21", highlightthickness=0, bd=0)
        self.chat_canvas.grid(row=0, column=0, sticky="nsew")

        scroll = ttk.Scrollbar(chat_container, orient="vertical", command=self.chat_canvas.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.chat_canvas.configure(yscrollcommand=scroll.set)

        self.chat_list_frame = tk.Frame(self.chat_canvas, bg="#111b21")
        self.chat_canvas.create_window((0, 0), window=self.chat_list_frame, anchor="nw", width=372)
        self.chat_list_frame.bind("<Configure>", lambda e: self.chat_canvas.configure(scrollregion=self.chat_canvas.bbox("all")))

        banner_wrap = tk.Frame(self.sidebar, bg="#111b21")
        banner_wrap.grid(row=4, column=0, sticky="ew", padx=14, pady=12)
        install = tk.Frame(banner_wrap, bg="#25d366", height=38)
        install.pack(fill="x")
        install.pack_propagate(False)
        tk.Label(install, text="🟢  Gemini + FaaS test mode", bg="#25d366", fg="#111b21", font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=12, pady=8)

    def build_chat_area(self):
        self.chat_root = tk.Frame(self, bg="#0b141a")
        self.chat_root.grid(row=0, column=2, sticky="nsew")
        self.chat_root.grid_rowconfigure(1, weight=1)
        self.chat_root.grid_columnconfigure(0, weight=1)

        self.chat_header = tk.Frame(self.chat_root, bg="#202c33", height=72)
        self.chat_header.grid(row=0, column=0, sticky="ew")
        self.chat_header.grid_propagate(False)

        left = tk.Frame(self.chat_header, bg="#202c33")
        left.pack(side="left", fill="y")

        self.header_avatar = tk.Canvas(left, width=40, height=40, bg="#202c33", highlightthickness=0)
        self.header_avatar.pack(side="left", padx=(18, 12), pady=14)

        title_wrap = tk.Frame(left, bg="#202c33")
        title_wrap.pack(side="left", pady=12)

        self.chat_title = tk.Label(title_wrap, text=self.selected_chat, bg="#202c33", fg="#e9edef", font=("Segoe UI", 15, "bold"))
        self.chat_title.pack(anchor="w")
        self.chat_subtitle = tk.Label(title_wrap, text="Бот клиники · Gemini + FaaS", bg="#202c33", fg="#8696a0", font=("Segoe UI", 10))
        self.chat_subtitle.pack(anchor="w")

        actions = tk.Frame(self.chat_header, bg="#202c33")
        actions.pack(side="right", padx=12)
        self.icon_button(actions, "⌕").pack(side="left", padx=8, pady=16)
        self.icon_button(actions, "⋮").pack(side="left", padx=6, pady=16)

        body = tk.Frame(self.chat_root, bg="#0b141a")
        body.grid(row=1, column=0, sticky="nsew")
        body.grid_rowconfigure(0, weight=1)
        body.grid_columnconfigure(0, weight=1)

        self.msg_canvas = tk.Canvas(body, bg="#0b141a", highlightthickness=0, bd=0)
        self.msg_canvas.grid(row=0, column=0, sticky="nsew")

        msg_scroll = ttk.Scrollbar(body, orient="vertical", command=self.msg_canvas.yview)
        msg_scroll.grid(row=0, column=1, sticky="ns")
        self.msg_canvas.configure(yscrollcommand=msg_scroll.set)

        self.msg_frame = tk.Frame(self.msg_canvas, bg="#0b141a")
        self.msg_canvas.create_window((0, 0), window=self.msg_frame, anchor="nw", width=890)
        self.msg_frame.bind("<Configure>", lambda e: self.msg_canvas.configure(scrollregion=self.msg_canvas.bbox("all")))

        footer = tk.Frame(self.chat_root, bg="#202c33", height=74)
        footer.grid(row=2, column=0, sticky="ew")
        footer.grid_propagate(False)

        self.icon_button(footer, "+", size=21).pack(side="left", padx=(16, 8), pady=12)
        self.icon_button(footer, "☺", size=18).pack(side="left", padx=(0, 10), pady=12)

        entry_wrap = tk.Frame(footer, bg="#2a3942", height=46)
        entry_wrap.pack(side="left", fill="x", expand=True, pady=14)
        entry_wrap.pack_propagate(False)

        self.input_entry = tk.Entry(
            entry_wrap,
            textvariable=self.message_var,
            bd=0,
            bg="#2a3942",
            fg="#e9edef",
            insertbackground="#e9edef",
            font=("Segoe UI", 11),
        )
        self.input_entry.pack(fill="both", expand=True, padx=14, pady=12)

        self.icon_button(footer, "➤", command=self.send_message).pack(side="right", padx=18, pady=14)
        self.update_header()

    def make_chip(self, parent, text, active=False):
        bg = "#103529" if active else "#202c33"
        fg = "#25d366" if active else "#d1d7db"
        return tk.Label(parent, text=text, bg=bg, fg=fg, font=("Segoe UI", 10, "bold" if active else "normal"), padx=14, pady=8, cursor="hand2")

    def draw_avatar(self, canvas, color, letter):
        canvas.delete("all")
        canvas.create_oval(1, 1, 39, 39, fill=color, outline="")
        canvas.create_text(20, 20, text=letter, fill="#111b21", font=("Segoe UI", 13, "bold"))

    def get_chat(self, name):
        for chat in self.chats:
            if chat["name"] == name:
                return chat
        return self.chats[0]

    def update_header(self):
        chat = self.get_chat(self.selected_chat)
        self.chat_title.config(text=chat["name"])
        self.chat_subtitle.config(text=chat["subtitle"] if chat["name"] != "Sevil Kids" else "Бот клиники · Gemini + FaaS")
        self.draw_avatar(self.header_avatar, chat["color"], chat["name"][0].upper())

    def populate_chat_list(self):
        for child in self.chat_list_frame.winfo_children():
            child.destroy()

        search = self.search_var.get().strip().lower()

        archive = tk.Frame(self.chat_list_frame, bg="#111b21", height=42)
        archive.pack(fill="x")
        archive.pack_propagate(False)
        tk.Label(archive, text="▣  В архиве", bg="#111b21", fg="#e9edef", font=("Segoe UI", 12)).pack(side="left", padx=18, pady=8)
        tk.Label(archive, text="1", bg="#111b21", fg="#d1d7db", font=("Segoe UI", 10)).pack(side="right", padx=18, pady=10)

        for chat in self.chats:
            if search and search not in chat["name"].lower() and search not in chat["subtitle"].lower():
                continue

            active = chat["name"] == self.selected_chat
            row_bg = "#202c33" if active else "#111b21"

            row = tk.Frame(self.chat_list_frame, bg=row_bg, height=72, cursor="hand2")
            row.pack(fill="x")
            row.pack_propagate(False)

            avatar = tk.Canvas(row, width=50, height=50, bg=row_bg, highlightthickness=0, cursor="hand2")
            avatar.pack(side="left", padx=(16, 12), pady=10)
            avatar.create_oval(2, 2, 48, 48, fill=chat["color"], outline="")
            avatar.create_text(25, 25, text=chat["name"][0].upper(), fill="#111b21", font=("Segoe UI", 14, "bold"))

            content = tk.Frame(row, bg=row_bg)
            content.pack(side="left", fill="both", expand=True, pady=10)

            top = tk.Frame(content, bg=row_bg)
            top.pack(fill="x")

            tk.Label(top, text=chat["name"], bg=row_bg, fg="#e9edef", font=("Segoe UI", 12, "bold" if active else "normal"), anchor="w", cursor="hand2").pack(side="left")
            tk.Label(top, text=chat["time"], bg=row_bg, fg="#25d366" if chat["unread"] else "#8696a0", font=("Segoe UI", 9), cursor="hand2").pack(side="right", padx=16)

            bottom = tk.Frame(content, bg=row_bg)
            bottom.pack(fill="x", pady=(5, 0))

            tk.Label(bottom, text=chat["subtitle"], bg=row_bg, fg="#8696a0", font=("Segoe UI", 10), anchor="w", cursor="hand2").pack(side="left")

            if chat["unread"]:
                badge = tk.Canvas(bottom, width=24, height=24, bg=row_bg, highlightthickness=0, cursor="hand2")
                badge.pack(side="right", padx=16)
                badge.create_oval(2, 2, 22, 22, fill="#25d366", outline="")
                badge.create_text(12, 12, text=str(chat["unread"]), fill="#111b21", font=("Segoe UI", 8, "bold"))

            divider = tk.Frame(self.chat_list_frame, bg="#202c33", height=1)
            divider.pack(fill="x", padx=16)

            widgets = [row, avatar, content, top, bottom] + row.winfo_children() + content.winfo_children() + top.winfo_children() + bottom.winfo_children()
            for widget in widgets:
                widget.bind("<Button-1>", lambda e, name=chat["name"]: self.select_chat(name))

    def select_chat(self, name):
        self.selected_chat = name
        self.populate_chat_list()
        self.update_header()
        self.render_messages()

    def render_messages(self):
        for child in self.msg_frame.winfo_children():
            child.destroy()

        messages = self.messages.get(self.selected_chat, [])
        tk.Frame(self.msg_frame, bg="#0b141a", height=18).pack(fill="x")

        tk.Label(
            self.msg_frame,
            text=datetime.now().strftime("%d.%m.%Y"),
            bg="#182229",
            fg="#d1d7db",
            font=("Segoe UI", 9),
            padx=10,
            pady=5,
        ).pack(pady=(2, 12))

        for msg in messages:
            bubble = ChatBubble(self.msg_frame, msg["text"], msg["time"], outgoing=msg["from_me"])
            bubble.pack(fill="x")

        self.after(50, lambda: self.msg_canvas.yview_moveto(1.0))

    def append_message(self, chat_name, from_me, text):
        self.messages.setdefault(chat_name, []).append({
            "from_me": from_me,
            "text": text,
            "time": datetime.now().strftime("%H:%M"),
        })

    def send_message(self):
        text = self.message_var.get().strip()
        if not text:
            return

        self.message_var.set("")
        self.append_message(self.selected_chat, True, text)
        self.render_messages()

        if self.selected_chat == "Sevil Kids":
            self.after(150, lambda: self.bot_reply(text))

    def bot_reply(self, text):
        self.append_message("Sevil Kids", False, "Думаю...")
        self.render_messages()
        self.update_idletasks()

        self.messages["Sevil Kids"].pop()

        try:
            result = self.router.route_message(text, self.user_phone)
            reply = result.get("reply", "Пустой ответ.")
            debug = result.get("debug")

            self.append_message("Sevil Kids", False, reply)

            if debug:
                self.append_message("Sevil Kids", False, f"DEBUG FaaS:\n{debug}")

        except Exception as e:
            self.append_message("Sevil Kids", False, f"Ошибка: {e}")

        self.render_messages()

    def open_settings(self):
        dialog = SettingsDialog(self, self.user_phone)
        self.wait_window(dialog)
        if dialog.result:
            self.user_phone = dialog.result
            if len(self.messages["Sevil Kids"]) >= 2:
                self.messages["Sevil Kids"][1]["text"] = f"Текущий номер клиента для теста: {self.user_phone}"
            self.render_messages()
            messagebox.showinfo("Сохранено", f"Новый тестовый номер: {self.user_phone}")


if __name__ == "__main__":
    app = WhatsAppClone()
    app.mainloop()

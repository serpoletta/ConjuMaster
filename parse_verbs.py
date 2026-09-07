# -*- coding: utf-8 -*-
"""Парсер top200verbsfr.txt -> data.js для ConjuMaster.

Формат блока:
  <инфинитив> — <перевод RU>
  <fr форма с местоимением> — <ru перевод>
Блоки разделены пустой строкой. Поддерживает дефектные глаголы (falloir/il faut).
"""
import io, json, re

SRC = "top245verbsfr.txt"
DST = "data.js"

PRON_KEYS = ["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"]

def norm_key(first_token: str) -> str:
    t = first_token.strip().lower()
    if t.startswith("j'"):
        return "je"
    if t.startswith("s'"):
        return "je"
    if t in ("je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"):
        return t
    return t

def parse():
    raw = io.open(SRC, encoding="utf-8").read()
    blocks = [b.strip() for b in raw.replace("\r\n", "\n").split("\n\n") if b.strip()]
    verbs = []
    for b in blocks:
        lines = [ln.strip() for ln in b.split("\n") if ln.strip()]
        if not lines:
            continue
        head = lines[0]
        if "—" in head:
            inf, ru = [p.strip() for p in head.split("—", 1)]
        elif "-" in head:
            inf, ru = [p.strip() for p in head.split("-", 1)]
        else:
            inf, ru = head.strip(), ""
        forms = []
        for ln in lines[1:]:
            if "—" in ln:
                fr, ru_f = [p.strip() for p in ln.split("—", 1)]
            elif " - " in ln:
                fr, ru_f = [p.strip() for p in ln.split(" - ", 1)]
            else:
                continue
            first = fr.split()[0] if fr.split() else ""
            key = norm_key(first)
            if key not in PRON_KEYS:
                # пропустить строки без местоимения
                continue
            forms.append({"key": key, "fr": fr, "ru": ru_f})
        # убрать дубли ключей внутри глагола (оставить первое? нет — il/elle/on разные строки,
        # дубли возможны только при ошибках в файле; оставим все, но сделаем ключи уникальными)
        seen = {}
        uniq = []
        for f in forms:
            k = f["key"]
            if k in seen:
                seen[k] += 1
                f = dict(f, key="%s#%d" % (k, seen[k]))
            else:
                seen[k] = 1
            uniq.append(f)
        verbs.append({"inf": inf, "ru": ru, "forms": uniq})
    return verbs

def main():
    verbs = parse()
    total_forms = sum(len(v["forms"]) for v in verbs)
    payload = json.dumps(verbs, ensure_ascii=False)
    js = ("// Авто-сгенерировано из top245verbsfr.txt — не редактировать вручную.\n"
          "// Перегенерировать: python3 parse_verbs.py (исходник — SRC в начале файла)\n"
          "const VERBS = %s;\n" % payload)
    io.open(DST, encoding="utf-8", mode="w").write(js)
    print("verbs: %d" % len(verbs))
    print("forms: %d" % total_forms)
    keys = {}
    for v in verbs:
        for f in v["forms"]:
            keys[f["key"].split("#")[0]] = keys.get(f["key"].split("#")[0], 0) + 1
    print("by_pronoun: %s" % json.dumps(keys, ensure_ascii=False))

if __name__ == "__main__":
    main()

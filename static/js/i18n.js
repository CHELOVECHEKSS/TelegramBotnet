const I18N = {
    current: 'ru',
    langs: { ru: null, en: null },

    init() {
        this.langs.ru = LANG_RU;
        this.langs.en = LANG_EN;
        const saved = localStorage.getItem('tg_lang') || 'ru';
        this.apply(saved);
    },

    t(key) {
        return this.langs[this.current]?.[key] || this.langs['ru']?.[key] || key;
    },

    apply(lang) {
        this.current = lang;
        localStorage.setItem('tg_lang', lang);
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const val = this.t(key);
            if (el.tagName === 'OPTION') {
                el.textContent = val;
            } else if (el.dataset.i18nAttr === 'placeholder') {
                el.placeholder = val;
            } else {
                el.textContent = val;
            }
        });
        const sel = document.getElementById('settings-lang');
        if (sel) sel.value = lang;
    }
};

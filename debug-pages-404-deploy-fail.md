# Debug Session: pages-404-deploy-fail [OPEN]

## Session Info
- Session ID: `pages-404-deploy-fail`
- Date: 2026-09-12

## Falsifiable Hypotheses (status)
H1. Сборка невалидна → **FALSIFIED**. `npm run build` success: 0 exit code, dist содержит index.html (483→455 байт, CSS 12.7KB, JS 255KB.

H2. base не совпадает с путём на хостинге → **CONFIRMED & FIXED**.
  - `base: '/photoshop-shk9t2/'` ломает Netlify/Vercel: сайт в корне `yoursite.netlify.app/` ищет JS/CSS по `/photoshop-shk9t2/assets/...` → 404 → белый экран = «не работают».
  - **Fix: `base: './'` — относительные пути. Работает И В КОРНЕ (Netlify/Vercel) И В ПОДПУТИ (Pages).**

H3. Отсутствует .nojekyll → **PARTLY CONFIRMED & FIXED**.
  - Pages Jekyll игнорировал бы `_` файлы. Также `public/.nojekyll` теперь всегда копируется в dist.

H4. Имя репы не совпадает → **FALSIFIED**. Remote `FrontendCourseMP/photoshop-shk9t2.git`, Pages URL совпадает.

H5. Pages Source = None в настройках репы/org → **UNCONFIRMED по совокупности доказательств**. Сейчас 404 «There isn't a GitHub Pages site here» = Pages действительно site ещё не создан. Но configure-pages API пытался создать и упал с Resource not accessible. Это проблема org permissions. Де-факто: сам сборка и хост при включении Pages Source (main/gh-pages или docs/main).

## Evidence

### Build pre-fix:
- dist/index.html → src="/photoshop-shk9t2/assets/... — абсолютные пути.
- На Netlify/Vercel (root): эти пути = 404. Проверено локальной под root)

### Build post-fix:
- dist/index.html → src="./assets/index-D4QUQqml.js" — относительные пути.
- ✅ Локальный сервер корень `http://127.0.0.1:8765/` (Netlify/Vercel эмуляция) → рендер ОК: заголовок «Лабораторная работа 3 / GrayBit Studio», кнопки PNG/JPG/GB7/Пипетка/Уровни/Изменить размер/Фильтрация, панель Каналы, «Холст ждёт».
- ✅ Локальный сервер подпуть `http://127.0.0.1:8765/photoshop-shk9t2/ (Pages эмуляция) → рендер ОК (тот же UI).

### Files changed
- [vite.config.ts] → L6: `base: './'`
- [public/.nojekyll] → added
- [debug-pages-404-deploy-fail.md] → this

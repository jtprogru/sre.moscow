# sre.moscow — каталог SRE-сообщества на Astro.
#
# Makefile — единственное место, где описано, как проект ставится, проверяется
# и собирается. Workflow в .github/workflows зовут ровно эти цели, поэтому
# «у меня локально прошло» и «в CI прошло» означают одно и то же.

SHELL := /bin/bash
PORT ?= 4321

# GitHub Actions выставляет CI=true сам. Разница между локальной установкой и
# CI — только в этом флаге: в CI лок обязан совпадать с package.json, локально
# bun вправе его дописать. Команда при этом остаётся одна и та же.
BUN_INSTALL_FLAGS := $(if $(CI),--frozen-lockfile,)

.DEFAULT_GOAL := help
.PHONY: help install dev build preview typecheck lint test data-check contrast copy-check copy-check-dist brand-check ics-check check ui-check cover dependency-snapshot clean

# Порядок целей в check значим: дешёвое раньше дорогого, сборка раньше того,
# что читает dist/.
.NOTPARALLEL:

help: ## Показать доступные команды
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Вместе с зависимостями ставятся Chromium, Firefox и WebKit: их качают пакеты
# @playwright/browser-*. Не скачался браузер — падает вся установка, поэтому
# подсказка: без браузеров работает всё, кроме ui-check и cover.
node_modules: package.json bun.lock
	bun install $(BUN_INSTALL_FLAGS) || { echo "Если упала загрузка браузера, а make ui-check и make cover тебе не нужны: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 make install" >&2; exit 1; }
	@touch node_modules

install: node_modules ## Установить зависимости

dev: node_modules ## Dev-сервер на http://localhost:4321/
	bun run dev --port $(PORT)

build: node_modules ## Собрать сайт в dist/
	bun run build

preview: build ## Локальный просмотр готовой сборки
	bun run preview --port $(PORT)

typecheck: node_modules ## astro check — типы и схемы коллекций
	bun run check

lint: node_modules ## Линт markdown
	bun run lint

test: node_modules ## Тесты проверок данных
	bun test tools/

# То, что схема не видит: дубли адресов, порядок дат, ссылки между записями,
# согласие в профилях. Правила и их обоснование — в шапке tools/check-data.mjs.
data-check: node_modules ## Проверить данные в data/
	bun tools/check-data.mjs

contrast: ## Проверить контраст цветовых ролей (WCAG AA)
	bun tools/check-contrast.mjs

# Слова сверяются с каноном в src/lib/site.ts в два захода: исходники — сразу,
# заголовки и подвал страниц — по dist/, поэтому вторая цель зависит от сборки.
copy-check: ## Проверить слова в исходниках: канон и запрещённые слова
	bun tools/check-copy.mjs --source

copy-check-dist: build ## Проверить <title>, подвал и заголовки собранных страниц
	bun tools/check-copy.mjs --dist

# Правила из BRAND.md. По исходникам: цвет и размеры шрифта только из токенов,
# SVG рисуют компоненты, стрелки — иконки. По dist/: у кнопки есть иконка,
# комплект фавиконов собран целиком. Кнопку собирают компоненты, иконки рисует
# сборка, поэтому цель от неё зависит.
brand-check: build ## Проверить исходники и сборку на правила BRAND.md
	bun tools/check-brand.mjs

# Календарь проверяется по dist/, поэтому цель зависит от сборки.
ics-check: build ## Проверить собранный events.ics сторонним парсером
	bun tools/check-ics.mjs

check: lint contrast copy-check test data-check typecheck build ics-check copy-check-dist brand-check ## Всё, что гоняет CI на PR

# Вёрстка в браузерах по матрице экранов: прокрутка, цели под палец, мелкий
# текст, шапка, клавиатура. В make check не входит: нужны Node и движки
# Playwright, а PR с одной записью в data/ ждать их не должен. Все три
# движка — dev-зависимости @playwright/browser-*, их ставит make install;
# движок, который не запустился, пропускается, в CI это ошибка.
ui-check: build ## Проверить вёрстку в браузерах, скриншоты — в ui-check/
	node tools/ui-check.mjs

# Обложка репозитория: шапка README.md и Social preview на GitHub. PNG лежат
# в .github/ и пересобираются руками, когда меняется знак, сова, палитра или
# слова. В make check не входит: снимок делает Chromium из Playwright. Размер
# и цвет готовых картинок сторожит make test.
cover: node_modules ## Пересобрать обложку репозитория в .github/
	bun tools/cover.mjs

dependency-snapshot: node_modules ## Собрать снапшот дерева зависимостей для GitHub
	bun tools/bun-dependency-snapshot.mjs > dependency-snapshot.json

clean: ## Убрать сборку и кеши
	rm -rf dist .astro dependency-snapshot.json

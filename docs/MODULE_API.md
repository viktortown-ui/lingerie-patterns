# Контракт модуля выкройки

Каждый вид изделия — ES-модуль `PatternModule`, зарегистрированный в `src/patterns/index.js`. Пользовательский интерфейс строится из схемы автоматически.

## PatternModule

```js
new PatternModule({
  id: "unique_id",
  name: { ru: "Название", en: "Name" },
  category: "category.key",
  version: "1.0.0",
  description: { ru: "...", en: "..." },
  status: "ready-for-toile",
  fitRisk: {
    level: "moderate",
    reason: { ru: "Почему нужен макет", en: "Why a toile is required" }
  },
  compatibleDraftVersions: [],
  tags: ["..."],
  hidden: false,
  schema,
  draft(measurements, options, adjustments = {}) {},
});
```

`hidden` позволяет оставить служебный модуль доступным тестам, но не показывать его в каталоге. Поле `schema.bodyRegion` (`lower` или `upper`) выбирает подходящую подсказку по снятию мерок.

Конструктор проверяет контракт до регистрации:

- `id` состоит из 1–64 латинских букв, цифр, `.`, `_` или `-`, а `schema.id` точно совпадает с ним;
- `version` является семантической версией, например `1.0.0`;
- статус модуля — только `draft`, `experimental` или `ready-for-toile`;
- видимый модуль имеет двуязычный `fitRisk` уровня `moderate` или `high`;
- `compatibleDraftVersions` содержит только уникальные семантические версии и не повторяет текущую;
- единицы схемы — `mm`, `cm` или `in`;
- идентификаторы секций и все ключи полей, опций и поправок уникальны;
- defaults существуют для каждого поля/опции, имеют правильный тип и входят в разрешённые диапазоны/choices;
- повторная регистрация уже занятого `id` завершается ошибкой.

После проверки описательные данные модуля клонируются и замораживаются. Нельзя зарегистрировать объект, а затем незаметно изменить его схему через прежнюю ссылку. Изменение алгоритма или контракта требует новой `module.version`; сохранённый проект, профиль или шаблон фасона с другой явной версией применяется только при наличии этой версии в `compatibleDraftVersions`. Все остальные версии отклоняются без молчаливой миграции.

## Schema

```js
{
  id: "unique_id",
  name: { ru: "...", en: "..." },
  bodyRegion: "lower",
  unit: "cm",
  sections: [
    { id: "measurements", step: 1, title: { ru: "Мерки", en: "Measurements" } }
  ],
  fields: [
    {
      key: "waist",
      code: "OT",
      section: "measurements",
      label: { ru: "Обхват талии", en: "Waist circumference" },
      description: { ru: "...", en: "..." },
      impact: { ru: "ширину по талии", en: "waist width" },
      min: 48,
      max: 150,
      step: 0.5,
      repeatTolerance: 0.5
    }
  ],
  defaults: { waist: 72 },
  options: [
    {
      key: "riseLevel",
      section: "style",
      display: "cards",
      label: { ru: "Посадка", en: "Rise" },
      choices: [{ label: { ru: "Средняя", en: "Mid" }, value: "mid" }],
      default: "mid"
    }
  ],
  optionDefaults: { riseLevel: "mid" },
  adjustments: [
    {
      key: "frontWaistDepth",
      code: "A1",
      axis: "y",
      label: { ru: "Глубина талии переда", en: "Front waist depth" },
      min: -2,
      max: 2,
      step: 0.1,
      unit: "cm",
      default: 0
    }
  ],
  validate(values) { return {}; }
}
```

`validate` возвращает объект `key -> [{ru, en}]` и предназначен для связанных ограничений между несколькими полями/опциями.

Все поля `schema.fields` по умолчанию требуют независимого повторного ввода перед физическим экспортом. `repeatTolerance` задаёт допустимое расхождение; при отсутствии используется `step`, затем 0,5 единицы. Только поле с `requiresRepeat: false` исключается из проверки. Повтор вне `min/max` не может получить статус совпадения. В экспорт попадает лишь итоговая сводка, а не второй набор личных чисел.

`adjustments` описывает безопасные именованные поправки контрольных линий. Третий аргумент `draft` необязателен: старые модули с двумя аргументами продолжают работать. Для промышленной поточечной градации в будущем понадобятся устойчивые идентификаторы конструктивных точек и отдельные проверенные таблицы правил; текущие A1/A2/B1/B2/C1 являются параметрами повторного построения.

Для верхних моделей библиотека возможных мерок и материала находится в `src/patterns/shared/upperBodySchema.js`, а общие геометрические примитивы — в `upperBodyDraft.js`. Публичная схема выбирает только поля, реально влияющие на её геометрию: текущий бралетт использует 4, топ — 8. Экспериментальный модуль обязан передавать `status: "experimental"`, предупреждение о макете и `fitStatus: "experimental"`; прохождение численных тестов само по себе не повышает его статус.

## DraftResult

```js
{
  panels: [
    {
      id: "front",
      name: { ru: "Перед", en: "Front" },
      cutQty: { ru: "1 со сгибом", en: "1 on fold" },
      material: { ru: "Основная ткань", en: "Main fabric" },
      paths: {
        cut: Path,
        seam: Path
      }
    }
  ],
  paths: { front_cut: Path, front_seam: Path },
  annotations: [
    { type: "grainline", start: Point, end: Point },
    { type: "stretchline", start: Point, end: Point, label: { ru: "...", en: "..." } },
    { type: "notch", point: Point },
    { type: "foldline", start: Point, end: Point, label: { ru: "...", en: "..." } },
    { type: "label", point: Point, text: { ru: "...", en: "..." } }
  ],
  meta: {
    unit: "cm",
    title: { ru: "...", en: "..." },
    moduleId: "unique_id",
    moduleVersion: "1.0.0",
    moduleStatus: "ready-for-toile",
    fitStatus: "ready-for-toile",
    seamAllowanceMm: 6,
    edgeAllowancesMm: { joining: 6, waist: 6, leg: 6, fold: 0 },
    warnings: [],
    checks: [],
    materials: [],
    instructions: [],
    engineering: {}
  }
}
```

`seam` — расчётная линия строчки, `cut` — сплошная линия кроя. Для нового модуля добавьте папку в `src/patterns`, экспорт в `src/patterns/index.js`, валидные defaults/options и тестовые наборы. Публичный модуль не должен считаться готовым только потому, что отображается: требуются численные тесты, печать, макеты и журнал поправок.

## Пакетный пересчёт

`src/core/grading/patternBatch.js` предоставляет два явно различающихся режима:

```js
const individual = createIndividualPatternBatch(module, [
  { id: "anna", measurements, options, adjustments }
]);

const sizeSet = createRuleBasedSizeBatch(module, {
  ruleId: "custom-v1",
  baseProfile: { id: "M", measurements, adjustments },
  sizes: [
    { id: "S", deltas: { waist: -4, seat: -4 } },
    { id: "M", deltas: {} },
    { id: "L", deltas: { waist: 4, seat: 4 } }
  ]
}, {
  commonOptions: options,
  commonAdjustments: adjustments
});
```

- `createIndividualPatternBatch` независимо строит лекало для каждого полного профиля мерок;
- `createRuleBasedSizeBatch` применяет явные прибавки к меркам базы и заново строит каждый размер;
- оба результата детерминированы, содержат audit-manifest и флаги `industrialPointGrade: false`, `productionQualified: false`;
- это пока не промышленная поточечная градация.

## Шаблон фасона

Шаблон — переносимый JSON-набор опций и ограниченных поправок конкретной версии модуля. Мерки тела в этот формат не входят принципиально.

```js
{
  kind: "lekalo-style-template",
  formatVersion: 1,
  id: "my.high-rise-classic",
  version: "1.0.0",
  moduleId: "panties_basic",
  moduleVersion: "1.0.0",
  name: { ru: "Моя высокая посадка", en: "My high rise" },
  description: { ru: "...", en: "..." },
  status: "draft",
  license: { spdx: "LicenseRef-Private" },
  provenance: {
    kind: "original",
    author: "Local user",
    source: "Created locally in LEKALO"
  },
  options: { riseLevel: "high", legRise: "classic" },
  adjustments: { frontWaistDepth: 0.3 }
}
```

Основные функции находятся в `src/core/templates/`:

```js
const template = importTemplateJson(text, getModule);
const settings = resolveTemplateSettings(template, getModule(template.moduleId));
const json = exportTemplateJson(template, getModule(template.moduleId));
```

Проверка принимает только plain JSON-объекты без accessor/function-значений и только поля из allowlist. Поле `measurements` блокируется отдельно. `moduleId` обязан точно совпасть с доступным модулем, а `moduleVersion` — с его текущей или явно объявленной совместимой версией; ключи опций/поправок, choices, диапазоны, шаг и связанные ограничения берутся из текущей схемы. Один файл ограничен 64 КБ, активная библиотека — 1 МБ и 100 шаблонами. До 100 корректных, но несовместимых с установленными версиями записей сохраняются отдельно в карантине; трёхфазная запись удерживает восстановимую копию при частичном отказе `localStorage`.

`resolveTemplateSettings` возвращает только `{ moduleId, moduleVersion, options, adjustments }` с дополненными defaults и никогда не создаёт мерки. `TemplateStorage` — локальный адаптер с полной проверкой перед чтением/записью; ошибка одного файла не должна приводить к частичному применению. Встроенные наборы из `builtInUnderwearTemplates.js` проходят тот же контракт.

Лицензия и происхождение обязательны как метаданные, но их наличие не является автоматической юридической проверкой. Для производственного или публичного каталога нужен отдельный процесс проверки прав и физической посадки.

## Безопасное статическое SVG-лекало

`src/core/import/staticSvg.js` — не универсальный SVG-санитайзер и не конвертер в параметрическую формулу. Это строгий parser ограниченного подмножества для локального просмотра чужой статической геометрии:

```js
const geometry = await readStaticSvgFile(file);

// geometry.kind === "lekalo-static-pattern"
// geometry.editable === false
// geometry.calibration.requiresCalibration сообщает о масштабе
```

Parser никогда не вставляет источник в DOM и не возвращает исходную разметку. Он принимает корневой `svg`, группы и геометрию `path`, `line`, `polyline`, `polygon`, `rect`; для путей разрешены только `M/L/H/V/Q/C/Z` и их относительные формы. Результат состоит из замороженных сегментов `M/L/C/Z`, числового viewport/bounds, статистики, калибровки и SHA-256 источника.

Импорт целиком отклоняется при скриптах, обработчиках событий, `foreignObject`, ссылках/references, CSS/`url()`, `DOCTYPE`/entities, тексте, неизвестных элементах или командах, опасных transform и превышении лимитов. Основные границы: 2 МБ, 1 000 рисуемых объектов, 10 000 XML-элементов, глубина 64 и 50 000 команд путей.

Масштаб выводится из согласованных `width`/`height` и `viewBox` либо из явного `data-mm-per-unit`. При отсутствии этих данных `requiresCalibration: true`; такой файл нельзя считать физически масштабированным. Распознанное число также нужно подтвердить контрольным отрезком и пробной печатью.

`createStaticPatternRepository` хранит нормализованные записи в IndexedDB: до 24 файлов, до 4 МБ на запись и до 16 МБ на библиотеку. `list()` отдаёт карточкам только метаданные, а полная геометрия читается через `get(id)` лишь при открытии, поэтому домашний экран не удерживает все контуры в памяти. Запись и удаление подтверждаются только после завершения транзакции; при недоступности базы сохранение использует память сеанса и явно сообщает, что оно временное. Сохранённая запись принудительно получает `status: "personal-unverified"`. `serializeStaticPatternSvg` создаёт новую безопасную SVG-копию только из нормализованных сегментов.

Статический импорт не добавляет мерки, формулы, редактируемые узлы, автоматическую градацию, PDF/DXF, проверку посадки или производственную квалификацию. Для превращения такой заготовки в параметрический модуль нужен отдельный ручной контракт `PatternModule`, формулы, тесты и физические макеты.

## DXF

```js
const { data, fileName, report } = buildDxfExport(draft, {
  outputUnit: "mm",
  curveTolerance: 0.2,
  resolveText
});
```

Экспорт создаёт ASCII DXF R12 (`AC1009`) с `$INSUNITS`, адаптивно аппроксимированными замкнутыми полилиниями и слоями `CUT`, `SEAM`, `NOTCH`, `GRAIN`, `TEXT`. Идентификатор детали, материал, количество кроя, модуль и роль пути сохраняются в `LEKALO` XDATA. Перед возвратом файл разбирается `parseAsciiDxf`; нечисловая геометрия, незамкнутый контур и неизвестные единицы блокируют экспорт.

`report.internalParserRoundTrip: true` означает только проверку собственным строгим парсером. Внешняя тестовая проверка через `ezdxf` подтверждает читаемость контрольного файла, но runtime-флаги `externalCadRoundTrip`, `aamaAstmCertified` и `industrialProductionQualified` намеренно остаются `false`, пока каждый целевой процесс не будет открыт, сохранён и сопоставлен в независимой производственной CAD.

Перед вызовом экспортёра общий UI требует совпавший повторный замер. Экспортёры сами повторно разрешают статус через `resolveExportSafety`, поэтому экспериментальность в `module.status` или `draft.meta.fitStatus` нельзя скрыть ошибкой вызывающего кода. Для составного ZIP применяется `strictestExportSafety`: один экспериментальный вариант повышает статус всего пакета. Проверка базы не переносится на вычисленные размеры; это явно фиксируется в manifest.

Для пакетной выдачи `createStoredZip([{ name, content }])` создаёт детерминированный ZIP32 без сжатия. `parseStoredZip` перепроверяет структуру, размеры и CRC каждого файла.

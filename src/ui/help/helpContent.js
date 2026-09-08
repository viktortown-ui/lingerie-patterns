export const HELP_CONTENT_VERSION = 1;

export const HELP_TOPIC_IDS = Object.freeze([
  "quick-start",
  "measurements",
  "style-controls",
  "saving",
  "add-patterns",
  "svg-import",
  "export-print",
  "size-set",
  "fit-privacy",
]);

const topics = [
  {
    id: "quick-start",
    keywords: {
      ru: "начало начать запуск windows телефон планшет pwa первая выкройка основа порядок работа",
      en: "start begin launch windows phone tablet pwa first pattern base workflow",
    },
    ru: {
      title: "Быстрый старт",
      summary: "От выбора основы до проверочной печати — без лишних настроек.",
      intro: "Для первой выкройки двигайтесь по шагам редактора слева направо. Изменение любого параметра сразу перестраивает чертёж.",
      steps: [
        "В Windows дважды щёлкните ярлык «ЛЕКАЛО» или LEKALO.exe; на телефоне и планшете откройте веб-версию либо установленную PWA.",
        "На главной выберите подходящую основу и нажмите «Создать выкройку».",
        "Введите мерки в сантиметрах. Красное сообщение нужно исправить, предупреждение — внимательно перепроверить.",
        "Укажите растяжимость ткани и резинки, затем выберите фасон и обработку краёв.",
        "При необходимости скорректируйте форму управляемыми точками A/B/C и проверьте линии на чертеже.",
        "Скачайте PDF, сначала распечатайте контрольную страницу при масштабе 100% и измерьте тестовые квадраты.",
        "Сшейте пробный образец из похожего недорогого материала и только после примерки используйте дорогую ткань.",
      ],
      bullets: [
        "Основная Windows-версия работает отдельным окном: запускать CMD, локальный сервер или вкладку браузера не нужно.",
        "Для офлайн-работы веб/PWA сначала один раз полностью откройте текущую версию при доступном интернете.",
        "При доступном локальном хранилище изменения сохраняются на текущем устройстве; при блокировке приложение честно сообщает о работе только в текущем сеансе.",
        "Для переноса работы между устройствами используйте проект JSON или резервную копию профилей.",
      ],
      warningTitle: "Главное правило",
      warning: "Компьютерная проверка геометрии не заменяет пробный пошив и примерку.",
    },
    en: {
      title: "Quick start",
      summary: "From choosing a base to a calibrated test print.",
      intro: "For your first pattern, follow the editor steps from left to right. Every change immediately redrafts the geometry.",
      steps: [
        "On Windows, double-click the LEKALO shortcut or LEKALO.exe; on a phone or tablet, open the web app or installed PWA.",
        "Choose a base on the home screen and select Create pattern.",
        "Enter measurements in centimetres. Fix errors and carefully recheck warnings.",
        "Enter fabric and elastic stretch, then choose style and edge construction.",
        "If needed, refine the shape with guided A/B/C controls and inspect the drawing.",
        "Download PDF, print the calibration page at 100%, and measure the test squares.",
        "Sew a toile in an inexpensive fabric with similar stretch before using final fabric.",
      ],
      bullets: [
        "The primary Windows version opens as a standalone app; it does not require CMD, a local server, or a browser tab.",
        "For offline Web/PWA use, fully open the current release once while an internet connection is available.",
        "When local storage is available, changes stay on the current device; if storage is blocked, the app clearly reports session-only work.",
        "Use project JSON or a profile backup to move work between devices.",
      ],
      warningTitle: "Essential rule",
      warning: "Geometry checks never replace a physical toile and fitting.",
    },
  },
  {
    id: "measurements",
    keywords: {
      ru: "мерки снять сантиметр талия бедра грудь ткань растяжимость резинка",
      en: "measure measurements waist hip bust fabric stretch elastic",
    },
    ru: {
      title: "Мерки и растяжимость",
      summary: "Как снять мерки и проверить материал, чтобы расчёт имел смысл.",
      intro: "Снимайте мерки поверх тонкого белья, без утяжки. Сантиметровая лента должна прилегать к телу и оставаться параллельной полу на горизонтальных обхватах.",
      steps: [
        "Для низа завяжите тонкую ленту на естественной талии и не перемещайте её до окончания всех вертикалей и дуг.",
        "Для верха используйте одну и ту же точку основания шеи; обхват под грудью снимайте плотно на спокойном выдохе.",
        "Каждую непривычную мерку прочитайте в подсказке непосредственно под полем.",
        "Для ткани отметьте 10 см поперёк долевой, растяните без повреждения и внесите полученную длину в калькулятор.",
        "Рабочая растяжимость должна быть ниже предельной; отдельно оцените восстановление ткани после растяжения.",
      ],
      bullets: [
        "Не смешивайте сантиметры и миллиметры: форма использует единицы, указанные рядом с полем.",
        "Если мерки снимал другой человек или прошло время, создайте отдельный профиль.",
      ],
      warningTitle: "Если появилась ошибка",
      warning: "Не подгоняйте число только ради исчезновения сообщения — сначала повторно снимите мерку и проверьте связанную мерку.",
    },
    en: {
      title: "Measurements and stretch",
      summary: "How to measure the body and material reliably.",
      intro: "Measure over light underwear without tightening. Keep the tape against the body and level for horizontal circumferences.",
      steps: [
        "For lower-body patterns, tie a narrow tape at the natural waist and keep it fixed while taking verticals and arcs.",
        "For upper-body patterns, use the same neck-base point; measure underbust firmly on a relaxed exhale.",
        "Read the helper text under every unfamiliar field.",
        "Mark 10 cm across the grain, stretch without damage, and enter the stretched length in the calculator.",
        "Working stretch must remain below maximum stretch; assess recovery separately.",
      ],
      bullets: [
        "Do not mix centimetres and millimetres; use the unit shown beside each field.",
        "Create a separate profile when measurements belong to another person or measurement session.",
      ],
      warningTitle: "When validation fails",
      warning: "Never change a number merely to silence an error. Measure again and check related values.",
    },
  },
  {
    id: "style-controls",
    keywords: {
      ru: "фасон посадка форма точки a b c линии двигать валентина отменить повторить",
      en: "style fit shape points a b c lines move undo redo",
    },
    ru: {
      title: "Фасон и точки A/B/C",
      summary: "Безопасное изменение посадки и линий без ручного ввода формул.",
      intro: "Карточки фасона меняют конструктивные варианты, а A/B/C — ограниченные параметры отдельных линий. После каждого изменения лекало строится заново и снова проходит проверки.",
      steps: [
        "Сначала выберите посадку, покрытие, линию ноги, ластовицу и способ обработки.",
        "Нажмите «Точки A/B/C» над чертежом, чтобы показать управляемые маркеры.",
        "Перетащите маркер либо введите точное число в панели «Управляемые точки A/B/C».",
        "Используйте «Отменить» и «Вернуть» для сравнения вариантов, а «Сбросить» — для возврата всех поправок к нулю.",
        "Проверьте сопряжение швов и предупреждения после изменения формы.",
      ],
      bullets: [
        "A1/A2 управляют передом, B1/B2 — спинкой, C1 — согласованной высотой бокового шва низа.",
        "Это понятные ограниченные поправки, а не свободное перемещение любой точки как в полном САПР.",
      ],
      warningTitle: "Не растягивайте пределы",
      warning: "Если нужной формы нет в разрешённом диапазоне, требуется новый фасон или новый параметрический модуль, а не обход ограничения.",
    },
    en: {
      title: "Style and A/B/C controls",
      summary: "Guided fit and line changes without exposing formulas.",
      intro: "Style cards change construction choices. A/B/C controls make bounded line adjustments. The pattern is redrafted and revalidated after every change.",
      steps: [
        "Choose rise, coverage, leg line, gusset, and edge construction first.",
        "Select A/B/C points above the drawing to reveal guided handles.",
        "Drag a handle or enter an exact number in the Guided A/B/C controls panel.",
        "Use Undo and Redo to compare variants, or Reset to return all adjustments to zero.",
        "Review seam matching and warnings after changing the shape.",
      ],
      bullets: [
        "A1/A2 control the front, B1/B2 the back, and C1 the coordinated lower-body side seam height.",
        "These are bounded understandable controls, not unrestricted CAD point editing.",
      ],
      warningTitle: "Respect the bounds",
      warning: "If the needed shape is outside the allowed range, create a new style or drafting module instead of bypassing the limit.",
    },
  },
  {
    id: "saving",
    keywords: {
      ru: "сохранить профиль проект json шаблон фасона резервная копия перенос синхронизация",
      en: "save profile project json style template backup transfer sync",
    },
    ru: {
      title: "Сохранение и перенос",
      summary: "Чем отличаются профиль, фасон, проект и резервная копия.",
      intro: "Приложение хранит рабочий черновик автоматически, но разные файлы решают разные задачи.",
      steps: [
        "«Сохранить текущий» создаёт профиль конкретного человека: мерки, опции и поправки.",
        "«Сохранить фасон» сохраняет только внешний вид и обработку без личных мерок.",
        "«Проект JSON» сохраняет текущую модель вместе с мерками и настройками — не публикуйте его без согласия человека.",
        "«Резервная копия» выгружает все профили для восстановления или переноса.",
        "Перед очисткой данных браузера скачайте проекты, профили и нужные личные SVG.",
      ],
      bullets: [
        "Windows-программа и сайт используют отдельные локальные хранилища и не синхронизируются автоматически.",
        "Сохранённый фасон применяется только к той же основе и совместимой версии модуля.",
      ],
      warningTitle: "Личные данные",
      warning: "Файл проекта содержит мерки тела. Перед отправкой другому человеку проверьте, что вы действительно хотите ими поделиться.",
    },
    en: {
      title: "Saving and transfer",
      summary: "Profiles, styles, projects, and backups serve different purposes.",
      intro: "The working draft is saved automatically, while each export format has a distinct purpose.",
      steps: [
        "Save current creates a person's profile with measurements, options, and adjustments.",
        "Save style stores appearance and construction choices without body measurements.",
        "Project JSON stores the current model, measurements, and settings; do not publish it without consent.",
        "Backup exports all profiles for recovery or transfer.",
        "Before clearing browser data, export projects, profiles, and personal SVG files you need.",
      ],
      bullets: [
        "The Windows app and website use separate local storage and do not sync automatically.",
        "A style applies only to the same base and a compatible module version.",
      ],
      warningTitle: "Personal data",
      warning: "A project file contains body measurements. Confirm that you intend to share them before sending it to anyone.",
    },
  },
  {
    id: "add-patterns",
    keywords: {
      ru: "добавить выкройку создать шаблон новая одежда модуль pdf dxf фото заготовка библиотека",
      en: "add pattern create template new garment module pdf dxf photo library",
    },
    ru: {
      title: "Как добавлять выкройки",
      summary: "Три честных пути: свой фасон, статический SVG или новая умная основа.",
      intro: "Сначала определите, что именно у вас есть. Готовая картинка и параметрическая выкройка — не одно и то же.",
      steps: [
        "Новый фасон: откройте готовую основу, настройте опции и A/B/C, затем выберите «Сохранить фасон».",
        "Готовое лекало одного размера: на главной нажмите «+ Добавить SVG» и пройдите проверку файла, прав и масштаба.",
        "Совершенно новый вид одежды: подготовьте разрешённый чертёж или правила построения, список мерок, детали, швы, надсечки и требования к посадке.",
        "Для новой умной основы создаётся отдельный модуль с формулами и тестами; после этого она пересчитывается под мерки как встроенные модели.",
        "После численных тестов обязательно выполняются печать 100%, пробный пошив и журнал поправок.",
      ],
      bullets: [
        "SVG сейчас импортируется как статическая геометрия. PDF, DXF и фотографии можно использовать как исходный материал для ручной подготовки нового модуля, но не импортировать напрямую.",
        "Случайная картинка из интернета не содержит формул, масштаба, прав использования и проверенной посадки.",
      ],
      warningTitle: "Авторские права",
      warning: "В публичный каталог можно добавлять собственные построения, заказанную работу с переданными правами или материал с проверенной совместимой лицензией. Коммерческий PDF нельзя копировать без разрешения.",
    },
    en: {
      title: "How to add patterns",
      summary: "Three honest paths: a style, a static SVG, or a new smart base.",
      intro: "First identify what you actually have. A finished drawing and a parametric pattern are not the same thing.",
      steps: [
        "New style: open an existing base, adjust options and A/B/C, then choose Save style.",
        "One-size finished pattern: select + Add SVG on the home screen and complete file, rights, and scale checks.",
        "Entirely new garment: prepare an authorised drawing or drafting rules, measurement list, pieces, seams, notches, and fit requirements.",
        "A new smart base needs a dedicated formula-driven module and tests before it can redraft from measurements.",
        "After numeric tests, complete a 100% print check, physical toile, and correction log.",
      ],
      bullets: [
        "SVG is currently imported as static geometry. PDF, DXF, and photos may be source material for manual module development, but cannot be imported directly yet.",
        "A random online image does not contain formulas, reliable scale, usage rights, or validated fit.",
      ],
      warningTitle: "Copyright",
      warning: "A public catalogue may include original work, commissioned work with transferred rights, or material with a verified compatible licence. Never copy a commercial PDF without permission.",
    },
  },
  {
    id: "svg-import",
    keywords: {
      ru: "svg импорт масштаб калибровка статическое лекало файл контур безопасность",
      en: "svg import scale calibration static pattern file outline safety",
    },
    ru: {
      title: "Импорт SVG",
      summary: "Безопасное хранение готового векторного лекала и проверка масштаба.",
      intro: "Импорт выполняется полностью на устройстве. Исходная разметка не вставляется в страницу: приложение оставляет только поддерживаемые линии и контуры.",
      steps: [
        "На главной нажмите «+ Добавить SVG» и выберите файл размером не более 2 МБ.",
        "Проверьте найденные контуры, число команд и состояние физического масштаба.",
        "Укажите название, автора, источник и лицензию, затем подтвердите право использования.",
        "Если масштаб не подтверждён, исправьте исходный SVG по известному контрольному отрезку и импортируйте снова.",
        "После добавления откройте карточку, скачайте нормализованную копию и сделайте пробную печать при 100%.",
      ],
      bullets: [
        "Поддерживаются path, line, polyline, polygon и rect с ограниченным набором безопасных команд.",
        "Импортированный SVG остаётся «Личным • не проверено»: он не получает формул, градации, PDF/DXF или статуса готовности к производству.",
      ],
      warningTitle: "Масштаб обязателен",
      warning: "Даже распознанный размер подтвердите линейкой на тестовой печати. Без контрольного размера раскрой недопустим.",
    },
    en: {
      title: "SVG import",
      summary: "Safely store a finished vector pattern and verify its scale.",
      intro: "Import happens entirely on the device. Source markup is never inserted into the page; only supported lines and outlines remain.",
      steps: [
        "Select + Add SVG on the home screen and choose a file up to 2 MB.",
        "Review detected geometry, command count, and physical scale status.",
        "Enter title, author, source, and licence, then confirm usage rights.",
        "If scale is unknown, correct the source against a known reference length and import it again.",
        "Open the saved card, download the normalized copy, and make a 100% test print.",
      ],
      bullets: [
        "Supported geometry includes path, line, polyline, polygon, and rect with a restricted safe command set.",
        "Imported SVG remains Personal and unverified; it gains no formulas, grading, PDF/DXF generation, or production status.",
      ],
      warningTitle: "Scale is mandatory",
      warning: "Confirm even a detected scale with a ruler on a test print. Never cut without a known reference length.",
    },
  },
  {
    id: "export-print",
    keywords: {
      ru: "pdf svg dxf печать принтер 100 масштаб а4 а3 letter a0 экспорт производство",
      en: "pdf svg dxf print printer 100 scale a4 a3 letter a0 export production",
    },
    ru: {
      title: "Экспорт и печать",
      summary: "Как получить файл правильного размера и не испортить масштаб.",
      intro: "PDF предназначен для печати, SVG — для векторной доработки, DXF — для обмена с CAD. Проект JSON сохраняет исходные параметры, а не только линии.",
      steps: [
        "Выберите формат бумаги A4, A3, Letter или A0 перед созданием PDF.",
        "Распечатайте только контрольную страницу с настройкой 100% / Actual size.",
        "Отключите Fit, Shrink, «Подогнать» и любые автоматические поля принтера.",
        "Измерьте квадраты 50 × 50 и 100 × 100 мм; продолжайте только при точном совпадении.",
        "Соберите листы по координатам R1C1, R1C2 и совмещайте повторяющуюся зону нахлёста 10 мм.",
        "Перед производством откройте DXF обратно в целевой CAD и проверьте миллиметры, слои, замкнутость и контрольный размер.",
      ],
      bullets: [
        "DXF использует слои CUT, SEAM, NOTCH, GRAIN и TEXT и проходит внутреннее повторное чтение.",
        "Внутренняя проверка не является сертификатом AAMA/ASTM и не гарантирует настройки конкретного режущего комплекса.",
      ],
      warningTitle: "Не ориентируйтесь на экран",
      warning: "Экранный масштаб нужен для просмотра. Физический размер подтверждается только калиброванной печатью или проверкой в CAD.",
    },
    en: {
      title: "Export and printing",
      summary: "Produce a correctly scaled file without printer distortion.",
      intro: "PDF is for printing, SVG for vector editing, and DXF for CAD exchange. Project JSON preserves inputs, not just lines.",
      steps: [
        "Choose A4, A3, Letter, or A0 before generating PDF.",
        "Print only the calibration page at 100% or Actual size.",
        "Disable Fit, Shrink, Scale to page, and automatic printer scaling.",
        "Measure the 50 × 50 and 100 × 100 mm squares; continue only when they match exactly.",
        "Assemble sheets by R1C1 and R1C2 coordinates, aligning the repeated 10 mm overlap.",
        "Before production, reopen DXF in the target CAD and verify millimetres, layers, closed geometry, and a known dimension.",
      ],
      bullets: [
        "DXF uses CUT, SEAM, NOTCH, GRAIN, and TEXT layers and passes an internal round-trip parse.",
        "Internal checks are not AAMA/ASTM certification and cannot guarantee a specific cutting system configuration.",
      ],
      warningTitle: "Do not measure the screen",
      warning: "On-screen scale is for viewing. Confirm physical size using a calibrated print or CAD inspection.",
    },
  },
  {
    id: "size-set",
    keywords: {
      ru: "размер градация размерный ряд xxs xs s m l xl xxl 3xl 4xl прибавка",
      en: "size grading size set xxs xs s m l xl xxl 3xl 4xl increment",
    },
    ru: {
      title: "Размерный ряд",
      summary: "Прозрачное перестроение соседних размеров по видимым прибавкам мерок.",
      intro: "Панель создаёт до трёх размеров меньше и трёх больше выбранной базы в диапазоне XXS–4XL. Каждый вариант строится заново, а не масштабируется как картинка.",
      steps: [
        "Выберите метку текущего базового размера.",
        "Задайте число меньших и больших размеров — до трёх в каждую сторону и в пределах доступных меток.",
        "Откройте шаги мерок и проверьте прибавку каждого обхвата и длины на один размер.",
        "Нажмите «Построить размерный ряд»; если вариант вышел за диапазоны модуля, измените базовые мерки, прибавки или число размеров и перестройте весь ряд.",
        "Скачайте отдельные DXF либо ZIP с DXF и паспортом manifest.json.",
      ],
      bullets: [
        "Изменение базы, фасона, A/B/C или правил делает предыдущий ряд неактуальным.",
        "Это градация по правилам мерок, но пока не промышленная поточечная градация конструктивных точек.",
      ],
      warningTitle: "Проверьте каждый размер",
      warning: "Одинаковые прибавки подходят не всем фигурам и моделям. Крайние размеры требуют отдельных макетов и примерок.",
    },
    en: {
      title: "Size set",
      summary: "Transparent redrafting of neighbouring sizes using visible measurement increments.",
      intro: "The panel creates up to three smaller and three larger sizes around a selected base within XXS–4XL. Every variant is redrafted rather than image-scaled.",
      steps: [
        "Choose the current base size label.",
        "Choose up to three smaller and larger sizes within the available labels.",
        "Open measurement steps and verify every circumference and length increment.",
        "Select Build size set; if a variant exceeds the module limits, change the base measurements, increments, or size count and rebuild the set.",
        "Download individual DXF files or a ZIP with DXF and its manifest.json audit record.",
      ],
      bullets: [
        "Changing the base, style, A/B/C, or rules invalidates the previous set.",
        "This is measurement-rule grading, not industrial construction-point grading.",
      ],
      warningTitle: "Validate every size",
      warning: "Uniform increments do not fit every body or style. Extreme sizes need separate toiles and fittings.",
    },
  },
  {
    id: "fit-privacy",
    keywords: {
      ru: "примерка макет безопасность приватность данные браузер windows офлайн лицензия эксперимент",
      en: "fit toile safety privacy data browser windows offline licence experimental",
    },
    ru: {
      title: "Примерка, статусы и приватность",
      summary: "Что приложение действительно проверяет и где заканчивается автоматическая уверенность.",
      intro: "Статус показывает степень проверки основы. «Готово к пробному образцу» не означает готовность к массовому производству, а «Экспериментальная» требует особенно осторожной примерки.",
      steps: [
        "Проверьте контрольный размер печати или CAD-файла.",
        "Сшейте первый макет из недорогого материала с максимально похожей растяжимостью и восстановлением.",
        "Оцените баланс, сопряжение швов, положение ластовицы или чашки, натяжение резинки и движение тела.",
        "Запишите изменения, обновите мерки или A/B/C и сохраните новый профиль с понятным названием.",
        "Перед публикацией шаблона отдельно проверьте права, авторство, лицензию и отсутствие личных мерок.",
      ],
      bullets: [
        "Бралетт и топ остаются экспериментальными до расширенной физической проверки.",
        "Приложение работает локально; веб и Windows хранят данные раздельно. Для резервной копии используйте экспортированные файлы.",
      ],
      warningTitle: "Честная граница",
      warning: "Численные тесты находят геометрические ошибки, но не могут почувствовать давление, поддержку, комфорт или поведение конкретной ткани на теле.",
    },
    en: {
      title: "Fitting, status, and privacy",
      summary: "What the app verifies and where automated confidence ends.",
      intro: "Status communicates validation maturity. Ready for a toile does not mean mass-production ready, while Experimental requires extra fitting care.",
      steps: [
        "Verify a known dimension on the print or CAD file.",
        "Sew the first toile in inexpensive material with closely matching stretch and recovery.",
        "Assess balance, seam matching, gusset or cup position, elastic tension, and movement.",
        "Record changes, update measurements or A/B/C, and save a clearly named new profile.",
        "Before publishing a template, verify rights, authorship, licence, and absence of personal measurements.",
      ],
      bullets: [
        "Bralette and crop-top bases remain experimental until broader physical validation.",
        "The app works locally; web and Windows storage are separate. Use exported files for backup.",
      ],
      warningTitle: "Honest boundary",
      warning: "Numeric tests detect geometry errors but cannot feel pressure, support, comfort, or the behaviour of a specific fabric on a body.",
    },
  },
];

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .trim();
}

function localizedTopic(topic, language) {
  const locale = language === "en" ? "en" : "ru";
  const content = topic[locale];
  return {
    id: topic.id,
    ...content,
    keywords: topic.keywords[locale],
  };
}

export function getHelpTopics(language = "ru") {
  return topics.map((topic) => localizedTopic(topic, language));
}

export function isHelpTopicId(topicId) {
  return HELP_TOPIC_IDS.includes(topicId);
}

export function searchHelpTopics(query, language = "ru") {
  const words = normalize(query).split(/\s+/u).filter(Boolean);
  const localized = getHelpTopics(language);
  if (!words.length) return localized;
  return localized
    .map((topic, index) => {
      const title = normalize(topic.title);
      const summary = normalize(topic.summary);
      const keywords = normalize(topic.keywords);
      const details = normalize([
        topic.intro,
        ...topic.steps,
        ...topic.bullets,
        topic.warningTitle,
        topic.warning,
      ].join(" "));
      const haystack = `${title} ${summary} ${keywords} ${details}`;
      if (!words.every((word) => haystack.includes(word))) return null;

      const score = words.reduce((total, word) => total
        + (title.includes(word) ? 8 : 0)
        + (keywords.includes(word) ? 5 : 0)
        + (summary.includes(word) ? 3 : 0)
        + (details.includes(word) ? 1 : 0), 0);
      return { topic, score, index };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ topic }) => topic);
}

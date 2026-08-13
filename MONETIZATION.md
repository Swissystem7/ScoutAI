# ScoutAI — מחקר מונטיזציה (נתיב חוקי בלבד)

_נבדק לאחרונה: 13.8.2026._  
מסמך זה הוא מחקר מקורות פומביים, לא ייעוץ משפטי ולא תחזית הכנסות. הציטוטים מאנגלית הם מהמקור; התרגום לעברית הוא עזר בלבד.

**פסק הדין:** יש נתיב הכנסה חוקי. הוא **לא** מכירת דוחות, דירוגים או SaaS על StatsBomb Open Data. הוא הוראה, ייעוץ, וסדנה/כלי שרצים על **נתונים שהמשתמש רישיין בעצמו**, בתוספת תרומה/חסויות לכלי החינמי — בלי למכור את הנתונים הפתוחים ואת הניתוח שנגזר מהם.

---

## 1. רישיון StatsBomb Open Data — מה כתוב במדויק

**מקור הרישיון:** [LICENSE.pdf ב־hudl/open-data](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)  
**הורדה ישירה:** [raw LICENSE.pdf](https://raw.githubusercontent.com/hudl/open-data/master/LICENSE.pdf) (165,130 בתים, 5 עמודים; נמשך וחולץ ב־13.8.2026).  
**כותרת המסמך:** *StatsBomb Public Data User Agreement*.  
**עדכון אחרון במסמך עצמו:** «StatsBomb Data: User Agreement Standard Terms — last updated **8 September 2023**».  
**המאגר הציבורי:** [github.com/hudl/open-data](https://github.com/hudl/open-data) (נבדק 13.8.2026).  
**README של המאגר** (נבדק 13.8.2026): הנתונים «freely available for public use for **research projects and genuine interest in football analytics**». תנאי הפרסום: «If you publish, share or distribute any research, analysis or insights based on this data, please state the data source as StatsBomb and use our logo».

### ציטוטים מחייבים (אנגלית, מה־PDF)

מטרת השירות:

> StatsBomb have made this data freely available and accessible to encourage and facilitate research and the shared analytical understanding of the game of Football. This is aimed to be a research tool, and is intended to be used as such.

סעיף 1.1 — למה מותר להשתמש:

> StatsBomb will provide the User with access to the Service to be used for **analysis, research and to facilitate the shared ideas & understanding of the data**.

סעיף **1.2.1** — אסור למסור או למכור את הנתונים:

> The User may not: **edit, distort, distribute, reproduce, sell or in any way provide the data to any external or third party**.

סעיף **1.2.2** — אסור ניצול מסחרי של הנתונים **ושל ניתוח נגזר**:

> The User may not: **commercially exploit the data or any analysis derived from the use of the Service**.

סעיף 1.4 — חובת קרדיט:

> The User is required to accredit any publication of analysis formed from StatsBomb Data with the StatsBomb brand logo.

סעיף 7 — קניין רוחני, איסור מכירה גם בניסוח רחב:

> The User acknowledges and agrees that all data provided through the Service, is the property of StatsBomb. The User shall, except as expressly permitted herein, shall not modify, translate, transfer, distribute, license, **sell or otherwise exploit for any purposes whatsoever** any data, content or third party submissions or other proprietary rights not owned by the User: (i) **without the express prior written consent of StatsBomb**, and (ii) in any way that violates any third party right.

סעיף 9 — דין חל: חוקי אנגליה וויילס, סמכות בתי המשפט באנגליה.  
StatsBomb Services Ltd, חברה 10377735.

### תרגום עזר (לא משפטי)

- מותר: מחקר, ניתוח, שיתוף ציבורי של תובנות, עם קרדיט ולוגו.
- אסור: למכור את הקבצים, להפיץ אותם לצד שלישי, **ולנצל מסחרית את הנתונים או כל ניתוח שנגזר מהשימוש בשירות**.
- אסור גם: למכור / לרשיין / לנצל לכל מטרה שהיא נתונים שאינם בבעלות המשתמש, בלי הסכמה בכתב מראש מ־StatsBomb.

### מה זה אומר ל־ScoutAI בפועל

| פעולה | מותר? | למה |
|---|---|---|
| דמו חינמי ב־GitHub Pages על מונדיאל 2018, עם קרדיט, בלי paywall | כן, כמחקר/לימוד ציבורי | ס' 1.1 + README |
| למכור דוח / דירוג / PDF / מנוי על ציוני Impact ממונדיאל 2018 | **לא** | ס' 1.2.2 — זה ניתוח נגזר |
| לגבות תשלום כדי «לפתוח» את טבלת ה־Open Data | **לא** | ס' 1.2.1 + 1.2.2 |
| קורס בתשלום שחומר הלימוד שלו הוא דירוגי Open Data | **לא** | «commercially exploit … any analysis derived» |
| ללמד *מתודולוגיה* (משקלות, /90, תקרה, הטיית עמדה, מדגם מוחזק) על נתוני צעצוע או על נתוני התלמיד | כן, בזהירות | לא מוכרים את נתוני StatsBomb ולא את הניתוח שנגזר מהם |
| כלי שרץ **בדפדפן של המשתמש** על קובץ שהוא רישיין בעצמו | כן | הקוד MIT; הנתונים אינם של StatsBomb |
| ייעוץ לקבוצה/סוכן על נתונים שהם שילמו עליהם (Wyscout / Hudl Statsbomb מסחרי / מנהלת / איסוף עצמי) | כן | אותם נתונים «owned by the User» לעניין הרישיון שלהם |
| תרומה / GitHub Sponsors לתחזוקת הכלי החינמי | כן, אם לא נמכרת גישה לנתונים | תרומה לתחזוקה ≠ מכירת ניתוח נגזר |
| קישור שותפים לקורס *שלהם* של Hudl Statsbomb או לספורט פאנל, עם גילוי נאות | כן עקרונית | לא מוכרים Open Data; חובה גילוי |

**אין נתיב חוקי למכור את מה שהדמו מציג היום על מונדיאל 2018.**  
**יש נתיב חוקי למכור הוראה והרצת הכלי על נתונים שאינם Open Data.**

הערה: גם [תנאי קורסי Hudl Statsbomb](https://courses.statsbomb.com/pages/terms) (נבדק דרך תוצאות חיפוש 13.8.2026) אוסרים להעתיק/למכור חומרי קורס ונתונים של הפלטפורמה. קישור לקורס שלהם אינו העתקה של החומר.

---

## 2. נתונים אחרים בריפו — גם הם לא «מוצר למכירה»

- **FBref / Sports Reference.** בריפו יש קובץ מחקר בארכיון `attic/research-data/fbref_big5_2024-2025.json` (לא נטען בדמו). [מדיניות השימוש בנתונים](https://www.sports-reference.com/data_use.html) (נבדק 13.8.2026) מצטטת את סעיף 5 לתנאי האתר ואוסרת במפורש ליצור מאגר או שירות שמתחרה באתר או בספקי הנתונים שלו, ואוסרת שימוש בתוכן לאימון מודלי AI. המדיניות גם אומרת: «you should not create websites or tools based on data you scrape from Sports Reference». **אין למכור ניתוח על הקובץ הזה.**
- **Wyscout / Opta / Hudl Statsbomb המסחרי.** אלה מוצרים בתשלום למועדון/סקאוט. המשתמש יכול להביא *את* הייצוא שלו אם הרישיון *שלו* מתיר עיבוד מקומי. ScoutAI לא יארח ולא ימכור את הנתונים האלה.
- **כיסוי ישראלי ב־Open Data.** ב־[competitions.json](https://github.com/hudl/open-data/blob/master/data/competitions.json) אין ליגת על, לאומית או נוער ישראלי (נבדק במחקר הקודם בריפו, 13.8.2026). גם לכן אין מה למכור לסוכן ישראלי על בסיס מונדיאל 2018.

---

## 3. מה גובים בישראל על חינוך אנליטיקת ספורט

נבדק 13.8.2026. מחירים שלא מופיעים באתר הרשמי מסומנים ככאלה.

### 3.1 מכללת ספורט פאנל — הקורס הרלוונטי ביותר

- דף הקורס: [sportpanel.co.il/scouting](https://www.sportpanel.co.il/scouting) (נבדק 13.8.2026).
- **22 מפגשים שבועיים × 5 שעות אקדמיות**, חלק בשטח וחלק מצולמים. כתובת: אימבר 14, פתח תקווה. ערב או שישי בוקר. אפשרות אונליין «לפרטים צרו קשר».
- מנהל מקצועי: אורי קופר. מוכר **בלעדית** ע״י מנהלת הליגות לכדורגל, ומוכר לפיקדון חיילים משוחררים.
- **הנחה מפורסמת:** 500 ₪ למאמני כדורגל. **מחיר מלא אינו מופיע בדף** (נבדק 13.8.2026).
- בוגר זכאי לדף ב־[myscout.co.il](https://www.myscout.co.il/).
- ב־[myscout / הכשרות](https://myscout.co.il/%D7%94%D7%9B%D7%A9%D7%A8%D7%95%D7%AA/) עדיין כתוב «משך הקורס – 15 מפגשים» — **סתירה מול 22 בדף הנוכחי של ספורט פאנל**. לא ליישב את הסתירה; לציין אותה.
- מחיר היסטורי בפוסט פייסבוק של המכללה (לא מתוארך בוודאות מהתצוגה הציבורית; [קישור לפוסט](https://www.facebook.com/sportpanel/posts/979086715591783/)): «עלות הקורס בהרשמה מוקדמת 6900 והחל מחודש פברואר 8200». **זה לא מחיר מאומת ל־2026.**

**מסקנה:** ספורט פאנל הוא הקורס העברי המוכר לסקאוטינג/אנליסט כדורגל. ScoutAI לא מתחרה בו ולא מעניק תעודה של מנהלת הליגות. הוא השלמה אפשרית *אחרי* הקורס: איך בונים מדד שקוף בלי לשקר לגבי התוקף.

### 3.2 myscout.co.il

- [myscout.co.il](https://www.myscout.co.il/) — שוק אנליסטים מוסמכים לקבוצות ולשחקנים, לא כלי תוכנה.
- [הכשרות](https://myscout.co.il/%D7%94%D7%9B%D7%A9%D7%A8%D7%95%D7%AA/): מפנה לספורט פאנל (סקאוטינג; אנליסט אישי 22 מפגשים, אוהד אפרת; תקשורת ספורט, נדב יעקבי). **אין מחיר בדף.**
- קהל היעד של ScoutAI לפי ה־PIVOT: בוגרי הספורט פאנל וקהל myscout שצריכים ללמוד לבנות מדד, לא לקנות מדד מוכן.

### 3.3 מכון וינגייט — התוכנית הלאומית לאנליסטים בספורט

- דף: [wingate.org.il/trainers_school/sports-analytics](https://wingate.org.il/trainers_school/sports-analytics/) (נבדק 13.8.2026).
- **מחיר מפורסם: 9,482 ₪ + 440 ₪ דמי הרשמה.** 210 שעות. רכז: אורי אבולפיא.
- זה מסלול רחב (Sport Analytics), לא קורס סקאוטינג כדורגל מוכר למנהלת. בסגל מופיעים בין השאר גל וקסלבלט (מכבי חיפה) ואורין מונק (הפועל ירושלים כדורגל).
- 14 נקודות זיכוי לתואר במרכז האקדמי למשפט ועסקים (תנאי ממוצע בגרות).

### 3.4 קורסים באנגלית כעוגן מחיר ל«מבוא קצר»

- Hudl Statsbomb, *Introduction to Football Analytics*: **£60** כולל מס, 5 מודולים, תעודת השלמה. [דף הקורס](https://courses.statsbomb.com/courses/introduction-to-football-analytics) (נבדק 13.8.2026). «No student discounts or refunds».
- Hudl Statsbomb, *Modern Scouting and Data-Driven Recruitment*: **£360** כולל מס, 9 מודולים. [דף הקורס](https://courses.statsbomb.com/courses/modern-scouting-and-data-driven-recruitment) (נבדק 13.8.2026).
- לא נמצא קורס אנליטיקת כדורגל אינטראקטיבי בעברית שמסביר בניית מדד מרוכב שקוף, מלבד המעבדה החינמית של ScoutAI עצמה (חיפוש 13.8.2026: ספורט פאנל / myscout / וינגייט / «קורס אנליטיקס כדורגל עברית»).

### 3.5 כלי סקאוטינג מסחריים (לא מתחרים, הקשר רישוי)

- [מחירון Wyscout הרשמי](https://www.hudl.com/en_gb/products/wyscout/pricing) (נבדק 13.8.2026): Copper / Mercury / Gold / Diamond לפי דקות וידאו; **המחיר הכספי באתר הוא «Request a quote» / «Subscribe Now»**, בלי סכום בדולרים בדף הזה.
- דיווחים משניים (לא האתר הרשמי): SoccerEDU (עודכן אצלה 9.3.2026) מציינת Copper כ־$325/שנה; 360scouting (31.1.2025) מציינת Copper €299/שנה ו־Mercury €399/שנה. **לא לאמץ כמחיר רשמי.**
- נתוני Hudl Statsbomb המסחריים נמכרים ברמת ליגה; אין מחירון ציבורי. ראו [hudl.com/products/statsbomb](https://www.hudl.com/products/statsbomb).

---

## 4. האם מישהו מוכר חינוך אנליטיקה בעברית?

**כן, אבל לא את אותו מוצר.**

| גוף | מה נמכר | עברית? | מחיר פומבי | הערת בידול |
|---|---|---|---|---|
| ספורט פאנל | קורס סקאוטינג/אנליסט כדורגל, 22 מפגשים, תעודת מנהלת | כן | לא באתר; הנחה 500 ₪ למאמנים | מקצועי, מוכר, ארוך |
| myscout | שוק אנליסטים + הפניה להכשרות | כן | לא | לא כלי מדד |
| וינגייט | אנליסט ספורט כללי, 210 שעות | כן | 9,482+440 ₪ | לא ייעודי לכדורגל |
| Hudl Statsbomb Courses | מבוא אנליטיקה / סקאוטינג מודרני | לא (יש ספרדית למבוא) | £60 / £360 | אנגלית, פלטפורמה שלהם |
| ScoutAI (מצב נוכחי) | מעבדת מדד שקופה בדפדפן | כן | חינם | לא מוכר, לא מוסמך, Open Data |

פער שנשאר פתוח: **סדנה קצרה בעברית על יושרת מדד** (משקלות, /90, תקרה, הטיית עמדה, מדגם מוחזק, «מה אסור להכריז») לבוגרי ספורט פאנל — בלי תעודת מנהלת ובלי למכור דירוג מוכן.

---

## 5. חסויות, תרומות, שותפים — מה מותר לכלי חינוכי חינמי

### 5.1 GitHub Sponsors

- תיעוד: [About GitHub Sponsors](https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors) (נבדק 13.8.2026).
- **ישראל ברשימת האזורים הנתמכים** לקבלת כסף.
- 0% עמלה על חסות מחשבון אישי; עד 6% על חסות מארגון.
- חשבון [Swissystem7](https://github.com/Swissystem7) — **אין דף Sponsors פעיל** (`has_sponsors_listing: false`, נבדק ב־API ב־13.8.2026). אסור להציג כפתור «Sponsors» כאילו כבר פתוח.
- מסגור חוקי: תרומה לתחזוקת כלי לימוד חינמי. מסגור אסור: «שלמו כדי לראות את דירוג מונדיאל 2018».

### 5.2 שותפים (affiliate)

- לא נמצא תוכנית שותפים פומבית של ספורט פאנל, של Wyscout או של קורסי Statsbomb (חיפוש 13.8.2026).
- אם תיפתח תוכנית כזו בעתיד, חובה גילוי נאות:
  - **ישראל:** חוק הגנת הצרכן, התשמ״א–1981, סעיף 2 (איסור הטעיה). הנחיית הרשות להגנת הצרכן ולסחר הוגן מ־5.1.2021 על חוות דעת ודירוגים ברשת, לרבות משפיענים: [הודעת הרשות](https://www.gov.il/he/departments/news/cpfta_internetopinion2021). סימון מקובל: «פרסום ממומן» / «שיתוף בתשלום» בסמוך לקישור.
  - **ארה״ב (אם יש קהל שם):** [FTC Endorsement Guides](https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews) — גילוי קשר מהותי ליד הקישור, לא רק בפוטר.

### 5.3 חסות מועדון / מחלקת נוער / המכללה

מודל מוכר לכלים חינוכיים חינמיים: גוף משלם על תחזוקה ועל אזכור («המעבדה בתמיכת X»), בזמן שהכלי נשאר חינמי. זה חוקי כל עוד החסות אינה תמורה לניתוח נגזר מ־Open Data, ויש גילוי. **אין הסכם חסות פתוח כרגע — לא להמציא לוגו.**

---

## 6. מה אפשר למכור עכשיו, בלי לבדות ביקוש

נתיבים עם בסיס במחקר **וברישיון**:

1. **סדנת מתודולוגיה חיה בעברית** (קצרה, לא מוסמכת) לבוגרי ספורט פאנל / אנליסטים ב־myscout. החומר בתשלום הוא ההוראה, לא טבלת מונדיאל 2018. תרגול על נתוני התלמיד או על קובץ סינתטי.
2. **ייעוץ חד־פעמי** לבניית מדד על נתונים שהלקוח רישיין (ייצוא Wyscout, קובץ מנהלת, ספירות ידניות).
3. **הכלי עצמו במצב «הביאו נתונים משלכם»** — חינמי בקוד פתוח (MIT); אפשר לגבות על ליווי, לא על ה־Open Data.
4. **תרומה לתחזוקה** (GitHub Sponsors אחרי פתיחת פרופיל) — בלי paywall.

נתיבים **סגורים**:

- 49 ₪ לדוח על Open Data (נדחה כבר ב־README).
- מנוי לדירוג חי על מונדיאל 2018.
- «AI סקאוטינג» או ניתוח וידאו — הדמו לא עושה את זה.
- מכירת קבצי `data/wc2018_event_aggregates.json` או `attic/research-data/fbref_big5_2024-2025.json`.

**אין נרשמים, אין הכנסה, אין הסכם חסות נכון ל־13.8.2026.** אם הדף מציע סדנה — זו הצעה, לא קופה.

### מחיר מוצע לסדנה (עוגן, לא ולידציה)

- מתחת לקורס המלא של ספורט פאנל (אלפי שקלים, 22 מפגשים) ומתחת לוינגייט (9,922 ₪ כולל הרשמה).
- בסדר גודל של מבוא Statsbomb (£60) עד קצת מעליו, כי זו סדנה חיה בעברית ולא וידאו מוקלט.
- **הצעת מחיר פומבית ליישום: 490 ₪ לאדם, סדנה של כ־3 שעות, עד 8 משתתפים.** תשלום מחוץ לאתר אחרי פנייה. אם לא יהיו פונים — זו הצעה שלא נמכרה, לא כישלון מוסתר.

---

## 7. מה מיושם בריפו בעקבות המחקר

- `licence.html` — מה מותר ומה אסור, עם הציטוטים.
- `offer.html` — הצעת סדנה/ייעוץ בלי הרשמה מזויפת ובלי סליקה.
- מצב **הביאו נתונים משלכם** ב־`index.html` / `demo.js`: הקובץ נשאר במחשב; אם הקובץ מזוהה כ־Open Data הוא **לא** מקבל תווית מסחרית.
- דוגמה סינתטית ב־`data/user-dataset.example.json` (לא נתוני משחק אמיתיים).

---

## 8. מקורות שנפתחו (תאריך בדיקה)

| מקור | תאריך בדיקה | קישור |
|---|---|---|
| StatsBomb Public Data User Agreement (PDF, עודכן 8.9.2023) | 13.8.2026 | https://github.com/hudl/open-data/blob/master/LICENSE.pdf |
| hudl/open-data README | 13.8.2026 | https://github.com/hudl/open-data |
| ספורט פאנל — קורס אנליסטים וסקאוטינג | 13.8.2026 | https://www.sportpanel.co.il/scouting |
| myscout — הכשרות | 13.8.2026 | https://myscout.co.il/%D7%94%D7%9B%D7%A9%D7%A8%D7%95%D7%AA/ |
| וינגייט — אנליסט ספורט | 13.8.2026 | https://wingate.org.il/trainers_school/sports-analytics/ |
| Statsbomb Courses — Introduction (£60) | 13.8.2026 | https://courses.statsbomb.com/courses/introduction-to-football-analytics |
| Statsbomb Courses — Modern Scouting (£360) | 13.8.2026 | https://courses.statsbomb.com/courses/modern-scouting-and-data-driven-recruitment |
| Wyscout pricing (רשמי, בלי סכום) | 13.8.2026 | https://www.hudl.com/en_gb/products/wyscout/pricing |
| Sports Reference data use | 13.8.2026 | https://www.sports-reference.com/data_use.html |
| GitHub Sponsors — אזורים (כולל ישראל) | 13.8.2026 | https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors |
| הנחיית רשות הגנת הצרכן, 5.1.2021 | 13.8.2026 | https://www.gov.il/he/departments/news/cpfta_internetopinion2021 |
| FTC endorsements | 13.8.2026 | https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews |

סוף המחקר. אם הרישיון של Open Data היה אוסר גם הוראה על מתודולוגיה כללית או כלי על נתוני המשתמש — היה נכתב כאן «אין נתיב הכנסה חוקי». זה לא המצב. הנתיב הקיים דורש יושר: לא למכור את מונדיאל 2018.
